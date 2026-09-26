/* Envious Gluttony™ homepage: live numbers from the Gluttony™ bot (through Supabase).
   Instant updates over Supabase Realtime, with a quiet check every 30s as a backup. */
(function () {
  "use strict";

  const API = window.EG_HOME_API;
  const C = window.EG_CONFIG || {};
  if (!API || !window.fetch || !/^https?:\/\//.test(C.SUPABASE_URL || "") || !C.SUPABASE_KEY) return;

  const base = C.SUPABASE_URL.replace(/\/+$/, "");
  const headers = { apikey: C.SUPABASE_KEY, Authorization: "Bearer " + C.SUPABASE_KEY };
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { /* keep UTC */ }

  const POLL = 30e3;          // backup check when instant updates aren't connected
  const POLL_SLOW = 180e3;    // backup check while instant updates are connected
  let lastAt = 0;
  let lastJoin;
  let realtime = false;
  let timer = null;
  let chartTimer = null;

  // Postgres sends microseconds; not every browser parses more than 3 decimals.
  const parseTime = (s) => Date.parse(String(s || "").replace(/(\.\d{3})\d+/, "$1")) || 0;

  async function getJSON(path, init) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const kill = setTimeout(() => ctrl && ctrl.abort(), 12000);
    try {
      const res = await fetch(base + path, Object.assign({ credentials: "omit", signal: ctrl ? ctrl.signal : undefined }, init, {
        headers: Object.assign({}, headers, (init && init.headers) || {})
      }));
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(kill);
    }
  }

  function apply(row) {
    if (!row || !row.data) return;
    const at = parseTime(row.updated_at) || Date.now();
    if (at < lastAt) return;               // older than what's on screen
    lastAt = at;
    API.applyLive(row.data, at);
    // someone joined: refresh the chart's volume bars (a moment later, so the hour's joins are in)
    const lj = row.data.last_join;
    if (lastJoin !== undefined && lj !== lastJoin) {
      clearTimeout(chartTimer);
      chartTimer = setTimeout(API.reloadChart, 1500);
    }
    lastJoin = lj;
  }

  async function loadStats() {
    const rows = await getJSON("/rest/v1/site_stats?select=data,updated_at&id=eq.live");
    if (Array.isArray(rows) && rows[0]) apply(rows[0]);
  }

  API.setHistoryLoader(async (range) => {
    const rows = await getJSON("/rest/v1/rpc/member_history_range", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_range: range, p_tz: tz })
    });
    if (!Array.isArray(rows) || !rows.some((r) => r.members !== null)) throw new Error("no history yet");
    return rows.map((r) => ({ t: parseTime(r.t), m: r.members, j: r.joins || 0 }));
  });

  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(tick, realtime ? POLL_SLOW : POLL);
  }
  async function tick() {
    try { await loadStats(); } catch (e) { /* offline or not set up yet: keep what's on screen */ }
    schedule();
  }

  function subscribe() {
    const sb = window.EG && window.EG.sb;
    if (!sb || typeof sb.channel !== "function") return;
    try {
      sb.channel("eg-site-stats")
        .on("postgres_changes", { event: "*", schema: "public", table: "site_stats", filter: "id=eq.live" }, (payload) => {
          if (payload && payload.new) apply(payload.new);
        })
        .subscribe((status) => {
          const was = realtime;
          realtime = status === "SUBSCRIBED";
          if (realtime && !was) tick();    // catch anything sent while connecting
          else schedule();
        });
    } catch (e) {
      realtime = false;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else { tick(); API.reloadChart(); }
  });

  tick();
  subscribe();
  window.EG_LIVE = { refresh: tick, get realtime() { return realtime; } };
})();
