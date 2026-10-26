/* The Friends tab, the party drawer, the portals beside you on the Play tab, and social notifications (4.4).
   The networking is social.js (friends) and party.js (the party itself); this file only draws and asks. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { social, fmtCode, cleanCode, tagOf } from "./social.js";
import { party } from "./party.js";
import { online } from "./online.js";
import { SLOT_COL } from "./coop.js";
import { input } from "./input.js";
import { net } from "./net.js";

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const icon = (name) => (window.egIcon ? window.egIcon(name) : el("span"));
function btn(cls, label, ic, k) {
  const b = el("button", "btn " + cls);
  b.type = "button";
  if (ic) b.append(icon(ic));
  b.append(el("span", "", label));
  if (k) b.dataset.k = k;
  return b;
}
const SITE = "https://enviousgluttony.com";
const siteBase = () => (G.desktop || G.androidApp || !/^https?:$/.test(location.protocol) ? SITE : location.origin);
function ago(t) {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

let O = null;               // init options: { ui, sfx, toast, lookArt, hangar: { tab, refresh, now }, signIn }
let built = false;
let noteSeq = 0;
const notes = [];           // { id, kind, key, title, body, actions, until }
let lastOnlineToast = 0;
let communityOpen = false, findQuery = "";

/** Remembers which control had the focus in box (by data-k), redraws, and puts it back. */
function keepFocus(box, draw) {
  const a = document.activeElement;
  const k = a && box.contains(a) ? a.dataset.k : "";
  draw();
  if (k) { const n = box.querySelector('[data-k="' + CSS.escape(k) + '"]'); if (n) try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }
  else if (a && a !== document.body && !a.isConnected && O.ui.ensureFocus) O.ui.ensureFocus();
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* older WebViews */ }
  try {
    const t = el("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.append(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch (e) { return false; }
}
/** Your invite link: the share sheet on phones (Discord's in it), else the clipboard with a message to paste. */
async function shareMe() {
  const me = social.me;
  if (!me) return;
  const url = siteBase() + "/game/?friend=" + me.code;
  const text = "Add me on Envious Glider: " + fmtCode(me.code);
  if (navigator.share && G.touchActive) { try { await navigator.share({ title: "Envious Glider", text, url }); return; } catch (e) { /* closed the sheet */ } }
  const ok = await copy(text + " " + url);
  O.toast(ok ? "Invite link copied: paste it in a Discord DM" : "Your code is " + fmtCode(me.code), 2800);
}

// ---------------------------------------------------------------------------- confirm box
let confirmDone = null;
function confirmBox(text, yes, danger) {
  const box = $("fr-confirm");
  if (confirmDone) confirmDone(false);
  $("frc-text").textContent = text;
  const ok = $("frc-yes");
  ok.lastChild.textContent = yes || "OK";
  ok.className = "btn " + (danger ? "btn-danger" : "btn-primary");
  box.hidden = false;
  setTimeout(() => { if (input.mode !== "touch") ok.focus({ preventScroll: true }); }, 30);
  return new Promise((res) => { confirmDone = (v) => { confirmDone = null; box.hidden = true; res(v); O.ui.ensureFocus && setTimeout(() => O.ui.ensureFocus(), 30); }; });
}

// ---------------------------------------------------------------------------- notifications
function note(n) {
  if (n.key) { const i = notes.findIndex((x) => x.key === n.key); if (i >= 0) notes.splice(i, 1); }
  notes.unshift({ id: ++noteSeq, until: Date.now() + (n.ttl || 600000), ...n });
  if (notes.length > 4) notes.length = 4;
  renderNotes();
}
function dropNote(key) { const i = notes.findIndex((x) => x.key === key); if (i >= 0) { notes.splice(i, 1); renderNotes(); } }
function renderNotes() {
  const box = $("social-notes");
  if (!box) return;
  const t = Date.now();
  const inc = new Set(social.requests().inc.map((q) => q.code));
  const inv = new Set(social.invites().map((v) => v.id));
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const gone = n.key === "ready" ? party.ready || !party.on || G.state !== "menu" : (n.kind === "req" && !inc.has(n.code)) || (n.kind === "inv" && !inv.has(n.id));
    if (n.until < t || gone) notes.splice(i, 1);
  }
  keepFocus(box, () => {
    box.replaceChildren();
    for (const n of notes) {
      const c = el("div", "snote snote-" + n.kind);
      c.setAttribute("role", "status");
      if (n.look) { const art = el("span", "snote-art"); art.append(O.lookArt(n.look, 40, 44)); c.append(art); }
      const txt = el("div", "snote-txt");
      txt.append(el("b", "", n.title));
      if (n.body) txt.append(el("span", "", n.body));
      c.append(txt);
      const acts = el("div", "snote-acts");
      for (const a of n.actions || []) {
        const b = btn(a.primary ? "btn-primary btn-sm" : "btn-ghost btn-sm", a.label, a.icon, "note:" + n.key + ":" + a.label);
        b.addEventListener("click", () => { O.sfx("click"); dropNote(n.key); a.fn(); });
        acts.append(b);
      }
      const x = el("button", "snote-x");
      x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.dataset.k = "note:" + n.key + ":x";
      x.append(icon("x"));
      x.addEventListener("click", () => { dropNote(n.key); if (n.onDismiss) n.onDismiss(); });
      c.append(acts, x);
      box.append(c);
    }
  });
  box.hidden = !notes.length;
}

