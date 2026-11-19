# Governance

Principle: software may prepare; a human decides anything that spends money, publishes, or contacts people. This builds on the harness's own rules (`RULES.md`, R12 "nothing off the record").

## Controls and where they live
| Control | Mechanism | Code |
|---|---|---|
| Human approval before spend, publish, outbound messages, live checkout | Gated kinds `spend`, `publish`, `outbound_message`, `live_checkout`. Action is blocked until a named human runs `node code/commercial/guardrails.js approve <id> <name>`. Approvals are single-use and bound to the exact payload. | `code/commercial/guardrails.js` |
| Audit logging | Every request, approval, block, execution, rate-limit and checkout request is appended to the ledger (`LEDGER_PATH`). Append-only by convention; signed lines are planned in V1.1. | `guardrails.audit`, `code/ledger.js` |
| No secrets in code | Secrets only via env vars. `.env` is git-ignored; `.env.example` has placeholders. `scan-secrets.js` fails on live-looking keys. | `.gitignore`, `scan-secrets.js` |
| Rate limits | Per-client fixed window, limit by license tier. | `guardrails.rateLimit`, `gate.js` |
| Dry-run by default | Checkout sends nothing unless `STRIPE_SECRET_KEY`, `ALLOW_LIVE_CHECKOUT=true` and a human approval all exist. | `checkout.js` |

## Roles
- **Owner**: sets prices, approves gated actions, holds secrets.
- **Agents/automation**: may draft, test and request approval; may not approve their own requests.

## Known limits (be honest)
- Approval is enforced in the code paths provided. An agent with shell access to the same machine could run the approve command; run agents without that access, or approve from a separate account.
- Rate limiter is in-process memory; use a shared store for multi-instance deployments.
- The ledger is a local file; protect and back it up. It is not tamper-evident yet.
- No webhook signature verification or license revocation exists yet.

## Change control
Rule changes go through `RATIFICATION.md`. Pricing and public copy changes need owner sign-off recorded in a commit message or ledger entry.
