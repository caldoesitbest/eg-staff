/* Friends, who's online, and party invites (4.4). It all runs over the site's own Supabase Realtime, with no
   new tables or server code, and every call fails soft: a social hiccup never touches a run.

   Who you are: a signed-in player gets a friend key (a hash of the account id; the id itself never leaves the
   device) and a friend code made from that key, like ABCD-EFGH. You share the code; only friends learn the key.
   - Your door, "egf-d-CODE": requests, replies and invites for you arrive here.
   - Your light, "egf-p-" + key: you're present on it while you're online, and your friends watch it. Finding
     it takes your key, which only friends have, so only friends see that you're on and what you're doing.
   - Becoming friends: the request carries a one-time public key (ECDH P-256). The reply and the confirmation
     each carry that side's friend key, encrypted with the shared secret, and each side checks that the key
     really makes the other's code. Someone who only knows a code, or listens at a door, can't read the keys
     or pass as either player.
   - After that, everything between two friends (invites, "remove") is encrypted with AES-GCM under a key
     only the two of them can make, which also proves who sent it.
   What it can't do without a server: a request only gets through while both players are online (it's retried
   every 45 seconds for a week); friend lists are kept on each device (on a new device your friends restore it
   when they see you online); and a friend, who knows your key, could pretend to be you to your other friends. */

import { G } from "./state.js";
import { store } from "./storage.js";
import { online } from "./online.js";
import { level } from "./xp.js";

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";       // no 0/O or 1/I to mix up
const MAX_FRIENDS = 60;
const MAX_INCOMING = 30;
const RETRY_MS = 45000;
const REQUEST_DAYS = 7;
const INVITE_MS = 10 * 60000;                          // an invite is good for ten minutes
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------------------------------------------------------------------- small helpers
export const cleanCode = (s) => {
  const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return c.length === 8 && [...c].every((ch) => B32.includes(ch)) ? c : "";
};
export const fmtCode = (c) => (c ? c.slice(0, 4) + "-" + c.slice(4) : "");
/** The friend code a teammate's look carries ("…/~CODE"), if they let teammates add them. */
export const tagOf = (look) => { const m = /\/~([A-Z0-9]{8})(?:\/|$)/.exec(String(look || "")); return m ? cleanCode(m[1]) : ""; };
const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 10);
const clip = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, "").slice(0, n);

const cryptoOk = () => !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false);
async function sha(str) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(str))); }
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
function toB32(bytes, n) {
  let out = "", acc = 0, bits = 0;
  for (const x of bytes) {
    acc = ((acc << 8) | x) & 0xffff; bits += 8;
    while (bits >= 5 && out.length < n) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= n) break;
  }
  return out;
}
const b64 = (u8) => { let s = ""; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(String(s || "")), (c) => c.charCodeAt(0));
const keys = new Map();       // derived AES keys, by what they were made from
async function aes(label) {
  if (!keys.has(label)) keys.set(label, crypto.subtle.importKey("raw", await sha(label), "AES-GCM", false, ["encrypt", "decrypt"]));
  return keys.get(label);
}
const pairKey = (a, b) => aes("egf-pair:" + [a, b].sort().join(":"));
const selfKey = (k) => aes("egf-self:" + k);
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
  return { iv: b64(iv), ct: b64(ct) };
}
async function unseal(key, box) {
  try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct)))); } catch (e) { return null; }
}
const EC = { name: "ECDH", namedCurve: "P-256" };
async function ephemeral() {
  const kp = await crypto.subtle.generateKey(EC, true, ["deriveBits"]);
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { pub: { x: pub.x, y: pub.y }, priv: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}
async function handshakeKey(privJwk, pub) {
  try {
    const priv = await crypto.subtle.importKey("jwk", privJwk, EC, false, ["deriveBits"]);
    const pk = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: String(pub.x), y: String(pub.y), ext: true }, EC, false, []);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pk }, priv, 256));
    return aes("egf-hs:" + toHex(bits));
  } catch (e) { return null; }
}
export async function codeOf(key) { return toB32(await sha("egf-code:" + key), 8); }

