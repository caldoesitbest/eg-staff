/* Envious Gluttony™: shared Supabase connection and account helpers */
(function () {
  "use strict";

  const C = window.EG_CONFIG;
  const RECEIPTS_KEY = "eg-receipts";
  const configured = /^https?:\/\//.test(C.SUPABASE_URL || "") && !/PASTE_/.test(String(C.SUPABASE_URL) + String(C.SUPABASE_KEY));
  const sb = configured && window.supabase
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  let profileCache = null;

  function readReceipts() {
    try {
      const list = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || "[]");
      return Array.isArray(list) ? list.filter((r) => r && typeof r.id === "string") : [];
    } catch (e) { return []; }
  }
  function writeReceipts(list) {
    try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list.slice(-10))); } catch (e) { /* ignore */ }
  }

  const EG = {
    sb: sb,
    configured: !!sb,

    async user() {
      if (!sb) return null;
      try {
        const { data } = await sb.auth.getSession();
        return data && data.session ? data.session.user : null;
      } catch (e) { return null; }
    },

    async profile(force) {
      const u = await EG.user();
      if (!u) return null;
      if (profileCache && !force && profileCache.id === u.id) return profileCache;
      const { data } = await sb.from("profiles").select("id, username").eq("id", u.id).maybeSingle();
      profileCache = data || { id: u.id, username: null };
      return profileCache;
    },

    async isAdmin() {
      if (!sb || !(await EG.user())) return false;
      const { data } = await sb.rpc("is_admin");
      return data === true;
    },

    async signOut() {
      profileCache = null;
      if (sb) await sb.auth.signOut();
    },

    /** Sends people to Discord/Google, then back to /account/ (which finishes setup and forwards on). */
    async oauth(provider, next) {
      const back = location.origin + "/account/" + (next && next !== "/account/" ? "?next=" + encodeURIComponent(next) : "");
      const options = { redirectTo: back };
      if (provider === "discord") options.scopes = "identify email";
      const { error } = await sb.auth.signInWithOAuth({ provider: provider, options: options });
      if (error) throw error;
    },

    /** Where to go after signing in. Only same-site paths are allowed. */
    nextPath(fallback) {
      const n = new URLSearchParams(location.search).get("next");
      return n && /^\/[A-Za-z0-9/_-]*$/.test(n) && !n.startsWith("//") ? n : (fallback || "/account/");
    },

    providers(user) {
      return Array.from(new Set(((user && user.identities) || []).map((i) => i.provider)));
    },

    avatar(user) {
      const m = (user && user.user_metadata) || {};
      return m.avatar_url || m.picture || "";
    },

    /* Applications sent from this device, so they can be attached after signing up. */
    receipts: readReceipts,
    addReceipt(id, discordUser) {
      const list = readReceipts().filter((r) => r.id !== id);
      list.push({ id: id, user: discordUser, at: Date.now() });
      writeReceipts(list);
    },
    async claimReceipts() {
      if (!sb || !(await EG.user())) return 0;
      let claimed = 0;
      const keep = [];
      for (const r of readReceipts()) {
        const { data, error } = await sb.rpc("claim_application", { p_id: r.id, p_discord_username: r.user || "" });
        if (error) { keep.push(r); continue; }
        if (data && data.ok) claimed++;
        else if (data && /Too many/.test(data.error || "")) keep.push(r);
      }
      writeReceipts(keep);
      return claimed;
    },

    friendlyError(err) {
      const m = String((err && (err.message || err.error_description || err.msg)) || err || "");
      if (/invalid login credentials/i.test(m)) return "That email, username or password isn't right.";
      if (/email not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for your code.";
      if (/token has expired|otp.*(expired|invalid)|invalid.*(otp|token)/i.test(m)) return "That code is wrong or has expired. Check it, or send a new one.";
      if (/rate limit|too many|security purposes/i.test(m)) return "Too many tries. Wait a minute, then try again.";
      if (/password should be|weak password/i.test(m)) return "Pick a stronger password: at least 8 characters with a number or symbol.";
      if (/should be different from the old/i.test(m)) return "That's already your password. Pick a new one.";
      if (/signups not allowed/i.test(m)) return "There's no account with that email yet. Create one below.";
      if (/failed to fetch|network|load failed/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
      return m || "Something went wrong. Try again.";
    }
  };

  window.EG = EG;
})();