function onSocialEvent(ev) {
  const inMenu = G.state === "menu";
  if (ev.type === "request") {
    note({ kind: "req", key: "req:" + ev.code, code: ev.code, title: ev.name + " wants to be friends", body: (ev.discord ? "Discord: " + ev.discord + " · " : "") + fmtCode(ev.code),
      actions: [{ label: "Accept", icon: "check", primary: true, fn: () => social.accept(ev.code) }, { label: "Decline", fn: () => social.decline(ev.code) }], ttl: 3600000 });
    if (!inMenu) O.toast(ev.name + " sent you a friend request", 2600);
  } else if (ev.type === "accepted" || ev.type === "friend") {
    O.toast("You and " + ev.name + " are friends now", 2600);
    O.sfx("achv");
  } else if (ev.type === "invite") {
    const f = social.friend(ev.code);
    note({ kind: "inv", key: "inv:" + ev.id, id: ev.id, look: f && f.look, title: ev.name + " invited you to their party", body: ev.mode ? "Playing " + ev.mode : "",
      actions: [{ label: "Join", icon: "log-in", primary: true, fn: () => acceptInvite(ev.id) }, { label: "Decline", fn: () => social.answerInvite(ev.id, false) }],
      onDismiss: () => social.answerInvite(ev.id, false), ttl: 600000 });
    if (!inMenu) O.toast(ev.name + " invited you to a party: join from the menu after this run", 3200);
    O.sfx("achv");
  } else if (ev.type === "invite-gone") {
    for (const n of [...notes]) if (n.kind === "inv" && !social.invites().some((v) => "inv:" + v.id === n.key)) dropNote(n.key);
  } else if (ev.type === "invite-declined") {
    O.toast(ev.name + " can't join right now", 2400);
  } else if (ev.type === "online") {
    if (inMenu && Date.now() - lastOnlineToast > 20000) { lastOnlineToast = Date.now(); O.toast(ev.name + " is online", 1800); }
  } else if (ev.type === "error") {
    O.toast(ev.msg, 2600);
  }
}
async function acceptInvite(id) {
  const v = social.answerInvite(id, true);
  if (!v) { O.toast("That invite has expired", 2200); return; }
  if (party.on && party.code === v.party) return;
  if (party.on && party.others.length) { const ok = await confirmBox("Leave your party to join " + v.name + "'s?", "Join theirs"); if (!ok) return; }
  if (await party.join(v.party)) { O.hangar.tab("play"); }
}

// ---------------------------------------------------------------------------- links (?friend=CODE, ?party=CODE)
function readLinks() {
  const q = new URLSearchParams(location.search);
  const f = cleanCode(q.get("friend")), p = String(q.get("party") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  if (!f && p.length !== 5) return;
  // tidy the address bar so a reload doesn't ask again
  try { q.delete("friend"); q.delete("party"); const s = q.toString(); history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) { /* ignore */ }
  const ask = async () => {
    if (G.state !== "menu" || O.ui.screen !== "menu") { setTimeout(ask, 800); return; }
    if (p.length === 5) {
      if (await confirmBox("Join party " + p + "? You'll play co-op with whoever's in it.", "Join party")) { if (await party.join(p)) O.hangar.tab("play"); }
    }
    if (f) {
      if (!social.ready) {
        if (social.state === "connecting") { setTimeout(ask, 800); return; }
        if (await confirmBox("Sign in to add " + fmtCode(f) + " as a friend.", "Sign in")) O.signIn();
        return;
      }
      if (social.isFriend(f) || f === social.me.code) return;
      if (await confirmBox("Send a friend request to " + fmtCode(f) + "?", "Send request")) { const r = await social.add(f); O.toast(r.msg, 3200); }
    }
  };
  setTimeout(ask, 600);
}

// ---------------------------------------------------------------------------- the Friends tab
function buildPane() {
  const box = $("hpane-friends");
  if (!box || built) return;
  built = true;
  box.innerHTML =
    '<div class="fr">' +
    '<section class="fr-col fr-me" aria-label="You"><div id="fr-me"></div>' +
    '<form class="fr-add" id="fr-add" autocomplete="off"><label class="fr-h3" for="fr-add-in">Add a friend</label>' +
    '<div class="fr-add-row"><input id="fr-add-in" type="text" maxlength="9" placeholder="ABCD-EFGH" autocapitalize="characters" spellcheck="false" aria-label="Their friend code">' +
    '<button class="btn btn-primary" id="fr-add-go" type="submit"></button></div><p class="fr-msg" id="fr-add-msg" role="status"></p></form>' +
    '<details class="fr-privacy" id="fr-privacy"><summary class="fr-h3">Privacy &amp; settings</summary><div id="fr-prefs"></div></details></section>' +
    '<section class="fr-col fr-main" aria-label="Friends"><div class="fr-head"><h2 class="fr-h">Friends</h2><span class="fr-count" id="fr-count"></span></div><div class="fr-list" id="fr-list"></div></section>' +
    '<section class="fr-col fr-side" aria-label="Find players"><div id="fr-find"></div><div id="fr-recent"></div></section>' +
    "</div>";
  const go = $("fr-add-go");
  go.append(icon("user-plus"), el("span", "", "Add"));
  $("fr-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = $("fr-add-in"), msg = $("fr-add-msg");
    O.sfx("click");
    const r = await social.add(inp.value);
    msg.textContent = r.msg;
    msg.className = "fr-msg " + (r.ok ? "ok" : "bad");
    if (r.ok) inp.value = "";
  });
  $("fr-add-in").addEventListener("input", (e) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    e.target.value = v.length > 4 ? v.slice(0, 4) + "-" + v.slice(4) : v;
  });
}

