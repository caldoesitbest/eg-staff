/* Parties (4.4): you and up to three others in the Hangar, then into a run together. A party is a co-op lobby
   (net.js) opened from the Hangar (there's no Co-op mode to pick: a party is co-op): friends join it from an
   invite, a party link or a friend's Join button, and they stand in the portals beside you. The leader picks
   the mode and difficulty, everyone else readies up, and the run starts for all of them once they're all ready.
   When the leader heads back to the Hangar after a run, the whole party comes back with them, still together. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import { net } from "./net.js";
import { coop, startHost, endCoop } from "./coop.js";
import { social } from "./social.js";
import { online } from "./online.js";

let H = null;           // main.js: { lookCode, toast }
let pending = false;    // the leader pressed PLAY: it starts the moment everyone's ready
let startT = 0;
const listeners = new Set();
function changed() { for (const f of listeners) try { f(); } catch (e) { /* ignore */ } }

const MODE_NAMES = { ladder: "The Sin Ladder", rush: "Boss Rush", daily: "The Sin Ladder", coop: "The Sin Ladder" };

/** What friends see you doing (what's on your card in their list). */
function status() {
  if (!H) return;
  const inRun = G.state !== "menu";
  social.setStatus({
    s: inRun ? "run" : net.role !== "off" ? "party" : "menu",
    w: inRun ? G.wave | 0 : 0,
    m: inRun ? (G.mode === "rush" ? "Boss Rush" : G.daily ? "Daily Challenge" : "The Sin Ladder") : "",
    // friends may join from your card only between runs, with room, and if you allow it (Privacy)
    p: !inRun && net.role !== "off" && net.members.length < 4 ? net.code : "",
  });
}

