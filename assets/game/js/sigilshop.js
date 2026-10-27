/* Getting Sigils with money (4.7): packs bought through Stripe's own checkout page (card details never come near
   the game or the site). It needs the 4.7 server pieces (docs/game-4.7.sql and the two functions in docs/server/,
   set up as docs/SIGIL_STORE.md says, then SIGIL_STORE: true in the site's config.js). Until then nothing here shows.

   Fair by design: Sigils only buy cosmetics (nothing that changes a fight), everything in the Item Shop can also be
   earned by playing, a pack is a plain number of Sigils (nothing random), prices are shown in money, and there's a
   monthly limit per account.

   Paid Sigils belong to your account. The server keeps the total (paid orders, less refunds); whenever it changes,
   the difference goes on (or comes off) your balance, on every device you sign in on. */

import { G } from "./state.js";
import { store } from "./storage.js";
import { online } from "./online.js";

const sb = () => (window.EG && window.EG.sb) || null;
// the site's config.js turns the store on (SIGIL_STORE: true) once the server side is set up; until then the game
// doesn't ask the server at all (so nothing fails in the console)
const wanted = () => !!(window.EG_CONFIG && window.EG_CONFIG.SIGIL_STORE === true);
const PENDING = "eg-sigil-checkout";

export const sigilShop = {
  /** "unknown" until loaded, "off" (no server pieces, or switched off), "on". */
  state: "unknown",
  packs: [],
  cap: 0,              // cents in 30 days
  month: 0,            // what you've spent in the last 30 days (cents)
  orders: [],
  watching: false,

  /** Is the store open (and can this player use it)? */
  get open() { return this.state === "on" && this.packs.length > 0; },

  async load() {
    if (!sb() || !wanted()) { this.state = "off"; return this; }
    try {
      const r = await sb().rpc("game_sigil_store");
      const d = r.data;
      if (r.error || !d || typeof d !== "object") { this.state = "off"; return this; }
      this.packs = (Array.isArray(d.packs) ? d.packs : []).filter((p) => p && p.id && p.sigils > 0 && p.cents > 0);
      this.cap = Number(d.cap) || 0;
      this.state = d.on ? "on" : "off";
    } catch (e) { this.state = "off"; }
    G.emit("sigilStore");
    return this;
  },

  /** Your paid Sigils from the server: any change since last time goes on (or off) the balance. Returns the change. */
  async sync() {
    if (!sb() || !online.user || !wanted()) return 0;
    try {
      const r = await sb().rpc("game_sigils_bought");
      const d = r.data;
      if (r.error || !d || typeof d !== "object") return 0;
      this.orders = Array.isArray(d.orders) ? d.orders : [];
      this.month = Number(d.month) || 0;
      return this.credit(online.user.id, Math.max(0, Math.round(Number(d.total) || 0)));
    } catch (e) { return 0; }
  },

  /** Puts a new server total on the balance (pure bookkeeping, tests call it directly). */
  credit(uid, total) {
    const s = store.data;
    const prev = (s.paid && s.paid.total) || 0;            // another account's Sigils on this device come off too
    const delta = total - prev;
    s.paid = { uid, total, at: Date.now() };
    if (delta) {
      s.sigils = Math.max(0, (s.sigils || 0) + delta);
      store.save(true);
      G.emit("sigilsPaid", { delta, total });
    } else store.save();
    return delta;
  },

  /** Opens Stripe's checkout for a pack. On the website the page goes there and comes back; in the apps the
      browser opens it and the game watches for the Sigils to land. Throws with a message to show. */
  async checkout(packId) {
    const C = window.EG_CONFIG || {};
    if (!sb() || !online.user) throw new Error("Sign in to buy Sigils.");
    const { data } = await sb().auth.getSession();
    const tok = data && data.session && data.session.access_token;
    if (!tok) throw new Error("Sign in to buy Sigils.");
    let res;
    try {
      res = await fetch(String(C.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1/sigil-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: C.SUPABASE_KEY || "" },
        body: JSON.stringify({ pack: packId }),
      });
    } catch (e) { throw new Error("Couldn't reach checkout. Check your connection and try again."); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.url) throw new Error(out.error || (res.status === 404 ? "The Sigil store isn't set up yet." : "Checkout couldn't start. Try again in a moment."));
    if (!/^https:\/\/checkout\.stripe\.com\//.test(out.url)) throw new Error("Checkout sent back an address that isn't Stripe's, so we stopped.");
    try { sessionStorage.setItem(PENDING, JSON.stringify({ at: Date.now(), pack: packId })); } catch (e) { /* fine */ }
    if (G.desktop || G.androidApp) this.watch();             // the apps hand the page to your browser and stay put
    location.href = out.url;
    return true;
  },

  /** After a checkout: look for the Sigils every few seconds for ten minutes. */
  watch(ms = 600000) {
    if (this.watching) return;
    this.watching = true;
    const until = Date.now() + ms;
    const tick = async () => {
      const got = await this.sync();
      if (got > 0 || Date.now() > until) { this.watching = false; return; }
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 2500);
  },

  /** Coming back from Stripe on the website: ?sigils=paid&session_id=... or ?sigils=canceled. */
  returning() {
    let how = "";
    try {
      const u = new URL(location.href);
      how = u.searchParams.get("sigils") || "";
      if (!how) return "";
      u.searchParams.delete("sigils"); u.searchParams.delete("session_id");
      history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      sessionStorage.removeItem(PENDING);
    } catch (e) { /* fine */ }
    if (how === "paid") this.watch();
    return how === "paid" ? "paid" : how === "canceled" ? "canceled" : "";
  },

  /** A price for the screen: 499, "usd" -> "$4.99" (in the player's own number format). */
  money(cents, cur) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(cur || "usd").toUpperCase() }).format(cents / 100); }
    catch (e) { return (cents / 100).toFixed(2) + " " + String(cur || "").toUpperCase(); }
  },
};