function renderMe() {
  const box = $("fr-me");
  if (!box) return;
  const me = social.me;
  box.replaceChildren();
  if (!me) {
    const c = el("div", "fr-signin");
    c.append(el("h2", "fr-h", "Friends"));
    if (social.why === "unsupported") c.append(el("p", "fr-note", "Friends need an internet connection (and a browser that supports secure connections)."));
    else if (social.why === "disabled") {
      c.append(el("p", "fr-note", "Friends are switched off on this device."));
      const on = btn("btn-primary", "Turn friends on", "users", "fr:on");
      on.addEventListener("click", () => { O.sfx("click"); social.setPrefs({ online: true }); });
      c.append(on);
    } else {
      c.append(el("p", "fr-note", "Sign in with Discord to get a friend code, see which friends are online, and invite them to your party from the portals on the Play tab."));
      const s = btn("btn-primary btn-discord", "Sign in with Discord", "discord", "fr:signin");
      s.addEventListener("click", () => { O.sfx("click"); O.signIn(); });
      c.append(s, el("p", "fr-note small", "No account? Parties still work with a code: open a portal on the Play tab."));
    }
    box.append(c);
    return;
  }
  const card = el("div", "fr-card");
  const art = el("span", "fr-me-art");
  art.append(O.lookArt(me.look || "", 64, 72));
  const who = el("div", "fr-me-who");
  who.append(el("b", "", me.name));
  if (me.discord) { const d = el("span", "fr-disc"); d.append(icon("discord"), el("span", "", me.discord)); who.append(d); }
  card.append(art, who);
  const codeBox = el("div", "fr-codebox");
  codeBox.append(el("small", "", "Your friend code"));
  const code = el("button", "fr-code", fmtCode(me.code));
  code.type = "button"; code.dataset.k = "fr:code";
  code.setAttribute("aria-label", "Your friend code " + fmtCode(me.code) + ". Copy it");
  code.addEventListener("click", async () => { O.sfx("click"); O.toast((await copy(fmtCode(me.code))) ? "Code copied" : fmtCode(me.code), 1800); });
  codeBox.append(code);
  const row = el("div", "fr-me-btns");
  const share = btn("btn-ghost btn-sm", G.touchActive && navigator.share ? "Share invite" : "Copy invite link", "link", "fr:share");
  share.addEventListener("click", () => { O.sfx("click"); shareMe(); });
  row.append(share);
  const state = el("p", "fr-note small fr-conn", social.state === "on" ? (social.prefs.offline ? "You appear offline to friends." : "Online. Friends can see you're on.") : social.state === "connecting" ? "Connecting…" : social.why || "Offline");
  box.append(card, codeBox, row, state);
}

function prefRow(key, label, sub, invert) {
  const lab = el("label", "set-row set-check");
  const inp = el("input");
  inp.type = "checkbox";
  inp.checked = invert ? !social.prefs[key] : !!social.prefs[key];
  inp.dataset.k = "pref:" + key;
  inp.addEventListener("change", () => social.setPrefs({ [key]: invert ? !inp.checked : inp.checked }));
  const s = el("span", "", label);
  if (sub) s.append(el("small", "", sub));
  lab.append(inp, s);
  return lab;
}
function renderPrefs() {
  const box = $("fr-prefs");
  if (!box) return;
  keepFocus(box, () => {
    box.replaceChildren();
    box.append(
      prefRow("offline", "Appear offline", "Friends see you as offline. You can still play with them."),
      prefRow("partyOpen", "Friends can join my party", "Shows a Join button on your card in their list. Off: invite only."),
      prefRow("requests", "Accept friend requests", "Off: requests from new players are ignored."),
      prefRow("shareTag", "Let co-op teammates add me", "Puts your friend code in your co-op look, for their Recent players."),
      prefRow("discover", "List me in Find players", "Shows your name, Discord name and friend code to anyone browsing the list."),
      prefRow("online", "Friends on this device", "Off: disconnects from friends completely."),
    );
    const bl = social.blocked();
    const h = el("h4", "fr-h4", "Blocked players" + (bl.length ? " (" + bl.length + ")" : ""));
    box.append(h);
    if (!bl.length) box.append(el("p", "fr-note small", "Nobody. Blocked players can't send you requests or invites."));
    for (const b of bl) {
      const r = el("div", "fr-row slim");
      const t = el("div", "fr-txt");
      t.append(el("b", "", b.name || fmtCode(b.code)), el("small", "", fmtCode(b.code)));
      const u = btn("btn-ghost btn-sm", "Unblock", "", "unblock:" + b.code);
      u.addEventListener("click", () => { O.sfx("click"); social.unblock(b.code); });
      r.append(t, u);
      box.append(r);
    }
    box.append(el("p", "fr-note small", "Friends lists are kept on each device. When you sign in somewhere new, your friends fill it back in the next time they see you online."));
  });
}

function statusLine(f) {
  if (!f.online) return "Offline" + (f.seen ? " · " + ago(f.seen) : "");
  const s = f.st || {};
  if (s.s === "run") return "In a run" + (s.w ? " · wave " + s.w : "") + (s.m ? " · " + s.m : "");
  if (s.s === "party") return "In a party" + (s.p ? " · open to friends" : "");
  return "In the Hangar";
}
function inMyParty(code) { return party.others.some((m) => tagOf(m.suit) === code); }