export const party = {
  busy: false,
  get on() { return net.role !== "off"; },
  get leading() { return net.role === "host"; },
  get code() { return net.role !== "off" ? net.code : ""; },
  get members() { return net.role !== "off" ? net.members : []; },
  /** Everyone but you, by slot. */
  get others() { return this.members.filter((m) => m.id !== net.id).sort((a, b) => a.slot - b.slot); },
  get leader() { return this.members.find((m) => m.slot === 0) || null; },
  get full() { return this.members.length >= 4; },
  /** A guest: what the leader picked (mode, diff), and whether you're ready. */
  pick: null,
  ready: false,
  get pending() { return pending && net.role === "host"; },
  /** Leader: the guests who haven't readied up yet. */
  get waitingFor() { return net.role === "host" ? net.members.filter((m) => m.slot !== 0 && !m.ready) : []; },
  get me() { return net.id; },

  init(hooks) {
    H = hooks;
    setInterval(status, 2000);
  },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  changed,
  status,
  name() { return (store.data.coopName || online.name || (social.me && social.me.name) || "Pilot").slice(0, 16); },
  look() { return H.lookCode() + social.tag(); },
  mode() { const m = store.data.settings.mode; return MODE_NAMES[m] ? (m === "rush" ? "rush" : "ladder") : "ladder"; },

  /** Opens a party if you're not in one (you lead it). Resolves the code, or "" if it couldn't. */
  async ensure() {
    if (net.role !== "off") {
      if (net.role === "host" && !net.ch) { try { await net.reopen(); } catch (e) { /* friends already in stay in */ } }
      return net.code;
    }
    if (this.busy) return "";
    this.busy = true; changed();
    try { await net.host(this.name(), this.look()); return net.code; }
    catch (e) { net.leave(); H.toast((e && e.message) || "Couldn't open a party.", 3200); return ""; }
    finally { this.busy = false; changed(); status(); }
  },

  /** Invites a friend (opening your party first if need be). */
  async invite(code) {
    if (this.full) { H.toast("Your party's full (4 players)", 2400); return false; }
    const p = await this.ensure();
    if (!p) return false;
    const id = await social.invite(code, p, MODE_NAMES[this.mode()]);
    if (!id) { H.toast("Couldn't send that invite. Check your connection.", 2800); return false; }
    changed();
    return true;
  },

  /** Joins a party by its code (an invite, a link, a friend's Join button). */
  async join(raw) {
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (code.length !== 5) { H.toast("A party code is 5 letters and numbers", 2400); return false; }
    if (net.role !== "off" && net.code === code) return true;
    if (G.state !== "menu") { H.toast("Finish this run first, then join from the Friends tab", 3000); return false; }
    if (this.busy) return false;
    if (net.role !== "off") this.leave(true);
    this.busy = true; changed();
    try {
      await net.join(code, this.name(), this.look());
      H.toast("You're in the party. The leader starts the run.", 2600);
      return true;
    } catch (e) {
      net.leave();
      H.toast((e && e.message) || "Couldn't join that party.", 3200);
      return false;
    } finally { this.busy = false; changed(); status(); }
  },

  leave(quiet) {
    pending = false; this.ready = false; this.pick = null;
    if (net.role === "off") return;
    if (net.role === "host") social.uninviteAll(net.code);
    endCoop();
    if (!quiet) H.toast("You left the party", 2000);
    changed(); status();
  },
  kick(id) { if (net.role === "host" && id !== net.id) net.kick(id); },

  /** PLAY in the Hangar. A guest: ready up (or not). The leader: starts it for everyone once they're all ready
      (until then it asks them, and starts by itself when the last one readies). True when this handled it. */
  play(mode) {
    if (net.role === "client") { this.setReady(!this.ready); return true; }
    if (net.role !== "host") return false;
    if (net.members.length < 2) { this.leave(true); return false; }        // nobody came: a normal solo run
    if (this.waitingFor.length) {
      pending = true;
      net.broadcast({ k: "pcheck", mode: this.mode(), diff: G.settings.difficulty }, true);
      H.toast("Waiting for " + this.waitingFor.map((m) => m.name).join(", ") + " to ready up", 2600);
      changed();
      return true;
    }
    this.go(mode);
    return true;
  },
  go(mode) {
    pending = false;
    coop.mode = (mode || this.mode()) === "rush" ? "rush" : "ladder";
    coop.mods = store.data.rush.mods || [];
    for (const m of net.members) m.ready = false;
    social.uninviteAll(net.code);
    startHost();
  },
  /** A guest readies up (or doesn't). */
  setReady(r) {
    if (net.role !== "client") return;
    this.ready = !!r;
    net.toHost({ k: "pready", r: this.ready ? 1 : 0 }, true);
    changed();
  },
  /** Leader: a guest's ready changed. Everyone ready and PLAY already pressed: go. */
  onReady(id, r) {
    const m = net.members.find((x) => x.id === id);
    if (!m) return;
    m.ready = !!r;
    net.lobbyChanged();
    if (pending && !this.waitingFor.length && net.members.length > 1) {
      clearTimeout(startT);
      H.toast("Everyone's ready!", 1400);
      startT = setTimeout(() => { if (pending && !this.waitingFor.length && G.state === "menu") this.go(); }, 900);
    }
    changed();
  },
  /** Leader: the mode or difficulty changed (the guests' Hangars show it). */
  sendPick() {
    if (net.role !== "host") return;
    net.broadcast({ k: "pmode", mode: this.mode(), diff: G.settings.difficulty }, true);
  },
  /** A guest: the leader's pick. */
  onPick(msg) {
    this.pick = { mode: msg.mode === "rush" ? "rush" : "ladder", diff: BALANCE.difficulty[msg.diff] ? msg.diff : "normal" };
    changed();
  },
  /** A guest: the leader wants to play and you're not ready. */
  onCheck(msg) {
    if (msg) this.onPick(msg);
    if (!this.ready && H.readyCheck) H.readyCheck(this.leader ? this.leader.name : "Your leader", this.pick);
  },

  /** The lobby changed (net.on.lobby). A guest learns the leader's pick when they join. */
  lobby(members) {
    if (net.role === "host") this.sendPick();
    else { const me = members.find((m) => m.id === net.id); if (me && !!me.ready !== this.ready && G.state === "menu") this.ready = !!me.ready; }
    if (net.role === "host" && pending && members.length < 2) pending = false;
    social.noteTeammates(members); changed(); status();
  },
  /** The leader went home: this ends the run here too, but keeps the party. */
  home() {
    pending = false; this.ready = false;
    for (const m of net.members) m.ready = false;
    if (net.role === "host") {
      net.broadcast({ k: "home" }, true);
      G.net.role = "off"; G.net.slot = 0; G.net.n = 1;
      coop.ready.clear(); coop.waiting = false;
      net.reopen().catch(() => {});
    } else {
      G.net.role = "off"; G.net.slot = 0; G.net.n = 1;
      coop.waiting = false;
    }
    changed(); status();
  },
};
