# Monetization

All prices and claims below are **placeholders pending owner approval**. Nothing has been published, charged or sent.

## What the product is
The Mutual Understanding Harness is an open test and policy engine for how an AI decides to **proceed, ask a human, or refuse**. It ships rules with reasons, a scored scenario set, an append-only decision ledger, and a Node engine (`code/engine.js`, `code/ledger.js`) any team can run with its own rules. Code is Apache-2.0; docs are CC BY 4.0, so the open core stays free and revenue comes from what sits around it.

## Who pays
- Teams shipping AI agents that touch production, money, personal data or outbound messages, and who need evidence of human-in-the-loop controls (AI governance, security, compliance leads).
- Consultancies and auditors who want a repeatable "does this model ask when it should?" test.
- AI vendors who want an independent, privately scored result for sales and procurement.

## Tiers (placeholders, see `pricing.json`)
| Tier | Price | Includes |
|---|---|---|
| Community | $0 | Engine, ledger, general rules, public sheets. 30 decisions/min. |
| Pro | $49/mo | Custom rules file, ledger export, approval queue, email support. 300/min. |
| Org | $299/mo | Pro + maintainer-scored runs, private scenario packs, priority support. 3000/min. |

## Revenue paths
1. **Pro/Org licenses** via the built-in license-key gate and Stripe checkout stub (`code/commercial/`).
2. **Scored runs** as a service: a vendor submits answers, the maintainer scores against the private key (the key is already private by design). One-off fee, e.g. $250 per sheet (placeholder).
3. **Private scenario packs** for a sector (health, finance, children's data).
4. **Audit / certification report** for a named model and date, sold to vendors.
5. **Consulting and workshops** on writing rules and approval flows.
6. **Sponsorship / GitHub Sponsors** for the open core.

## Launch checklist (owner actions)
- [ ] Approve or change prices in `pricing.json`.
- [ ] Pick a legal seller entity, terms of sale, refund policy, privacy policy.
- [ ] Create a Stripe account, two recurring Prices; put IDs in `.env` (never in git).
- [ ] Generate `LICENSE_SIGNING_SECRET` (`openssl rand -hex 32`) and store it in a secret manager.
- [ ] Run `node code/commercial/checkout.js pro` and confirm the dry-run output.
- [ ] Add a webhook endpoint (not built here) that, after verified payment, runs `license.js issue` and sends the key. Until then issue keys by hand.
- [ ] Review `GOVERNANCE.md`, then approve `LAUNCH.md` copy before posting anything.
- [ ] Decide whether paid features are source-visible (licence is honour/convenience-based under Apache-2.0; see note below).
- [ ] Run the tests and `scan-secrets.js` before each release.

Note: because the code is Apache-2.0, the license-key gate is a convenience and support entitlement, not DRM. The durable moat is the private scenarios, scoring, reports and support.

## Stripe webhook -> license issuance (code/commercial/)
- `webhook.js` exports **async** `handleStripeWebhook(rawBuffer, signatureHeader)` -> `{status, body}` and async `validateKey(key)`, wrapping the vendored shared module in `license-webhook/` (`index.mjs`, `stores.mjs`, `async.mjs`: verbatim copies, always re-copy all three together). `webhook-server.example.js` is a zero-dependency `node:http` example that is never started automatically; it must be given the RAW body.
- Storage is the shared **transactional async store** (event claim + key issue + outbox write commit as one transaction: exactly-once under concurrency, rollback on failure so Stripe's retry succeeds). It is chosen by `storeFromEnv(process.env)` and cached.
- **Fail closed:** with no store configured the webhook answers **503** (`license_store_not_configured`), `FZ-*` keys are **denied** (community tier) and `deliveries.js` throws. There is no default file path. HMAC `muh.*` keys need no store and keep working.
- Price -> tier map comes from the env vars named in `pricing.json` (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_ORG`). Tier is never taken from client metadata; unknown prices issue nothing. `checkout.js` sets `metadata[price_id]` on the Checkout Session request.
- A paid `checkout.session.completed` stores only the sha256 of an `FZ-<TIER>-...` key and queues the plaintext in the store's outbox. Replays (same event id) issue nothing; subscription deletion, payment failure and refund revoke.
- `license.verify` and `gate.gatedDecide` are **async**. `verify` accepts HMAC `muh.*` keys (checked first) and `FZ-*` keys (checked against the store, so revocable). Webhook keys have no expiry; revocation is the control.
- Delivery (owner, manual, nothing is sent by code): `node code/commercial/deliveries.js list | request <hash> | show <hash> | deliver <hash> <approver> | migrate-json <file>`. Delivery is an `outbound_message`, so `request` queues an approval and a human must run `guardrails.js approve <id> <name>` before `deliver` will drop the plaintext. `migrate-json <file>` imports an old JSON license DB into the configured store (idempotent, keys stay valid; target must be SQLite or Postgres).

### Choosing a store (this harness is a library: you run the process that hosts it)
| Env | Store | Use when |
|---|---|---|
| `LICENSE_DB=/data/licenses.sqlite` | SQLite (`node:sqlite`, Node >= 22.5, prints an ExperimentalWarning; WAL + `BEGIN IMMEDIATE`) | One long-lived server with a **persistent disk or volume** (VPS, Railway/Render volume). No extra packages. |
| `LICENSE_DATABASE_URL=postgres://...` (+ `LICENSE_DATABASE_SSL=require`, `LICENSE_DB_POOL_MAX`) | Postgres (needs the `pg` package: `npm i pg` in the host app) | **Serverless or multi-instance** hosts (Vercel, Netlify, Neon, Supabase, RDS). Ephemeral disks lose SQLite. |
| `LICENSE_DB=./x.json` | JSON file | Local/dev only; single process; cannot be a `migrate-json` target. |

**Recommendation:** Postgres for anything you deploy to serverless or more than one instance; otherwise SQLite on a persistent volume is the simplest durable choice (one server, no dependency). If unsure, choose Postgres: it works everywhere. `LICENSE_DATABASE_URL` wins when both are set.
- Limits: the plaintext key sits in the outbox until delivered, so protect the database like a secret store (nothing is encrypted at rest); SQLite is wrong on ephemeral disks; not tested against managed Postgres poolers or live Stripe, only locally signed payloads (Postgres path not exercised in this repo's tests: SQLite only); `MUH_LICENSE_KEY` and the store env must be present where the gate runs.