function friendRow(f) {
  const r = el("div", "fr-row" + (f.online ? " on" : "") + (f.st && f.st.s === "run" ? " busy" : ""));
  const art = el("span", "fr-art");
  art.append(O.lookArt(f.look, 40, 44));
  if (f.online) art.append(el("i", "fr-dot"));
  const t = el("div", "fr-txt");
  const nm = el("b", "", f.name);
  if (f.st && f.st.lv) nm.append(el("em", "fr-lv", "Lv " + f.st.lv));
  t.append(nm, el("small", "", statusLine(f)));
  r.append(art, t);
  const acts = el("div", "fr-acts");
  const pend = social.pendingInvites()[f.code];
  if (f.online && f.st && f.st.p && f.st.p !== party.code && f.st.s === "party") {
    const j = btn("btn-ghost btn-sm", "Join", "log-in", "join:" + f.code);
    j.addEventListener("click", async () => { O.sfx("click"); if (party.on && party.others.length && !(await confirmBox("Leave your party to join " + f.name + "'s?", "Join theirs"))) return; if (await party.join(f.st.p)) O.hangar.tab("play"); });
    acts.append(j);
  }
  if (f.online && f.st && f.st.s !== "run") {
    const here = inMyParty(f.code);
    const label = here ? "In party" : pend ? (pend.state === "seen" ? "Invited ✓" : "Invited") : "Invite";
    const b = btn(here || pend ? "btn-ghost btn-sm" : "btn-primary btn-sm", label, here ? "check" : "user-plus", "inv:" + f.code);
    b.disabled = here || !!pend || party.busy || party.full;
    b.addEventListener("click", async () => { O.sfx("click"); if (await party.invite(f.code)) O.toast("Invite sent to " + f.name, 2000); });
    acts.append(b);
  }
  const more = el("button", "icon-btn fr-more");
  more.type = "button"; more.dataset.k = "more:" + f.code;
  more.setAttribute("aria-label", "More for " + f.name);
  more.append(icon("ellipsis"));
  more.addEventListener("click", () => { O.sfx("click"); r.classList.toggle("open"); });
  acts.append(more);
  r.append(acts);
  const ex = el("div", "fr-extra");
  ex.append(el("small", "", (f.discord ? "Discord: " + f.discord + " · " : "") + fmtCode(f.code) + (f.since ? " · friends since " + new Date(f.since).toLocaleDateString() : "")));
  const rm = btn("btn-ghost btn-sm", "Remove", "user-round", "rm:" + f.code);
  rm.addEventListener("click", async () => { if (await confirmBox("Remove " + f.name + " from your friends?", "Remove", true)) social.remove(f.code); });
  const bk = btn("btn-ghost btn-sm", "Block", "ban", "bk:" + f.code);
  bk.addEventListener("click", async () => { if (await confirmBox("Block " + f.name + "? They're removed and can't send you requests or invites.", "Block", true)) social.block(f.code, f.name); });
  ex.append(rm, bk);
  r.append(ex);
  return r;
}

function renderList() {
  const box = $("fr-list");
  if (!box) return;
  const c = social.counts;
  $("fr-count").textContent = social.me ? c.online + " online · " + c.friends + " friends" : "";
  keepFocus(box, () => {
    box.replaceChildren();
    if (!social.me) {
      box.append(el("p", "fr-empty", social.state === "connecting" ? "Connecting to friends…" : "Your friends show up here once you're signed in."));
      return;
    }
    const rq = social.requests();
    if (rq.inc.length) {
      box.append(el("h3", "fr-sec", "Friend requests · " + rq.inc.length));
      for (const q of rq.inc) {
        const r = el("div", "fr-row req");
        const art = el("span", "fr-art");
        art.append(O.lookArt(q.look, 40, 44));
        const t = el("div", "fr-txt");
        t.append(el("b", "", q.name), el("small", "", (q.discord ? "Discord: " + q.discord + " · " : "") + fmtCode(q.code) + " · " + ago(q.at)));
        const acts = el("div", "fr-acts");
        const a = btn("btn-primary btn-sm", "Accept", "check", "acc:" + q.code);
        a.addEventListener("click", () => { O.sfx("click"); dropNote("req:" + q.code); social.accept(q.code); });
        const d = btn("btn-ghost btn-sm", "Decline", "", "dec:" + q.code);
        d.addEventListener("click", () => { O.sfx("click"); dropNote("req:" + q.code); social.decline(q.code); });
        const bk = el("button", "icon-btn fr-more");
        bk.type = "button"; bk.dataset.k = "bkq:" + q.code; bk.setAttribute("aria-label", "Block " + q.name); bk.append(icon("ban"));
        bk.addEventListener("click", async () => { if (await confirmBox("Block " + q.name + "?", "Block", true)) { dropNote("req:" + q.code); social.block(q.code, q.name); } });
        acts.append(a, d, bk);
        r.append(art, t, acts);
        box.append(r);
      }
    }
    const list = social.friends();
    const groups = [["In a game", list.filter((f) => f.online && f.st && f.st.s === "run")], ["Online", list.filter((f) => f.online && !(f.st && f.st.s === "run"))], ["Offline", list.filter((f) => !f.online)]];
    for (const [name, fs] of groups) {
      if (!fs.length) continue;
      box.append(el("h3", "fr-sec", name + " · " + fs.length));
      for (const f of fs) box.append(friendRow(f));
    }
    if (rq.out.length) {
      box.append(el("h3", "fr-sec", "Sent · " + rq.out.length));
      for (const o of rq.out) {
        const r = el("div", "fr-row slim");
        const t = el("div", "fr-txt");
        t.append(el("b", "", o.name || fmtCode(o.code)), el("small", "", "Waiting for them to accept · " + ago(o.at)));
        const cn = btn("btn-ghost btn-sm", "Cancel", "", "can:" + o.code);
        cn.addEventListener("click", () => { O.sfx("click"); social.cancel(o.code); });
        r.append(t, cn);
        box.append(r);
      }
    }
    if (!list.length && !rq.inc.length && !rq.out.length) {
      const e = el("div", "fr-empty");
      e.append(el("b", "", "No friends yet"), el("span", "", "Send your invite link to friends on Discord, add a code, or add players you met in co-op (right)."));
      box.append(e);
    }
  });
}

