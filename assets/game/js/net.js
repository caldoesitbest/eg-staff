/* Co-op networking. Lobbies run over Supabase Realtime (the site's own project): a room code, who's
   in it, and the WebRTC handshake. After that, players talk directly (peer-to-peer). Everyone connects
   to the host (a star): the host's game runs the world, the others send their controls.
   Realtime only ever carries a few dozen tiny messages per lobby, so it stays well inside the free plan.

   Channels per player: "u" (unreliable, unordered: snapshots + controls, a late one is useless) and
   "r" (reliable, ordered: lobby, start, cards/shop ready, game over). */

const ICE = [{ urls: "stun:stun.cloudflare.com:3478" }, { urls: "stun:stun.l.google.com:19302" }];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX = 4;

const rid = (n) => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export const net = {
  role: "off",        // "off" | "host" | "client"
  code: "",
  id: "",
  name: "",
  suit: "classic",
  hostId: "",
  members: [],        // host's list: [{ id, name, suit, slot }]
  peers: new Map(),   // id -> { pc, u, r, name, suit, slot, open, pending: [] }
  ch: null,
  on: { lobby: null, message: null, status: null, left: null, closed: null },

  get available() { return !!(window.EG && window.EG.sb && window.RTCPeerConnection); },
  get connected() { for (const p of this.peers.values()) if (p.open) return true; return false; },

  status(text, kind) { if (this.on.status) this.on.status(text, kind || ""); },

  // ---------------------------------------------------------------- lobby (Realtime)
  async openChannel(code) {
    const sb = window.EG.sb, rt = sb.realtime;
    // Lobbies never need your account, so they join with the site's public key: the server refuses a
    // signed-in session whose token has gone stale (a long-open window, a laptop that slept).
    try { await rt.setAuth(window.EG_CONFIG.SUPABASE_KEY); } catch (e) { /* older client: keeps the session token */ }
    let why = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) {
        // start the connection over: a socket left half-open by sleep or a network change stalls every join
        try { rt.disconnect(); } catch (e) { /* ignore */ }
        this.status("Retrying the lobby server…");
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
      const ch = sb.channel("glider-lobby-" + code, { config: { broadcast: { self: false }, presence: { key: this.id } } });
      ch.on("broadcast", { event: "sig" }, ({ payload }) => this.onSignal(payload));
      ch.on("presence", { event: "sync" }, () => this.onPresence());
      const res = await new Promise((done) => {
        const t = setTimeout(() => done({ s: "TIMED_OUT" }), 10000);
        ch.subscribe((s, err) => { if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") { clearTimeout(t); done({ s, err }); } });
      });
      if (res.s === "SUBSCRIBED") { this.ch = ch; return ch; }
      why = res.err && res.err.message ? res.err.message : res.s === "TIMED_OUT" ? "no answer" : res.s.toLowerCase();
      try { sb.removeChannel(ch); } catch (e) { /* ignore */ }
    }
    throw new Error("Couldn't reach the lobby server (" + why + "). Check your connection and try again.");
  },
  signal(to, data) {
    if (!this.ch) return;
    this.ch.send({ type: "broadcast", event: "sig", payload: { ...data, to, from: this.id } }).catch(() => {});
  },
  /** Leaves Realtime once everyone's connected directly (frees the connection; the game doesn't need it). */
  closeChannel() {
    if (!this.ch) return;
    const ch = this.ch;
    this.ch = null;
    try { ch.untrack(); } catch (e) { /* ignore */ }
    try { window.EG.sb.removeChannel(ch); } catch (e) { /* ignore */ }
  },

  /** Make a lobby. Resolves with the room code. */
  async host(name, suit) {
    this.reset();
    this.role = "host";
    this.id = "h" + rid(8);
    this.name = name; this.suit = suit;
    this.hostId = this.id;
    this.code = rid(5);
    this.members = [{ id: this.id, name, suit, slot: 0 }];
    this.status("Opening a lobby…");
    await this.openChannel(this.code);
    await this.ch.track({ name, host: true, at: Date.now() });
    this.status("Lobby open. Share the code.", "ok");
    this.lobbyChanged();
    return this.code;
  },

  /** Join a lobby by code. Resolves once connected to the host. */
  async join(code, name, suit) {
    this.reset();
    this.role = "client";
    this.id = "c" + rid(8);
    this.name = name; this.suit = suit;
    this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    this.status("Looking for lobby " + this.code + "…");
    await this.openChannel(this.code);
    await this.ch.track({ name, host: false, at: Date.now() });
    // the host shows up in presence; then we call it
    const hostId = await new Promise((res) => {
      let n = 0;
      const look = () => {
        const st = this.ch ? this.ch.presenceState() : {};
        for (const k in st) if (st[k].some((m) => m.host)) return res(k);
        if (++n > 40) return res("");
        setTimeout(look, 200);
      };
      look();
    });
    if (!hostId) { this.leave(); throw new Error("No open lobby with that code."); }
    this.hostId = hostId;
    this.status("Connecting to the host…");
    await this.callHost();
  },

  onPresence() {
    if (this.role !== "host" || !this.ch) return;
    // someone left the lobby before connecting
    const st = this.ch.presenceState();
    for (const [id, p] of this.peers) if (!p.open && !st[id]) this.dropPeer(id);
  },

  // ---------------------------------------------------------------- WebRTC
  makePc(peerId) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (ev) => { if (ev.candidate) this.signal(peerId, { t: "ice", c: ev.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "closed" || s === "disconnected") {
        // "disconnected" can recover; give it a moment
        if (s === "disconnected") setTimeout(() => { if (pc.connectionState === "disconnected") this.lost(peerId); }, 5000);
        else this.lost(peerId);
      }
    };
    return pc;
  },

  wire(peerId, peer, dc) {
    dc.binaryType = "arraybuffer";
    if (dc.label === "u") peer.u = dc; else peer.r = dc;
    dc.onmessage = (ev) => {
      let msg = ev.data;
      if (typeof msg === "string") { try { msg = JSON.parse(msg); } catch (e) { return; } }
      if (this.on.message) this.on.message(peerId, msg);
    };
    dc.onopen = () => {
      if (peer.u && peer.r && peer.u.readyState === "open" && peer.r.readyState === "open" && !peer.open) {
        peer.open = true;
        this.peerOpen(peerId, peer);
      }
    };
    dc.onclose = () => this.lost(peerId);
  },

  async callHost() {
    const peer = { pc: null, u: null, r: null, open: false, pending: [] };
    const pc = this.makePc(this.hostId);
    peer.pc = pc;
    this.peers.set(this.hostId, peer);
    this.wire(this.hostId, peer, pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 }));
    this.wire(this.hostId, peer, pc.createDataChannel("r", { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    this.signal(this.hostId, { t: "offer", sdp: pc.localDescription.sdp, name: this.name, suit: this.suit });
    // if nothing connects in 20s, say so (some networks block direct connections)
    await new Promise((res, rej) => {
      const t = setTimeout(() => { if (!peer.open) rej(new Error("Couldn't connect to the host directly. One of your networks may block peer-to-peer.")); }, 20000);
      peer.onOpen = () => { clearTimeout(t); res(); };
    });
  },

  async onSignal(m) {
    if (!m || m.to !== this.id) return;
    let peer = this.peers.get(m.from);
    try {
      if (m.t === "offer" && this.role === "host") {
        if (this.members.length + [...this.peers.values()].filter((p) => !p.open).length >= MAX) { this.signal(m.from, { t: "full" }); return; }
        peer = { pc: this.makePc(m.from), u: null, r: null, open: false, pending: [], name: String(m.name || "Pilot").slice(0, 20), suit: m.suit || "classic" };
        this.peers.set(m.from, peer);
        peer.pc.ondatachannel = (ev) => this.wire(m.from, peer, ev.channel);
        await peer.pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.signal(m.from, { t: "answer", sdp: peer.pc.localDescription.sdp });
        for (const c of peer.pending) peer.pc.addIceCandidate(c).catch(() => {});
        peer.pending.length = 0;
      } else if (m.t === "answer" && peer) {
        await peer.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
        for (const c of peer.pending) peer.pc.addIceCandidate(c).catch(() => {});
        peer.pending.length = 0;
      } else if (m.t === "ice" && peer) {
        if (peer.pc.remoteDescription) peer.pc.addIceCandidate(m.c).catch(() => {});
        else peer.pending.push(m.c);
      } else if (m.t === "full") {
        this.status("That lobby is full (4 players).", "bad");
        this.leave();
      }
    } catch (e) {
      this.status("Connection trouble: " + (e && e.message), "bad");
    }
  },

  peerOpen(id, peer) {
    if (this.role === "client") {
      this.status("Connected.", "ok");
      if (peer.onOpen) peer.onOpen();
      return;
    }
    // host: give them a slot
    const used = new Set(this.members.map((m) => m.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    peer.slot = slot;
    this.members.push({ id, name: peer.name, suit: peer.suit, slot });
    this.lobbyChanged();
  },

  lost(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.dropPeer(id);
    if (this.role === "client" && id === this.hostId) {
      this.role = "off";
      if (this.on.closed) this.on.closed("The host left the game.");
      return;
    }
    if (this.role === "host") {
      const i = this.members.findIndex((m) => m.id === id);
      if (i >= 0) {
        const m = this.members[i];
        this.members.splice(i, 1);
        if (this.on.left) this.on.left(m);
        this.lobbyChanged();
      }
    }
  },
  dropPeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    try { peer.pc.close(); } catch (e) { /* ignore */ }
  },

  /** Host: takes a player out of the party (they're told). */
  kick(id) {
    if (this.role !== "host" || id === this.id || !this.peers.has(id)) return;
    this.send(id, { k: "kick" }, true);
    setTimeout(() => this.lost(id), 200);      // once the message is on its way
  },
  /** Host, back in the Hangar after a run: opens the lobby again so more friends can join. */
  async reopen() {
    if (this.role !== "host" || this.ch) return;
    await this.openChannel(this.code);
    await this.ch.track({ name: this.name, host: true, at: Date.now() });
  },

  lobbyChanged() {
    if (this.role === "host") this.broadcast({ k: "lobby", members: this.members, code: this.code }, true);
    if (this.on.lobby) this.on.lobby(this.members);
  },

  // ---------------------------------------------------------------- sending
  send(id, msg, reliable) {
    const peer = this.peers.get(id);
    if (!peer || !peer.open) return;
    const dc = reliable ? peer.r : peer.u;
    if (!dc || dc.readyState !== "open") return;
    if (!reliable && dc.bufferedAmount > 262144) return;      // congested: skip this one, the next is fresher
    try { dc.send(typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)); } catch (e) { /* closing */ }
  },
  broadcast(msg, reliable) {
    const data = typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg);
    for (const id of this.peers.keys()) this.send(id, data, reliable);
  },
  toHost(msg, reliable) { this.send(this.hostId, msg, reliable); },

  // ---------------------------------------------------------------- leaving
  reset() {
    this.closeChannel();
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    this.members = [];
    this.role = "off";
    this.hostId = "";
  },
  leave() {
    if (this.role !== "off") this.broadcast({ k: "bye" }, true);
    this.reset();
  },
};