// ---------------------------------------------------------------------------- saved state
function prefs() {
  const s = store.data.social || (store.data.social = { prefs: {}, acct: {} });
  s.prefs = { offline: false, partyOpen: false, requests: true, discover: false, shareTag: true, askedDiscover: false, online: true, ...(s.prefs || {}) };
  return s.prefs;
}
function acct(code) {
  const s = store.data.social;
  if (!s.acct) s.acct = {};
  const a = s.acct[code] || (s.acct[code] = {});
  for (const k of ["friends", "inc", "out", "acc", "blocked"]) if (!a[k] || typeof a[k] !== "object") a[k] = {};
  if (!Array.isArray(a.recent)) a.recent = [];
  return a;
}
const save = () => store.save();

// ---------------------------------------------------------------------------- live state
let ME = null;               // { uid, key, code, name, look, discord }
let A = null;                // this account's saved social data
let SID = rid();             // this session (a friend says hi once per session they see)
let door = null, light = null, community = null, communityWant = 0;
const watch = new Map();     // friend code -> channel on their light
const live = new Map();      // friend code -> their latest presence ({ sid, n, l, s, w, m, p, at })
const hiSent = new Map();    // friend code -> the session we last said hi to
const invitesIn = new Map(); // id -> { id, from, name, look, party, mode, at }
const invitesOut = new Map();// id -> { id, to, party, at, state: "sent" | "seen" | "declined" | "failed" | "unseen" }
const rate = new Map();      // sender code -> [count, window start]
let retryTimer = 0, dogTimer = 0, starting = null, startedAt = 0;
let status = { s: "menu", w: 0, m: "", p: "" };
let lastTrack = 0, trackTimer = 0;
const listeners = new Set(), eventers = new Set();
let changeT = 0;
function changed() { clearTimeout(changeT); changeT = setTimeout(() => { for (const f of listeners) try { f(); } catch (e) { /* a broken listener can't stop the rest */ } }, 30); }
function emit(ev) { for (const f of eventers) try { f(ev); } catch (e) { /* ignore */ } }