function renderSide() {
  const find = $("fr-find"), rec = $("fr-recent");
  if (!find || !rec) return;
  if (!social.me) { find.replaceChildren(); rec.replaceChildren(); return; }
  keepFocus(find, () => {
    find.replaceChildren();
    find.append(el("h3", "fr-h3", "Find players"));
    const p = social.prefs;
    if (!p.askedDiscover && !p.discover) {
      const ask = el("div", "fr-ask");
      ask.append(el("p", "", "Want your Discord friends to find you here? Players who switch this on are listed by name and Discord name while they're online, so you can add each other."));
      const y = btn("btn-primary btn-sm", "List me", "check", "disc:yes");
      y.addEventListener("click", () => { O.sfx("click"); social.setPrefs({ discover: true, askedDiscover: true }); });
      const n = btn("btn-ghost btn-sm", "Not now", "", "disc:no");
      n.addEventListener("click", () => { O.sfx("click"); social.setPrefs({ askedDiscover: true }); });
      ask.append(y, n);
      find.append(ask);
    } else find.append(el("p", "fr-note small", p.discover ? "You're listed while you're online (Privacy turns it off)." : "Only players who chose to be listed show up. You aren't listed (Privacy)."));
    const s = el("input", "fr-search");
    s.type = "search"; s.placeholder = "Search names or Discord names"; s.value = findQuery; s.dataset.k = "find:q";
    s.setAttribute("aria-label", "Search players");
    s.addEventListener("input", () => { findQuery = s.value; renderFindList(); });
    find.append(s, el("div", "fr-find-list", ""));
    renderFindList();
  });
  keepFocus(rec, () => {
    rec.replaceChildren();
    rec.append(el("h3", "fr-h3", "Played with recently"));
    const list = social.recent();
    if (!list.length) rec.append(el("p", "fr-note small", "Co-op teammates who share their code show up here."));
    for (const r of list.slice(0, 12)) rec.append(addRow(r.code, r.n, r.l, ago(r.at), "rec"));
  });
}
function renderFindList() {
  const box = document.querySelector("#fr-find .fr-find-list");
  if (!box) return;
  const all = social.communityList();
  keepFocus(box, () => {
    box.replaceChildren();
    if (all === null) { box.append(el("p", "fr-note small", "Loading…")); return; }
    const q = findQuery.trim().toLowerCase();
    const list = q ? all.filter((x) => x.name.toLowerCase().includes(q) || x.discord.toLowerCase().includes(q)) : all;
    if (!list.length) box.append(el("p", "fr-note small", q ? "Nobody listed by that name right now." : "Nobody's listed right now."));
    for (const x of list.slice(0, 30)) box.append(addRow(x.code, x.name, x.look, x.discord ? "Discord: " + x.discord : x.s === "run" ? "In a run" : "Online", "find"));
  });
}
function addRow(code, name, look, sub, k) {
  const r = el("div", "fr-row slim");
  const art = el("span", "fr-art sm");
  art.append(O.lookArt(look || "", 30, 34));
  const t = el("div", "fr-txt");
  t.append(el("b", "", name || fmtCode(code)), el("small", "", sub || ""));
  r.append(art, t);
  const out = social.requests().out.some((o) => o.code === code);
  if (social.isFriend(code)) r.append(el("span", "fr-tag", "Friends"));
  else if (out) r.append(el("span", "fr-tag", "Sent"));
  else {
    const b = btn("btn-ghost btn-sm", "Add", "user-plus", k + ":" + code);
    b.addEventListener("click", async () => { O.sfx("click"); const res = await social.add(code, name); O.toast(res.msg, 2800); });
    r.append(b);
  }
  return r;
}

// ---------------------------------------------------------------------------- the party drawer
function buildOverlays() {
  const menu = $("screen-menu");
  if (!menu || $("party-drawer")) return;
  const d = el("div", "party-drawer");
  d.id = "party-drawer"; d.hidden = true;
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "pd-title");
  d.innerHTML = '<div class="pd-panel glow-card"><div class="pd-head"><h3 class="pd-title" id="pd-title">Your party</h3><button class="icon-btn" id="pd-close" type="button" aria-label="Close"></button></div><div class="pd-body" id="pd-body"></div></div>';
  menu.append(d);
  $("pd-close").append(icon("x"));
  $("pd-close").addEventListener("click", () => { O.sfx("click"); closeDrawer(); });
  d.addEventListener("click", (e) => { if (e.target === d) closeDrawer(); });

  const pm = el("div", "portal-menu");
  pm.id = "portal-menu"; pm.hidden = true;
  pm.setAttribute("role", "dialog"); pm.setAttribute("aria-modal", "true");
  menu.append(pm);
  pm.addEventListener("click", (e) => { if (e.target === pm) closeMenu(); });

  const cf = el("div", "fr-confirm");
  cf.id = "fr-confirm"; cf.hidden = true;
  cf.setAttribute("role", "alertdialog"); cf.setAttribute("aria-modal", "true"); cf.setAttribute("aria-labelledby", "frc-text");
  cf.innerHTML = '<div class="frc-panel glow-card"><p id="frc-text"></p><div class="frc-acts"><button class="btn btn-primary" id="frc-yes" type="button"><span>OK</span></button><button class="btn btn-ghost" id="frc-no" type="button">Cancel</button></div></div>';
  menu.append(cf);
  $("frc-yes").addEventListener("click", () => { O.sfx("click"); if (confirmDone) confirmDone(true); });
  $("frc-no").addEventListener("click", () => { O.sfx("click"); if (confirmDone) confirmDone(false); });

  const sn = el("div", "social-notes");
  sn.id = "social-notes"; sn.hidden = true;
  menu.append(sn);
}

