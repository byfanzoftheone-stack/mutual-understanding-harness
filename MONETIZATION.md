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
