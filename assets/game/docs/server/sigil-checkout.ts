// Envious Glider: starts a Stripe Checkout for a Sigil pack (a Supabase Edge Function named "sigil-checkout").
// Deploy it from the Supabase dashboard (see docs/SIGIL_STORE.md). Keep "Verify JWT" ON for this one.
//
// The game sends { pack: "stack" } with the player's own sign-in token. This function works out who they are,
// reads the pack's price and Sigils from the database (never from the game), checks the store is open and the
// monthly limit, records a pending order, and returns Stripe's checkout address. Card details only ever go to
// Stripe. The Sigils are added by sigil-webhook once Stripe says the payment went through.
//
// Secrets it needs (Edge Functions -> Secrets): STRIPE_SECRET_KEY. Optional: SITE_URL (default
// https://enviousgluttony.com). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE;
const STRIPE = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE = (Deno.env.get("SITE_URL") ?? "https://enviousgluttony.com").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** The database, as the service (the tables are closed to players). */
async function db(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json", Prefer: "return=representation" };
  if (SERVICE.startsWith("eyJ")) headers.Authorization = "Bearer " + SERVICE;     // a legacy service_role JWT
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error("db " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.status === 204 ? [] : await r.json();
}

const money = (cents: number, cur: string) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(cents / 100); } catch { return (cents / 100).toFixed(2) + " " + cur.toUpperCase(); }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  if (!SB || !SERVICE || !STRIPE) return json({ error: "The Sigil store isn't set up yet." }, 503);
  try {
    // who's asking: the player's own session, checked by Supabase
    const auth = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in to buy Sigils." }, 401);
    const who = await fetch(SB + "/auth/v1/user", { headers: { Authorization: auth, apikey: ANON } });
    if (!who.ok) return json({ error: "Your sign-in has expired. Sign in again to buy Sigils." }, 401);
    const user = await who.json();
    if (!user || typeof user.id !== "string") return json({ error: "Sign in to buy Sigils." }, 401);

    const body = await req.json().catch(() => ({}));
    const packId = typeof body.pack === "string" && /^[a-z0-9_]{1,24}$/.test(body.pack) ? body.pack : "";
    if (!packId) return json({ error: "Pick a pack." }, 400);

    const cfg = (await db("game_sigil_config?id=eq.1&select=enabled,month_cap_cents"))[0];
    if (!cfg || !cfg.enabled) return json({ error: "The Sigil store isn't open right now." }, 403);
    const pack = (await db("game_sigil_packs?id=eq." + packId + "&active=eq.true&select=id,name,sigils,cents,currency"))[0];
    if (!pack) return json({ error: "That pack isn't for sale any more." }, 400);

    // limits: the monthly cap, and only a few checkouts open at once
    const since = new Date(Date.now() - 30 * 86400e3).toISOString();
    const recent: { cents: number; status: string; created_at: string; paid_at: string | null }[] =
      await db("game_sigil_orders?user_id=eq." + user.id + "&created_at=gte." + encodeURIComponent(since) + "&select=cents,status,created_at,paid_at");
    const month = recent.filter((o) => o.status === "paid").reduce((n, o) => n + o.cents, 0);
    if (month + pack.cents > cfg.month_cap_cents) {
      return json({ error: "That would go past the " + money(cfg.month_cap_cents, pack.currency) + " limit for 30 days (you've spent " + money(month, pack.currency) + ")." }, 403);
    }
    const open = recent.filter((o) => o.status === "pending" && Date.now() - Date.parse(o.created_at) < 15 * 60e3).length;
    if (open >= 5) return json({ error: "You've got a few checkouts open already. Finish or close one, then try again." }, 429);

    // Stripe's hosted checkout page
    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": pack.currency,
      "line_items[0][price_data][unit_amount]": String(pack.cents),
      "line_items[0][price_data][product_data][name]": pack.sigils.toLocaleString("en-US") + " Sigils",
      "line_items[0][price_data][product_data][description]": "Envious Glider in-game currency. Spent only on cosmetics. Added to your signed-in account.",
      client_reference_id: user.id,
      "metadata[user_id]": user.id,
      "metadata[pack]": pack.id,
      "metadata[sigils]": String(pack.sigils),
      "payment_intent_data[metadata][user_id]": user.id,
      "payment_intent_data[metadata][pack]": pack.id,
      success_url: SITE + "/game/?sigils=paid&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE + "/game/?sigils=canceled",
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + STRIPE, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": crypto.randomUUID() },
      body: form,
    });
    const s = await r.json();
    if (!r.ok || !s.id || !s.url) { console.error("stripe", r.status, JSON.stringify(s).slice(0, 300)); return json({ error: "Checkout couldn't start. Try again in a moment." }, 502); }

    await db("game_sigil_orders", { method: "POST", body: JSON.stringify({ session_id: s.id, user_id: user.id, pack: pack.id, sigils: pack.sigils, cents: pack.cents, currency: pack.currency }) });
    return json({ url: s.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout couldn't start. Try again in a moment." }, 500);
  }
});