function openDrawer() {
  const d = $("party-drawer");
  if (!d) return;
  renderDrawer();
  d.hidden = false;
  d.classList.remove("in"); void d.offsetWidth; d.classList.add("in");
  setTimeout(() => { if (input.mode !== "touch") { const b = d.querySelector(".pd-body .btn-primary:not([disabled]), .pd-body button:not([disabled]), .pd-body input"); if (b) b.focus({ preventScroll: true }); } }, 40);
}
function closeDrawer() { const d = $("party-drawer"); if (!d || d.hidden) return false; d.hidden = true; O.ui.ensureFocus && setTimeout(() => O.ui.ensureFocus(), 30); return true; }
function renderDrawer() {
  const box = $("pd-body");
  if (!box) return;
  keepFocus(box, () => {
    box.replaceChildren();
    // the party: its code and who's in
    const top = el("div", "pd-party");
    if (party.on) {
      const others = party.others;
      $("pd-title").textContent = party.leading ? "Your party · " + party.members.length + "/4" : (party.leader ? party.leader.name + "'s party" : "Party") + " · " + party.members.length + "/4";
      const cb = el("div", "pd-code");
      cb.append(el("small", "", "Party code"), el("b", "", party.code));
      const cp = btn("btn-ghost btn-sm", "Copy link", "link", "pd:copy");
      cp.addEventListener("click", async () => { O.sfx("click"); O.toast((await copy(siteBase() + "/game/?party=" + party.code)) ? "Party link copied: anyone with it can join" : "Party code: " + party.code, 2600); });
      cb.append(cp);
      top.append(cb);
      const mem = el("div", "pd-members");
      for (const m of party.members.slice().sort((a, b) => a.slot - b.slot)) {
        const r = el("div", "pd-mem");
        r.style.setProperty("--slot", SLOT_COL[m.slot] || "#63f4ff");
        const art = el("span", "fr-art sm"); art.append(O.lookArt(m.suit, 30, 34));
        r.append(art, el("b", "", m.name + (m.id === net.id ? " (you)" : "")));
        if (m.slot === 0) r.append(el("span", "fr-tag", "Leader"));
        mem.append(r);
      }
      top.append(mem);
      const lv = btn("btn-ghost btn-sm", party.leading && others.length ? "Disband party" : "Leave party", "log-out", "pd:leave");
      lv.addEventListener("click", async () => { O.sfx("click"); if (others.length && !(await confirmBox(party.leading ? "Disband the party? Everyone goes back to playing solo." : "Leave the party?", party.leading ? "Disband" : "Leave", true))) return; party.leave(); renderDrawer(); });
      top.append(lv);
    } else {
      $("pd-title").textContent = "Start a party";
      top.append(el("p", "fr-note", "Invite friends below, or open a party and send its link to anyone. Up to 4 players."));
      const row = el("div", "pd-row");
      const open = btn("btn-ghost btn-sm", party.busy ? "Opening…" : "Open a party (code)", "users", "pd:open");
      open.disabled = party.busy;
      open.addEventListener("click", async () => { O.sfx("click"); await party.ensure(); renderDrawer(); });
      row.append(open);
      top.append(row);
      const jf = el("form", "pd-join");
      jf.autocomplete = "off";
      const inp = el("input");
      inp.type = "text"; inp.maxLength = 5; inp.placeholder = "CODE"; inp.dataset.k = "pd:code"; inp.setAttribute("aria-label", "Party code");
      inp.setAttribute("autocapitalize", "characters"); inp.spellcheck = false;
      const jb = btn("btn-ghost btn-sm", "Join", "log-in", "pd:join");
      jb.type = "submit";
      jf.append(inp, jb);
      jf.addEventListener("submit", async (e) => { e.preventDefault(); O.sfx("click"); if (await party.join(inp.value)) { closeDrawer(); O.hangar.tab("play"); } else renderDrawer(); });
      top.append(jf);
    }
    box.append(top);

    // friends to invite
    const sec = el("div", "pd-friends");
    sec.append(el("h4", "fr-h4", "Invite friends"));
    if (!social.me) {
      sec.append(el("p", "fr-note small", social.state === "connecting" ? "Connecting to friends…" : "Sign in with Discord to invite friends from here."));
      if (social.state !== "connecting" && social.why !== "unsupported") {
        const s = btn("btn-ghost btn-sm", "Sign in", "log-in", "pd:signin");
        s.addEventListener("click", () => { O.sfx("click"); O.signIn(); });
        sec.append(s);
      }
    } else {
      const list = social.friends();
      const on = list.filter((f) => f.online), off = list.filter((f) => !f.online);
      if (!list.length) sec.append(el("p", "fr-note small", "No friends yet. Add some in the Friends tab."));
      else if (!on.length) sec.append(el("p", "fr-note small", "None of your friends are online right now."));
      for (const f of on) sec.append(friendRow(f));
      if (off.length) sec.append(el("p", "fr-note small", off.length + " offline"));
      const ft = btn("btn-ghost btn-sm", "Friends tab", "users", "pd:friends");
      ft.addEventListener("click", () => { O.sfx("click"); closeDrawer(); O.hangar.tab("friends"); });
      sec.append(ft);
    }
    box.append(sec);
    const open = el("label", "set-row set-check pd-open");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!social.prefs.partyOpen; cb.dataset.k = "pd:open-pref";
    cb.addEventListener("change", () => social.setPrefs({ partyOpen: cb.checked }));
    const sp = el("span", "", "Friends can join without an invite");
    open.append(cb, sp);
    if (social.me) box.append(open);
  });
}