const sb = () => (window.EG && window.EG.sb) || null;
function chan(name, extra) { return sb().channel(name, { config: { broadcast: { self: false }, ...(extra || {}) } }); }
function subscribe(ch) {
  return new Promise((done) => {
    let settled = false;
    const end = (ok) => { if (!settled) { settled = true; clearTimeout(t); done(ok); } };
    const t = setTimeout(() => end(false), 10000);
    try { ch.subscribe((s) => { if (s === "SUBSCRIBED") end(true); else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") end(false); }); } catch (e) { end(false); }
  });
}
const joined = (ch) => !!ch && ch.state === "joined";
function drop(ch) {
  if (!ch) return;
  if (joined(ch)) { try { ch.untrack(); } catch (e) { /* ignore */ } }
  try { sb().removeChannel(ch); } catch (e) { /* ignore */ }
}
/** Realtime channels here never need your account: use the site's public key (a stale sign-in can't block them). */
async function publicAuth() { try { await sb().realtime.setAuth(window.EG_CONFIG.SUPABASE_KEY); } catch (e) { /* older client */ } }

/** Drops a message at someone's door (a REST broadcast; if that's not available, a quick join). One at a time
    per door: the client shares one channel object per name. */
const posting = new Map();
function post(code, msg) {
  const run = (posting.get(code) || Promise.resolve()).then(() => postNow(code, msg));
  posting.set(code, run.catch(() => false));
  run.finally(() => { if (posting.get(code) === run) posting.delete(code); }).catch(() => {});
  return run;
}
async function postNow(code, msg) {
  if (!sb() || !code) return false;
  const name = "egf-d-" + code;
  const body = { ...msg, v: 1, at: now() };
  try {
    const ch = sb().channel(name, { config: { broadcast: { self: false } } });
    if (ch.httpSend && ch.state !== "joined") {
      try { const r = await ch.httpSend("m", body); if (r && r.success) { drop(ch); return true; } } catch (e) { /* fall through to joining */ }
    }
    if (ch.state === "joined") { await ch.send({ type: "broadcast", event: "m", payload: body }); return true; }
    const ok = await subscribe(ch);
    if (ok) await ch.send({ type: "broadcast", event: "m", payload: body });
    setTimeout(() => drop(ch), 1500);
    return ok;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------------------- starting, stopping
async function identity() {
  const fake = G.debug.on ? new URLSearchParams(location.search).get("fakeid") : "";
  const u = online.user;
  const uid = fake ? "debug-" + clip(fake, 24) : u && u.id;
  if (!uid) return null;
  const key = toHex(await sha("egf-key:" + uid));
  const m = (u && u.user_metadata) || {};
  const disc = u && ((u.app_metadata && u.app_metadata.provider === "discord") || (u.identities || []).some((i) => i.provider === "discord"));
  return {
    uid, key, code: await codeOf(key),
    name: clip(fake || online.name || "Pilot", 20),
    discord: disc ? clip((m.custom_claims && m.custom_claims.global_name) || m.full_name || m.name || m.user_name || "", 32) : "",
    look: "",
  };
}

export const social = {
  /** "off" (no account / no Realtime), "connecting", "on", "error". */
  state: "off",
  why: "",

  get me() { return ME; },
  get prefs() { return prefs(); },
  get ready() { return this.state === "on"; },
  get supported() { return !!sb() && cryptoOk(); },

  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  onEvent(f) { eventers.add(f); return () => eventers.delete(f); },

  /** Call when the sign-in changes: connects, or disconnects, to match. */
  async sync(lookCode) {
    if (lookCode) this.setLook(lookCode);
    // debug: two players on one machine (?debug=1&fakeid=alice) can befriend each other; tests read this
    if (G.debug.on && !window.__social) window.__social = { social, live, watch, invitesIn, invitesOut, get A() { return A; }, get ME() { return ME; } };
    const want = this.supported && prefs().online && (online.user || (G.debug.on && new URLSearchParams(location.search).get("fakeid")));
    if (!want) { this.stop(); this.state = "off"; this.why = !this.supported ? "unsupported" : !prefs().online ? "disabled" : "signed-out"; changed(); return; }
    const id = await identity();
    if (!id) { this.stop(); return; }
    if (ME && ME.uid === id.uid && this.state !== "off") { ME.name = id.name; ME.discord = id.discord; changed(); return; }
    this.stop();
    if (starting) return starting;
    starting = this.start(id).finally(() => { starting = null; });
    return starting;
  },

  async start(id) {
    ME = { ...id, look: this._look || "" };
    startedAt = now();
    A = acct(ME.code);
    this.state = "connecting"; this.why = "";
    changed();
    await publicAuth();
    door = chan("egf-d-" + ME.code);
    door.on("broadcast", { event: "m" }, ({ payload }) => { handle(payload).catch(() => {}); });
    const ok = await subscribe(door);
    if (!ok) { this.state = "error"; this.why = "Can't reach the friends server right now."; changed(); dogTimer = setInterval(watchdog, 30000); return; }
    this.state = "on";
    await lightUp();
    // your friends' lights, a few at a time
    let i = 0;
    for (const code of Object.keys(A.friends)) setTimeout(() => watchFriend(code), 120 * i++);
    if (prefs().discover) openCommunity(false);
    retryTimer = setInterval(retry, RETRY_MS);
    setTimeout(retry, 1500);
    dogTimer = setInterval(watchdog, 30000);
    changed();
  },

  stop() {
    clearInterval(retryTimer); clearInterval(dogTimer); clearTimeout(trackTimer);
    retryTimer = dogTimer = 0;
    if (sb()) { drop(door); drop(light); drop(community); for (const ch of watch.values()) drop(ch); }
    door = light = community = null;
    watch.clear(); live.clear(); hiSent.clear(); invitesIn.clear(); invitesOut.clear();
    if (this.state !== "off") { this.state = "off"; changed(); }
    ME = null; A = null;
  },

  // -------------------------------------------------------------------------- who's who
  setLook(code) {
    if (!code) return;
    const was = ME && ME.look;
    if (ME) ME.look = code;
    this._look = code;
    if (ME && was !== code) track();
  },
  /** Appended to your look in co-op, so teammates can add you from Recent players (off in the privacy settings). */
  tag() { return ME && prefs().shareTag ? "/~" + ME.code : ""; },

  /** Your friends: online ones first (in a game, then in the lobby), then by when they were last on. */
  friends() {
    if (!A) return [];
    const list = Object.entries(A.friends).map(([code, f]) => {
      const p = live.get(code);
      return { code, name: (p && p.n) || f.n || "Pilot", look: (p && p.l) || f.l || "", discord: f.d || "", online: !!p, st: p || null, seen: f.seen || 0, since: f.at || 0 };
    });
    const rank = (x) => (!x.online ? 3 : x.st.s === "run" ? 0 : x.st.s === "party" ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || b.seen - a.seen || a.name.localeCompare(b.name));
  },
  friend(code) { const f = A && A.friends[code]; return f ? this.friends().find((x) => x.code === code) : null; },
  requests() {
    if (!A) return { inc: [], out: [] };
    return {
      inc: Object.entries(A.inc).map(([code, r]) => ({ code, name: r.n || "Pilot", look: r.l || "", discord: r.d || "", at: r.at })).sort((a, b) => b.at - a.at),
      out: Object.entries(A.out).filter(([, o]) => !o.done).map(([code, o]) => ({ code, name: o.n || "", at: o.at })).sort((a, b) => b.at - a.at),
    };
  },
  blocked() { return A ? Object.entries(A.blocked).map(([code, b]) => ({ code, name: b.n || "", at: b.at })) : []; },
  recent() { return A ? A.recent.filter((r) => !A.blocked[r.code] && r.code !== ME.code) : []; },
  invites() { const t = now(); for (const [id, v] of invitesIn) if (t - v.at > INVITE_MS) invitesIn.delete(id); return [...invitesIn.values()].sort((a, b) => b.at - a.at); },
  inviteState(id) { const v = invitesOut.get(id); return v ? v.state : ""; },
  /** Invites you've sent that are still open: { code -> state } for the portals. */
  pendingInvites() { const out = {}; const t = now(); for (const v of invitesOut.values()) if (t - v.at < 60000 && (v.state === "sent" || v.state === "seen")) out[v.to] = { ...v }; return out; },
  isFriend(code) { return !!(A && A.friends[code]); },
  isBlocked(code) { return !!(A && A.blocked[code]); },
  get counts() { return A ? { friends: Object.keys(A.friends).length, online: [...live.keys()].filter((c) => A.friends[c]).length, inc: Object.keys(A.inc).length } : { friends: 0, online: 0, inc: 0 }; },

  // -------------------------------------------------------------------------- requests
  /** Sends a friend request. Resolves { ok, msg }. */
  async add(raw, hint) {
    const code = cleanCode(raw);
    if (!this.ready) return { ok: false, msg: "Sign in to add friends." };
    if (!code) return { ok: false, msg: "A friend code is 8 letters and numbers, like ABCD-EFGH." };
    if (code === ME.code) return { ok: false, msg: "That's your own code." };
    if (A.blocked[code]) return { ok: false, msg: "You've blocked that player. Unblock them first (Privacy)." };
    if (A.friends[code]) return { ok: false, msg: "You're already friends." };
    if (Object.keys(A.friends).length >= MAX_FRIENDS) return { ok: false, msg: "Your friends list is full (" + MAX_FRIENDS + ")." };
    if (A.inc[code]) { await this.accept(code); return { ok: true, msg: "They'd already asked you: you're friends once it goes through." }; }
    const o = A.out[code] && !A.out[code].done ? A.out[code] : (A.out[code] = { at: now(), eph: await ephemeral(), n: clip(hint || "", 20) });
    save();
    const sent = await sendRequest(code, o);
    changed();
    return sent ? { ok: true, msg: "Request sent to " + fmtCode(code) + ". It goes through when they're online and accept it." }
      : { ok: true, msg: "Saved. We'll keep trying while you're both online." };
  },
  async accept(code) {
    const r = A && A.inc[code];
    if (!r) return false;
    if (Object.keys(A.friends).length >= MAX_FRIENDS) { emit({ type: "error", msg: "Your friends list is full." }); return false; }
    const eph = await ephemeral();
    A.acc[code] = { eph, pub: r.pub, n: r.n, l: r.l, d: r.d, at: now() };
    delete A.inc[code];
    save(); changed();
    await sendAccept(code, A.acc[code]);
    return true;
  },
  async decline(code) {
    if (!A || !A.inc[code]) return;
    delete A.inc[code];
    save(); changed();
    post(code, { t: "dec", from: ME.code, to: code });
  },
  async cancel(code) {
    if (!A || !A.out[code]) return;
    delete A.out[code];
    save(); changed();
    post(code, { t: "can", from: ME.code, to: code });
  },
  async remove(code) {
    const f = A && A.friends[code];
    if (!f) return;
    sendPrivate(code, f, { t: "unfriend" });
    forget(code);
  },
  async block(code, name) {
    if (!A || !cleanCode(code) || code === ME.code) return;
    if (A.friends[code]) await this.remove(code);
    delete A.inc[code]; delete A.out[code]; delete A.acc[code];
    A.blocked[code] = { n: clip(name || "", 20), at: now() };
    A.recent = A.recent.filter((r) => r.code !== code);
    for (const [id, v] of invitesIn) if (v.from === code) invitesIn.delete(id);
    save(); changed();
  },
  unblock(code) { if (A && A.blocked[code]) { delete A.blocked[code]; save(); changed(); } },

  // -------------------------------------------------------------------------- invites
  /** Invites a friend to your party (party: the co-op lobby code). Resolves the invite id, or "" if it couldn't go. */
  async invite(code, party, mode) {
    const f = A && A.friends[code];
    if (!f || !party) return "";
    const id = rid();
    invitesOut.set(id, { id, to: code, party, at: now(), state: "sent" });
    changed();
    const ok = await sendPrivate(code, f, { t: "invite", id, party, mode: mode || "", n: ME.name, l: ME.look });
    const v = invitesOut.get(id);
    if (!ok && v) v.state = "failed";
    // no "seen" back in 8 seconds: they're probably away from the game
    setTimeout(() => { const w = invitesOut.get(id); if (w && w.state === "sent") { w.state = "unseen"; changed(); emit({ type: "invite-unseen", code, name: f.n }); } }, 8000);
    changed();
    return ok ? id : "";
  },
  /** The party closed: take back invites still out. */
  uninviteAll(party) {
    for (const v of invitesOut.values()) {
      if (party && v.party !== party) continue;
      const f = A && A.friends[v.to];
      if (f && (v.state === "sent" || v.state === "seen")) sendPrivate(v.to, f, { t: "uninvite", party: v.party });
    }
    invitesOut.clear();
    changed();
  },
  /** yes: you're joining (main.js does the joining); no: tell them, kindly. */
  answerInvite(id, yes) {
    const v = invitesIn.get(id);
    if (!v) return null;
    invitesIn.delete(id);
    const f = A && A.friends[v.from];
    if (!yes && f) sendPrivate(v.from, f, { t: "inv-no", id });
    changed();
    return v;
  },

  // -------------------------------------------------------------------------- what you're doing
  /** s: "menu" | "party" | "run"; w: wave; m: mode name; p: your party's code (shared only if friends may join). */
  setStatus(st) {
    const next = { ...status, ...st };
    if (next.s === status.s && next.w === status.w && next.m === status.m && next.p === status.p) return;
    status = next;
    track();
  },
  setPrefs(patch) {
    const p = prefs();
    const was = { ...p };
    Object.assign(p, patch);
    save();
    if (was.offline !== p.offline || was.partyOpen !== p.partyOpen) { if (p.offline) { if (joined(light)) try { light.untrack(); } catch (e) { /* ignore */ } } else track(true); }
    if (was.discover !== p.discover) { if (p.discover) openCommunity(false); else if (!communityWant) closeCommunity(true); else trackCommunity(); }
    if (was.online !== p.online) this.sync();
    changed();
  },

  // -------------------------------------------------------------------------- co-op teammates
  /** A co-op lobby changed: remember who you played with (if they share their code). */
  noteTeammates(members) {
    if (!A || !ME) return;
    let any = false;
    for (const m of members || []) {
      const code = tagOf(m.suit);
      if (!code || code === ME.code || A.blocked[code]) continue;
      A.recent = A.recent.filter((r) => r.code !== code);
      A.recent.unshift({ code, n: clip(m.name, 20), l: String(m.suit || "").split("/~")[0], at: now() });
      any = true;
    }
    if (any) { A.recent.length = Math.min(A.recent.length, 20); save(); changed(); }
  },

  // -------------------------------------------------------------------------- players who chose to be findable
  /** The Friends tab's "Find players" list: open while you're looking at it. */
  openCommunity() { communityWant++; openCommunity(true); },
  closeCommunity() { communityWant = Math.max(0, communityWant - 1); if (!communityWant && !prefs().discover) closeCommunity(true); },
  communityList() {
    if (!community || !joined(community)) return null;
    const st = community.presenceState();
    const seen = new Set();
    const out = [];
    for (const k of Object.keys(st)) {
      const m = st[k][st[k].length - 1];
      const code = cleanCode(m && m.code);
      if (!code || seen.has(code) || (ME && code === ME.code) || (A && A.blocked[code])) continue;
      seen.add(code);
      out.push({ code, name: clip(m.n, 20) || "Pilot", discord: clip(m.d, 32), look: String(m.l || ""), s: m.s || "menu", friend: !!(A && A.friends[code]) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
};

// ---------------------------------------------------------------------------- the door: what arrives
async function handle(m) {
  if (!m || typeof m !== "object" || !ME || !A) return;
  const from = cleanCode(m.from);
  if (!from || from === ME.code || A.blocked[from]) return;
  if (m.to && m.to !== ME.code) return;
  // a little flood control: 30 messages a minute from one code is plenty
  const r = rate.get(from) || [0, now()];
  if (now() - r[1] > 60000) { r[0] = 0; r[1] = now(); }
  if (++r[0] > 30) return;
  rate.set(from, r);
  switch (m.t) {
    case "req": return onRequest(from, m);
    case "acc": return onAccepted(from, m);
    case "cfm": return onConfirmed(from, m);
    case "dec": if (A.out[from] && !A.out[from].done) { delete A.out[from]; save(); changed(); } return;
    case "can": if (A.inc[from]) { delete A.inc[from]; save(); changed(); } return;
    case "hi": return onHi(from, m);
    case "x": return onPrivate(from, m);
  }
}

async function onRequest(from, m) {
  if (!m.pub || typeof m.pub.x !== "string" || typeof m.pub.y !== "string") return;
  const pub = { x: m.pub.x.slice(0, 64), y: m.pub.y.slice(0, 64) };
  const who = { n: clip(m.n, 20) || "Pilot", l: clip(m.l, 120), d: clip(m.d, 32) };
  // already friends (they lost their list), or you'd asked them too: answer straight away
  if (A.friends[from] || (A.out[from] && !A.out[from].done)) {
    if (A.out[from] && !A.out[from].done) delete A.out[from];
    A.acc[from] = { eph: await ephemeral(), pub, ...who, at: now() };
    save();
    return sendAccept(from, A.acc[from]);
  }
  // you accepted already and they're still asking (they missed the reply): say yes again
  if (A.acc[from]) {
    if (A.acc[from].pub.x !== pub.x) A.acc[from] = { eph: await ephemeral(), pub, ...who, at: now() };
    return sendAccept(from, A.acc[from]);
  }
  if (!prefs().requests) return;
  const fresh = !A.inc[from];
  if (fresh && Object.keys(A.inc).length >= MAX_INCOMING) return;
  A.inc[from] = { pub, ...who, at: fresh ? now() : A.inc[from].at };
  save();
  changed();
  if (fresh) emit({ type: "request", code: from, name: who.n, discord: who.d });
}

async function onAccepted(from, m) {
  const o = A.out[from];
  if (!o || !o.eph || !m.pub) return;
  const k = await handshakeKey(o.eph.priv, m.pub);
  const inner = k && (await unseal(k, m));
  if (!inner || typeof inner.key !== "string" || (await codeOf(inner.key)) !== from) return;
  const isNew = !A.friends[from];
  befriend(from, inner);
  // keep the one-time key a while, in case the confirmation doesn't arrive and they ask again
  A.out[from] = { ...o, done: true, at: o.at };
  save();
  post(from, { t: "cfm", from: ME.code, to: from, ...(await seal(k, { key: ME.key, n: ME.name, l: ME.look, d: discordShown() })) });
  if (isNew) emit({ type: "accepted", code: from, name: A.friends[from].n });
}

async function onConfirmed(from, m) {
  const a = A.acc[from];
  if (!a) return;
  const k = await handshakeKey(a.eph.priv, a.pub);
  const inner = k && (await unseal(k, m));
  if (!inner || typeof inner.key !== "string" || (await codeOf(inner.key)) !== from) return;
  const isNew = !A.friends[from];
  befriend(from, inner);
  delete A.acc[from];
  save();
  if (isNew) emit({ type: "friend", code: from, name: A.friends[from].n });
}

/** A friend saying hello (once per session of yours they see): keeps names fresh, and fills in a new device's list. */
async function onHi(from, m) {
  const inner = await unseal(await selfKey(ME.key), m);
  if (!inner || typeof inner.key !== "string" || (await codeOf(inner.key)) !== from) return;
  const isNew = !A.friends[from];
  if (isNew && Object.keys(A.friends).length >= MAX_FRIENDS) return;
  befriend(from, inner);
  save();
}

async function onPrivate(from, m) {
  const f = A.friends[from];
  if (!f) return;
  const inner = await unseal(await pairKey(ME.key, f.key), m);
  if (!inner) return;
  switch (inner.t) {
    case "invite": {
      const id = clip(inner.id, 12), party = clip(inner.party, 8).toUpperCase();
      if (!id || !party) return;
      invitesIn.set(id, { id, from, name: clip(inner.n, 20) || f.n, look: clip(inner.l, 120) || f.l, party, mode: clip(inner.mode, 12), at: now() });
      sendPrivate(from, f, { t: "seen", id });
      changed();
      emit({ type: "invite", id, code: from, name: clip(inner.n, 20) || f.n, party, mode: clip(inner.mode, 12) });
      return;
    }
    case "seen": { const v = invitesOut.get(inner.id); if (v && (v.state === "sent" || v.state === "unseen")) { v.state = "seen"; changed(); } return; }
    case "inv-no": { const v = invitesOut.get(inner.id); if (v) { v.state = "declined"; changed(); emit({ type: "invite-declined", code: from, name: f.n }); } return; }
    case "uninvite": { let any = false; for (const [id, v] of invitesIn) if (v.from === from && (!inner.party || v.party === inner.party)) { invitesIn.delete(id); any = true; } if (any) { changed(); emit({ type: "invite-gone", code: from }); } return; }
    case "unfriend": forget(from); return;
  }
}

function befriend(code, inner) {
  const f = A.friends[code] || {};
  A.friends[code] = { ...f, key: inner.key, n: clip(inner.n, 20) || f.n || "Pilot", l: clip(inner.l, 120) || f.l || "", d: clip(inner.d, 32), at: f.at || now(), seen: f.seen || 0 };
  delete A.inc[code];
  if (f.key && f.key !== inner.key) { drop(watch.get(code)); watch.delete(code); }
  watchFriend(code);
  changed();
}
function forget(code) {
  if (!A) return;
  delete A.friends[code];
  drop(watch.get(code));
  watch.delete(code); live.delete(code); hiSent.delete(code);
  for (const [id, v] of invitesIn) if (v.from === code) invitesIn.delete(id);
  save(); changed();
}

// ---------------------------------------------------------------------------- the door: what goes out
const discordShown = () => (ME && prefs().discover ? ME.discord : "");
function sendRequest(code, o) { return post(code, { t: "req", from: ME.code, to: code, n: ME.name, l: ME.look, d: discordShown(), pub: o.eph.pub }); }
async function sendAccept(code, a) {
  const k = await handshakeKey(a.eph.priv, a.pub);
  if (!k) return false;
  return post(code, { t: "acc", from: ME.code, to: code, pub: a.eph.pub, ...(await seal(k, { key: ME.key, n: ME.name, l: ME.look, d: discordShown() })) });
}
async function sendPrivate(code, f, inner) { return post(code, { t: "x", from: ME.code, to: code, ...(await seal(await pairKey(ME.key, f.key), inner)) }); }
async function sayHi(code) {
  const f = A && A.friends[code];
  if (!f) return;
  post(code, { t: "hi", from: ME.code, to: code, ...(await seal(await selfKey(f.key), { key: ME.key, n: ME.name, l: ME.look, d: discordShown() })) });
}

/** Every 45 seconds: requests and replies still waiting go out again (for a week), stale ones are dropped. */
function retry() {
  if (!A || social.state !== "on") return;
  const old = now() - REQUEST_DAYS * 864e5;
  let dirty = false;
  for (const [code, o] of Object.entries(A.out)) {
    if (o.at < old) { delete A.out[code]; dirty = true; continue; }
    if (!o.done) sendRequest(code, o);
  }
  for (const [code, a] of Object.entries(A.acc)) {
    if (a.at < old) { delete A.acc[code]; dirty = true; continue; }
    sendAccept(code, a);
  }
  for (const [code, r] of Object.entries(A.inc)) if (r.at < old) { delete A.inc[code]; dirty = true; }
  if (dirty) { save(); changed(); }
}

// ---------------------------------------------------------------------------- presence
function payload() {
  const p = prefs();
  return { sid: SID, n: ME.name, l: ME.look, s: status.s, w: status.w || 0, m: status.m || "", p: p.partyOpen ? status.p || "" : "", lv: level(), at: now() };
}
async function lightUp() {
  light = chan("egf-p-" + ME.key.slice(0, 40), { presence: { key: "me" } });
  light.on("presence", { event: "sync" }, () => {});
  if (await subscribe(light)) track(true);
}
/** Updates what friends see (at most every 4 seconds). */
function track(force) {
  if (!light || !ME || prefs().offline) return;
  clearTimeout(trackTimer);
  const wait = force ? 0 : 4000 - (now() - lastTrack);
  if (wait > 0) { trackTimer = setTimeout(() => track(true), wait); return; }
  lastTrack = now();
  if (joined(light)) light.track(payload()).catch(() => {});
  if (prefs().discover) trackCommunity();
}
function watchFriend(code) {
  const f = A && A.friends[code];
  if (!f || !f.key || watch.has(code) || social.state !== "on") return;
  const ch = chan("egf-p-" + f.key.slice(0, 40));
  ch.on("presence", { event: "sync" }, () => onFriendLight(code, ch));
  watch.set(code, ch);
  subscribe(ch);
}
function onFriendLight(code, ch) {
  const f = A && A.friends[code];
  if (!f) return;
  const st = ch.presenceState();
  const metas = st.me || Object.values(st)[0] || [];
  // on two devices: the one that's playing, else the latest
  let best = null;
  for (const m of metas) if (!best || (m.s === "run" && best.s !== "run") || ((m.s === "run") === (best.s === "run") && (m.at || 0) > (best.at || 0))) best = m;
  const was = live.get(code);
  if (best) {
    live.set(code, { sid: clip(best.sid, 12), n: clip(best.n, 20), l: clip(best.l, 120), s: clip(best.s, 8), w: best.w | 0, m: clip(best.m, 16), p: clip(best.p, 8).toUpperCase(), lv: Math.max(1, Math.min(1000, best.lv | 0)), at: best.at || 0 });
    f.seen = now();
    if (best.n) f.n = clip(best.n, 20);
    if (best.l) f.l = clip(best.l, 120);
    if (!was && now() - startedAt > 6000) emit({ type: "online", code, name: f.n });     // not the ones already on when you arrive
    if (hiSent.get(code) !== best.sid) { hiSent.set(code, best.sid); sayHi(code); }
  } else if (was) {
    live.delete(code);
    f.seen = now();
    save();
  }
  changed();
}

// ---------------------------------------------------------------------------- the opt-in player list
async function openCommunity(view) {
  if (social.state !== "on") return;
  if (community) { if (joined(community)) { trackCommunity(); changed(); } return; }
  community = chan("egf-community", { presence: { key: ME.code } });
  community.on("presence", { event: "sync" }, () => changed());
  if (await subscribe(community)) { trackCommunity(); changed(); }
}
function trackCommunity() {
  if (!community || !joined(community) || !ME) return;
  if (prefs().discover && !prefs().offline) community.track({ code: ME.code, n: ME.name, d: ME.discord, l: ME.look, s: status.s }).catch(() => {});
  else { try { community.untrack(); } catch (e) { /* ignore */ } }
}
function closeCommunity() { drop(community); community = null; changed(); }

/** Every 30 seconds: rejoins anything a dropped connection closed (sleep, a network change, a co-op lobby retry). */
async function watchdog() {
  if (!ME || !sb()) return;
  if (social.state === "error" || !joined(door)) {
    await publicAuth();
    drop(door);
    door = chan("egf-d-" + ME.code);
    door.on("broadcast", { event: "m" }, ({ payload }) => { handle(payload).catch(() => {}); });
    const ok = await subscribe(door);
    if (ok && social.state === "error") { social.state = "on"; social.why = ""; await lightUp(); for (const c of Object.keys(A.friends)) watchFriend(c); retryTimer = retryTimer || setInterval(retry, RETRY_MS); changed(); }
    if (!ok) return;
  }
  if (!joined(light)) { drop(light); await lightUp(); }
  for (const [code, ch] of [...watch]) if (!joined(ch)) { drop(ch); watch.delete(code); live.delete(code); watchFriend(code); }
  if (community && !joined(community)) { drop(community); community = null; if (communityWant || prefs().discover) openCommunity(false); }
}

