// Envious Glider: Stripe's webhook for Sigil purchases (a Supabase Edge Function named "sigil-webhook").
// Deploy it from the Supabase dashboard (see docs/SIGIL_STORE.md) with "Verify JWT" turned OFF: Stripe calls it,
// not a player, and it proves itself with Stripe's signature instead (checked below; anything unsigned is refused).
//
// What it does with each event:
//   checkout.session.completed / async_payment_succeeded (paid)  -> the order is paid: the Sigils are the player's
//   checkout.session.expired / async_payment_failed               -> the order is dropped
//   charge.refunded (in full)                                     -> refunded: the Sigils come back off
//   charge.dispute.created                                        -> disputed: the Sigils come back off
//   charge.dispute.closed (won)                                   -> paid again
// The game adds up a player's paid orders (game_sigils_bought), so marking an order is all it takes, and Stripe
// sending the same event twice changes nothing.
//
// Secrets it needs (Edge Functions -> Secrets): STRIPE_WEBHOOK_SECRET (whsec_..., from the webhook in Stripe).

const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHSEC = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

async function db(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json", Prefer: "return=representation" };
  if (SERVICE.startsWith("eyJ")) headers.Authorization = "Bearer " + SERVICE;
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error("db " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.status === 204 ? [] : await r.json();
}
const ok = (msg = "ok", status = 200) => new Response(msg, { status });

/** Stripe's signature: "t=<time>,v1=<hex hmac-sha256 of `${t}.${payload}`>", within five minutes. */
async function verifyStripe(payload: string, header: string, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = (parts.find((p) => p[0] === "t") || [])[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1] || "");
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + payload)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  return sigs.some((s) => same(s, hex));
}

const idOk = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_]{6,255}$/.test(s);

/** A paid checkout: mark its order paid. If the order row is missing (it failed to save), make it from the
    session's own metadata, which only sigil-checkout (holding the secret key) can have set. */
async function paid(s: Record<string, any>) {
  if (!idOk(s.id)) return;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
  const done = await db("game_sigil_orders?session_id=eq." + s.id + "&status=in.(pending,expired)", {
    method: "PATCH", body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString(), payment_intent: pi }),
  });
  if (done.length) return;
  const have = await db("game_sigil_orders?session_id=eq." + s.id + "&select=status");
  if (have.length) return;                                   // already paid (or refunded since): nothing to do
  const m = s.metadata || {};
  const sigils = Number(m.sigils);
  if (!m.user_id || !m.pack || !(sigils > 0)) { console.error("paid session without metadata", s.id); return; }
  await db("game_sigil_orders", {
    method: "POST",
    body: JSON.stringify({ session_id: s.id, user_id: m.user_id, pack: m.pack, sigils, cents: s.amount_total, currency: s.currency, status: "paid", payment_intent: pi, paid_at: new Date().toISOString() }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok("POST only", 405);
  if (!SB || !SERVICE || !WHSEC) return ok("not set up", 503);
  const raw = await req.text();
  if (!(await verifyStripe(raw, req.headers.get("Stripe-Signature") ?? "", WHSEC))) return ok("bad signature", 400);
  let ev: Record<string, any>;
  try { ev = JSON.parse(raw); } catch { return ok("bad json", 400); }
  const o = (ev.data && ev.data.object) || {};
  try {
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        if (o.payment_status === "paid") await paid(o);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        if (idOk(o.id)) await db("game_sigil_orders?session_id=eq." + o.id + "&status=eq.pending", { method: "PATCH", body: JSON.stringify({ status: "expired" }) });
        break;
      case "charge.refunded":
        if (idOk(o.payment_intent) && o.amount_refunded >= o.amount) await db("game_sigil_orders?payment_intent=eq." + o.payment_intent + "&status=in.(paid,disputed)", { method: "PATCH", body: JSON.stringify({ status: "refunded" }) });
        break;
      case "charge.dispute.created":
        if (idOk(o.payment_intent)) await db("game_sigil_orders?payment_intent=eq." + o.payment_intent + "&status=eq.paid", { method: "PATCH", body: JSON.stringify({ status: "disputed" }) });
        break;
      case "charge.dispute.closed":
        if (idOk(o.payment_intent) && o.status === "won") await db("game_sigil_orders?payment_intent=eq." + o.payment_intent + "&status=eq.disputed", { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
        break;
    }
  } catch (e) {
    console.error(ev.type, e);
    return ok("retry", 500);                                  // Stripe tries again later
  }
  return ok();
});