// ---------------------------------------------------------------------------- the portals beside you
/** For the Play stage: who stands in each portal. [{ kind: "empty" | "pending" | "member", name, look, col, leader, id, code }] */
let slotsCache = null, slotsAt = 0;
export function portalSlots() {
  // the stage asks every frame: work it out a few times a second at most
  const t = performance.now();
  if (slotsCache && t - slotsAt < 250) return slotsCache;
  slotsAt = t;
  const out = [null, null, null];
  let i = 0;
  for (const m of party.others.slice(0, 3)) out[i++] = { kind: "member", id: m.id, name: m.name, look: m.suit, col: SLOT_COL[m.slot] || "#63f4ff", leader: m.slot === 0, ready: !!m.ready, code: tagOf(m.suit) };
  for (const v of Object.values(social.pendingInvites())) {
    if (i >= 3) break;
    if (inMyParty(v.to)) continue;
    const f = social.friend(v.to);
    out[i++] = { kind: "pending", name: f ? f.name : "a friend", look: f ? f.look : "", col: "#a57bff" };
  }
  for (let j = 0; j < 3; j++) if (!out[j]) out[j] = { kind: "empty", col: j === 1 ? "#a57bff" : "#63f4ff" };
  // the third portal (the fourth player) only opens once the first two are taken
  if (out[0].kind === "empty" || out[1].kind === "empty") out[2] = null;
  slotsCache = out;
  return out;
}
function buildPortals() {
  const stage = document.querySelector("#hpane-play .hp-stage");
  if (!stage || $("portals")) return;
  const box = el("div", "portals");
  box.id = "portals";
  for (let i = 0; i < 3; i++) {
    const b = el("button", "portal-slot");
    b.type = "button";
    b.dataset.slot = String(i);
    b.dataset.k = "portal:" + i;
    b.addEventListener("click", () => { O.sfx("click"); onPortal(i); });
    box.append(b);
  }
  const bar = el("div", "party-bar");
  bar.id = "party-bar"; bar.hidden = true;
  stage.append(box, bar);
}
function onPortal(i) {
  const s = portalSlots()[i];
  if (!s || s.kind !== "member") { openDrawer(); return; }
  openMenu(s);
}
function openMenu(s) {
  const pm = $("portal-menu");
  pm.replaceChildren();
  const p = el("div", "pm-panel glow-card");
  const art = el("span", "fr-art"); art.append(O.lookArt(s.look, 56, 62));
  p.append(art, el("b", "pm-name", s.name), el("small", "pm-sub", s.leader ? "Party leader" : "In your party"));
  const acts = el("div", "pm-acts");
  if (s.code && social.me && !social.isFriend(s.code) && s.code !== social.me.code) {
    const a = btn("btn-primary btn-sm", "Add friend", "user-plus", "pm:add");
    a.addEventListener("click", async () => { O.sfx("click"); const r = await social.add(s.code, s.name); O.toast(r.msg, 2800); closeMenu(); });
    acts.append(a);
  }
  if (party.leading && !s.leader) {
    const k = btn("btn-ghost btn-sm", "Remove from party", "log-out", "pm:kick");
    k.addEventListener("click", async () => { O.sfx("click"); closeMenu(); if (await confirmBox("Remove " + s.name + " from the party?", "Remove", true)) party.kick(s.id); });
    acts.append(k);
  }
  const c = btn("btn-ghost btn-sm", "Close", "", "pm:close");
  c.addEventListener("click", () => { O.sfx("click"); closeMenu(); });
  acts.append(c);
  p.append(acts);
  pm.append(p);
  pm.hidden = false;
  setTimeout(() => { const b = pm.querySelector("button"); if (b && input.mode !== "touch") b.focus({ preventScroll: true }); }, 30);
}
function closeMenu() { const pm = $("portal-menu"); if (!pm || pm.hidden) return false; pm.hidden = true; O.ui.ensureFocus && setTimeout(() => O.ui.ensureFocus(), 30); return true; }

