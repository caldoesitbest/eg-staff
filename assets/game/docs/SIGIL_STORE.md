# Selling Sigils (the "Get Sigils" store)

The game has a "Get Sigils" button in the Item Shop that sells packs of Sigils for real money through Stripe.
**It stays hidden until you finish the steps below.** Nothing is charged, and nothing changes for players, until
you switch it on in step 7.

## How it works

- A player picks a pack in the game. The `sigil-checkout` function checks who they are and reads the price
  from the database, never from the game. It checks the monthly limit, then sends them to **Stripe's own
  checkout page**. Card details only ever go to Stripe.
- When the payment goes through, Stripe calls the `sigil-webhook` function. It checks Stripe's signature and
  marks the order paid.
- The game adds up the player's paid orders and puts them on their balance on every device they sign in on.
  If you refund a payment, or it's disputed, the Sigils come back off.
- Players must be signed in with Discord to buy, because purchases belong to the account.

## Why it's fair

- **Sigils only buy cosmetics.** Nothing for sale changes how a fight goes, and every item can also be earned by
  playing (Sigils come from contracts, achievements, bosses, levels and runs).
- **A pack is a plain number of Sigils.** There are no loot boxes and nothing random.
- **Prices are shown in money**, with a modest bonus on bigger packs:

  | Pack | Price | Sigils | Value |
  | --- | --- | --- | --- |
  | Pouch | $1.99 | 500 | |
  | Stack | $4.99 | 1,300 | +4% |
  | Chest | $9.99 | 2,800 | +12% |
  | Vault | $19.99 | 6,000 | +19% |

- **For a sense of value:** an Epic item is 600 Sigils (about $2.40), and a whole collection is about 1,600
  (about $6). A player doing the daily contracts earns about 290 a day.
- **Each account can spend at most $50 in any 30 days.** You can change this limit.
- The store shows "Under 18? Ask a parent or guardian before you buy."

## What you need

- A **Stripe account** (stripe.com). Stripe needs the account holder to be 18 or older, plus ID and a bank
  account for payouts. Sigils can't be cashed out or transferred, so this is closed-loop in-game currency, which
  Stripe allows for games.
- Your **Supabase dashboard** (the same project as the website).

Do everything in Stripe's **Test mode** first (the toggle at the top of the Stripe dashboard). Switch to live
at the end.

## Setup (about 20 minutes)

1. **Run the SQL.** In Supabase, go to SQL Editor, then New query. Paste all of
   `assets/game/docs/game-4.7.sql` and click Run. It adds three tables and two functions and changes nothing
   that already exists.

2. **Create the checkout function.**
   1. In Supabase, go to Edge Functions, then "Deploy a new function", then "Via Editor".
   2. Name it exactly `sigil-checkout`.
   3. Replace the starter code with all of `assets/game/docs/server/sigil-checkout.ts`, then deploy.
   4. Leave **Verify JWT ON** (the default).

3. **Create the webhook function** the same way:
   1. Name it exactly `sigil-webhook`.
   2. Paste all of `assets/game/docs/server/sigil-webhook.ts`, then deploy.
   3. Then open the function's settings and turn **Verify JWT OFF**. Stripe calls this one, not a player; it
      checks Stripe's signature instead.

4. **Get your Stripe key.** In Stripe (Test mode), go to Developers, then API keys, and copy the **Secret key**
   (`sk_test_...`).

5. **Add the webhook in Stripe.**
   1. In Stripe, go to Developers, then Webhooks, then "Add endpoint".
   2. Endpoint URL: `https://ybtsdtpcxinttnshbicl.supabase.co/functions/v1/sigil-webhook`
   3. Events to send:
      - `checkout.session.completed`
      - `checkout.session.async_payment_succeeded`
      - `checkout.session.async_payment_failed`
      - `checkout.session.expired`
      - `charge.refunded`
      - `charge.dispute.created`
      - `charge.dispute.closed`
   4. Save it, then copy its **Signing secret** (`whsec_...`).

6. **Give the functions the two secrets.** In Supabase, go to Edge Functions, then Secrets, and add:
   - `STRIPE_SECRET_KEY`: the `sk_test_...` key from step 4.
   - `STRIPE_WEBHOOK_SECRET`: the `whsec_...` secret from step 5.

   Never paste either into the website's code, `config.js`, Discord or anywhere public. They only go in
   Supabase's Secrets.

7. **Switch the store on.** Two parts:
   - In the SQL Editor, run: `update public.game_sigil_config set enabled = true where id = 1;`
   - In `assets/config.js` (the site's settings file), add this line inside `window.EG_CONFIG = { ... }`:
     `SIGIL_STORE: true,`. Until it's there, the game doesn't ask the server about the store at all.

8. **Test it.**
   1. Sign in on the website, open the Item Shop, and click **Get Sigils**.
   2. Buy a pack with Stripe's test card `4242 4242 4242 4242`, any future date and any CVC.
   3. You land back in the game, and the Sigils appear within a few seconds.
   4. Then refund the payment from the Stripe dashboard (Payments, then the payment, then Refund). The next
      time the game checks (opening Get Sigils, or signing in), the Sigils come back off.

9. **Go live.**
   1. Activate payments in Stripe (business details, ID, bank account).
   2. Switch the Stripe dashboard to live mode.
   3. Repeat step 4 (the live key is `sk_live_...`) and step 5 (a live webhook gets its own `whsec_...`).
   4. Update both secrets in Supabase.

## Changing things later (SQL Editor)

- **Turn the store off:** `update public.game_sigil_config set enabled = false where id = 1;`
- **Change the monthly limit** (in cents): `update public.game_sigil_config set month_cap_cents = 3000 where id = 1;`
- **Change a price** (cents) or amount: `update public.game_sigil_packs set cents = 449, sigils = 1300 where id = 'stack';`
- **Hide a pack:** `update public.game_sigil_packs set active = false where id = 'vault';`
- **See orders:** `select * from public.game_sigil_orders order by created_at desc limit 50;`

## Before you take real money

- **Write a short purchase policy** and link it somewhere players can see, for example the Discord or the site
  footer. It should say:
  - Sigils have no cash value and can't be transferred.
  - What your refund rule is (a common one: refunds within 14 days if the Sigils haven't been spent).
  - That purchases are tied to the Discord account.
- **Taxes:** depending on where your buyers live, you may owe sales tax or VAT on digital goods. Stripe Tax can
  work it out. This isn't legal or tax advice, so check with someone qualified where you live.
- **The Android app** is installed from the website, not Google Play, so Stripe is fine there. If the game ever
  goes on Google Play or the App Store, they require their own payment systems for in-game currency.
