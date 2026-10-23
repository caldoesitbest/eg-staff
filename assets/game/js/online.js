/* Online: Discord sign-in (through the site's own sign-in page), the leaderboard, and posting runs.
   Uses the site's Supabase client (window.EG from assets/supa.js). Everything fails soft: offline,
   or before the leaderboard SQL has been run, the game just hides the online bits. */

import { G } from "./state.js";
import { store } from "./storage.js";

const VERSION = "2.0";
const site = () => window.EG;

export function todayUTC() { return new Date().toISOString().slice(0, 10); }

function friendly(err) {
  const m = String((err && (err.message || err.details || err.hint)) || err || "");
  if (/could not find the function|PGRST202|does not exist|42883|42P01/i.test(m + (err && err.code))) return "missing";
  if (/failed to fetch|network|load failed/i.test(m)) return "Can't reach the leaderboard right now.";
  return m || "Something went wrong.";
}

export const online = {
  available: false,     // Supabase loaded and configured
  missing: false,       // the leaderboard SQL hasn't been run yet
  user: null,
  name: "",

  async init() {
    const EG = site();
    this.available = !!(EG && EG.configured && EG.sb);
    if (!this.available) { G.emit("auth"); return; }
    await this.refresh();
    try {
      EG.sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") setTimeout(() => this.refresh(), 0);
      });
    } catch (e) { /* older client */ }
  },

  async refresh() {
    const EG = site();
    if (!this.available) return;
    try {
      this.user = await EG.user();
      this.name = "";
      if (this.user) {
        const p = await EG.profile(true).catch(() => null);
        const m = this.user.user_metadata || {};
        this.name = (p && p.username) || m.full_name || m.name || m.user_name || "you";
      }
    } catch (e) { this.user = null; }
    G.emit("auth");
  },

  /** Web: the site's sign-in page, then straight back here. Desktop: the launcher opens it in a window. */
  signIn() {
    if (G.desktop) { window.chrome.webview.postMessage({ type: "signin" }); return; }
    location.href = "/signin/?next=" + encodeURIComponent("/game/");
  },

  async signOut() {
    try { await site().signOut(); } catch (e) { /* ignore */ }
    await this.refresh();
  },

  /** Posts a finished run. Returns { ok, rank } or { ok:false, error } or { skipped:reason }. */
  async submit(run) {
    if (G.debug.on) return { skipped: "debug" };
    if (!this.available) return { skipped: "offline" };
    if (!this.user) return { skipped: "signed-out" };
    if (!store.data.settings.postScores) return { skipped: "off" };
    if (this.missing) return { skipped: "missing" };
    try {
      const { data, error } = await site().sb.rpc("submit_game_score", {
        p_score: Math.floor(run.score), p_wave: run.wave, p_kills: run.kills, p_best_combo: run.combo,
        p_seconds: Math.floor(run.seconds), p_won: !!run.won, p_daily: run.daily || null,
        p_build: run.buildIds || {}, p_client: (G.desktop ? "desktop-" : "web-") + VERSION,
      });
      if (error) {
        const f = friendly(error);
        if (f === "missing") { this.missing = true; return { skipped: "missing" }; }
        return { ok: false, error: f };
      }
      return data && typeof data === "object" ? data : { ok: true };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  },

  /** Top runs (best per player). daily: "YYYY-MM-DD" for that day's Daily Challenge, null for all-time. */
  async board(daily) {
    if (!this.available) return { error: "offline" };
    if (this.missing) return { error: "missing" };
    try {
      const { data, error } = await site().sb.rpc("game_leaderboard", { p_daily: daily || null, p_limit: 50 });
      if (error) {
        const f = friendly(error);
        if (f === "missing") { this.missing = true; return { error: "missing" }; }
        return { error: f };
      }
      return { rows: Array.isArray(data) ? data : [] };
    } catch (e) {
      return { error: friendly(e) };
    }
  },
};