/** The portal buttons and the party bar, to match who's in. (Where they sit is the stage's job: placePortals.) */
function renderPortals() {
  const box = $("portals");
  if (!box) return;
  const slots = portalSlots();
  keepFocus(box, () => {
    [...box.children].forEach((b, i) => {
      const s = slots[i];
      b.hidden = !s;
      if (!s) return;
      b.className = "portal-slot " + s.kind;
      b.style.setProperty("--pc", s.col);
      b.replaceChildren();
      if (s.kind === "empty") {
        b.append(el("span", "portal-plus", "+"), el("span", "portal-lbl", "Invite"));
        b.setAttribute("aria-label", "Invite a friend to your party");
      } else if (s.kind === "pending") {
        b.append(el("span", "portal-lbl", "Inviting " + s.name + "…"));
        b.setAttribute("aria-label", "Inviting " + s.name + ". Open the party");
      } else {
        const nm = el("span", "portal-name" + (s.leader ? "" : s.ready ? " ready" : " notready"));
        if (s.leader) nm.append(icon("crown"));
        nm.append(el("span", "", s.name));
        if (!s.leader) nm.append(el("em", "", s.ready ? "\u2713" : "\u2026"));
        b.append(nm);
        b.setAttribute("aria-label", s.name + (s.leader ? ", party leader" : s.ready ? ", ready" : ", not ready") + ". Options");
      }
    });
  });
  const bar = $("party-bar");
  if (bar) {
    bar.hidden = !party.on;
    if (party.on) {
      bar.replaceChildren();
      bar.append(icon("users"), el("span", "", (party.leading ? "Your party" : "In a party") + " · " + party.members.length + "/4 · " + party.code));
    }
  }
}
/** Called by the Play stage every frame with where each portal is: { x (centre), top, w, h } in CSS pixels. */
export function placePortals(spots) {
  const box = $("portals");
  if (!box) return;
  for (let i = 0; i < box.children.length; i++) {
    const b = box.children[i], p = spots[i];
    if (!p) continue;
    const key = Math.round(p.x - p.w / 2) + "," + Math.round(p.top) + "," + Math.round(p.w) + "," + Math.round(p.h);
    if (b._k === key) continue;
    b._k = key;
    b.style.left = Math.round(p.x - p.w / 2) + "px"; b.style.top = Math.round(p.top) + "px";
    b.style.width = Math.round(p.w) + "px"; b.style.height = Math.round(p.h) + "px";
  }
}

/** The PLAY button, with a party: who starts it. */
function decoratePlay() {
  const b = $("play-btn"), sub = $("play-sub");
  if (!b || !sub) return;
  const base = sub.dataset.base || sub.textContent;
  const guest = party.on && !party.leading;
  const lead = party.leader ? party.leader.name : "the leader";
  b.classList.toggle("waiting", guest && party.ready);
  b.classList.toggle("ready-up", guest && !party.ready);
  let big = "Play", small = base;
  if (guest) {
    big = party.ready ? "Ready \u2713" : "Ready up";
    small = party.ready ? "Waiting for " + lead + " to start · tap to unready" : lead + " picked " + base;
  } else if (party.on && party.members.length > 1) {
    const wait = party.waitingFor;
    small = wait.length ? (party.pending ? "Waiting for " : "Not ready: ") + wait.map((m) => m.name).join(", ") : "Party of " + party.members.length + " · " + base;
  }
  b.querySelector(".play-txt b").textContent = big;
  sub.textContent = small;
}

// ---------------------------------------------------------------------------- the hangar's hooks
let partySig = "";
function refreshAll() {
  if (!O) return;
  slotsCache = null;
  const sig = [party.on, party.leading, party.pick && party.pick.mode, party.pick && party.pick.diff, party.ready, party.pending, party.members.map((m) => m.id + (m.ready ? "r" : "")).join()].join("|");
  if (sig !== partySig) { partySig = sig; if (O.hangar.now() === "play" && O.ui.screen === "menu") O.hangar.refresh(); }
  renderNotes();
  renderPortals();
  decoratePlay();
  const dot = $("friends-dot");
  if (dot) dot.hidden = !(social.counts.inc > 0);
  const cnt = $("friends-count");
  if (cnt) { const n = social.counts.online; cnt.textContent = n ? String(n) : ""; cnt.hidden = !n; }
  if (O.hangar.now() === "friends" && O.ui.screen === "menu") renderPane();
  const d = $("party-drawer");
  if (d && !d.hidden) renderDrawer();
}
function renderPane() {
  buildPane();
  renderMe(); renderList(); renderSide(); renderPrefs();
  $("fr-add").hidden = !social.me;
  $("fr-privacy").hidden = !social.me && social.why !== "disabled";
}

/** A guest's ready check: the leader pressed PLAY. */
function readyCheck(name, pick) {
  const what = pick ? (pick.mode === "rush" ? "Boss Rush" : "The Sin Ladder") + " · " + (BALANCE.difficulty[pick.diff] || { name: "" }).name : "";
  note({ kind: "inv", key: "ready", id: "ready", title: name + " is ready to play", body: what,
    actions: [{ label: "Ready up", icon: "check", primary: true, fn: () => party.setReady(true) }], ttl: 120000 });
  O.sfx("achv");
}

export const friendsUI = {
  readyCheck,
  init(o) {
    O = o;
    buildOverlays();
    buildPortals();
    social.onChange(refreshAll);
    party.onChange(refreshAll);
    social.onEvent(onSocialEvent);
    setInterval(() => { renderNotes(); if (O.hangar.now() === "friends" && O.ui.screen === "menu" && communityOpen) renderFindList(); }, 5000);
    readLinks();
    refreshAll();
  },
  /** The Friends tab opened or closed. */
  tab(on) {
    if (on) { renderPane(); if (social.me && !communityOpen) { communityOpen = true; social.openCommunity(); } }
    else if (communityOpen) { communityOpen = false; social.closeCommunity(); }
  },
  refresh: refreshAll,
  decoratePlay,
  openDrawer,
  /** Esc / Back: closes the topmost social overlay. */
  back() {
    if ($("fr-confirm") && !$("fr-confirm").hidden) { if (confirmDone) confirmDone(false); return true; }
    if (closeMenu()) return true;
    if (closeDrawer()) return true;
    return false;
  },
};
