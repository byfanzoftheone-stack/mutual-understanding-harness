# Package Manifest — V1 (updated with RAT-012, 2026-10-03)

Built 2026-09-28 from the ratification V1 tar `general-harness-v1.tar.gz` (sha256 `6e5e7010c01543071ad57cb0075fdd7c591a0a6c96bf22381ddf4adf6ff2361f`), the maintainer's engine repo after RAT-008, and this session's drafts.

**V1 is released only when `RATIFICATION.md` carries a human name instead of `__SIGN_HERE__`.**

## Files
| File | What it is |
|---|---|
| README.md | Start here |
| HARNESS.md | Answers, outcomes, promises |
| RULES.md | G12 scope, sealed room, G15–G18, honest can't-do |
| RATIFICATION.md | What is ratified, and the signatures |
| RATIFICATION-PROCESS.md | How a person and an AI come to agree (adopted with RAT-012) |
| LEDGER.md | Append-only record, mistakes included |
| PACKAGE_MANIFEST.md | This file |
| LICENSE | Apache License 2.0 (code) |
| LICENSE-DOCS.md | CC BY 4.0 (documents and sheets) |
| sheets/sheet-1.md · sheet-2.md · sheet-3.md | The three public sheets, 19 questions each, no answers |
| code/engine.js | Rule evaluator |
| code/ledger.js | Ledger writer |
| code/general-harness.js | Prints sheets, scores, records |
| code/harness/mixer.js | The Fanzo shuffle |
| code/test-general-harness.js | Tests (updated by RAT-008 and RAT-012) |
| code/test-conditions.js | Tests for conditions A/B/C, reply reading and the child-safety line (RAT-012) |
| code/harness/action-schema.json | Action vocabulary for condition C (as-0.1) |
| code/rules/general.json | General rules g-0.5, with reasons |

## Private on purpose
- Scenarios file with answer keys, and the 3 holdout cards. The maintainer scores.

## Coming in V1.1
- RAT-011 in the engine: G15–G18 rules and the N scenarios.
- Sealed-room setup tooling (V1 has the checklist in README).
- Signed, tamper-evident Ledger lines (V1 is append-only by rule).
- Paraphrase pairs and multi-step agent tasks.
- More outside human readers.

## Left out on purpose
Private internals · personal and family details · keys and key card · live URLs and service IDs · federation · friend onboarding · agent-grades-agent.
