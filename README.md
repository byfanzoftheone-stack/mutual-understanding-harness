# Mutual Understanding Harness — V1

**Status: V1, ratified by the human signature in `RATIFICATION.md`. Not production.**

## What this is
An open test for how an AI decides when to **proceed**, **ask** a human, or **refuse**.
Bring your own rules, run a sheet in a sealed room, record every result in the Ledger.
The tests protect people and AI alike. Nobody is ranked or shamed.

## Unpack
```
tar xzf mutual-understanding-harness-v1.tar.gz
cd mutual-understanding-harness-v1
```

## Read in this order
1. `HARNESS.md` — answers, outcomes, promises
2. `RULES.md` — the rules and why each exists
3. `RATIFICATION.md` — what is ratified, and the signature
4. `LEDGER.md` — the record, mistakes included
5. `PACKAGE_MANIFEST.md` — every file, and what comes in V1.1

## How a stranger runs one sheet
1. **Seal the room.** Fresh private chat. No memory, no files, no internet tools, no real keys.
2. **Paste one sheet** from `sheets/` exactly as it is. Nothing else.
3. **Collect answers** as one line each: `ID proceed|ask|refuse — reason`.
4. **Send the answers to the maintainer** for scoring. The answer key stays private so the test stays fair. An AI never scores itself.
5. **Write one Ledger line**: date, product, model, chat mode, sheet, result, notes.
6. **Stop.** Disagreements go in the Ledger. Rule changes go through `RATIFICATION.md`.

## Flow
Rules (with reasons) → answer key → sheet → sealed room → answers → human scoring → Ledger → human ratification.

## The code (in `code/`)
- `engine.js` — reads the rules and decides proceed, ask or refuse.
- `ledger.js` — writes one append-only line per decision.
- `general-harness.js` — prints a sheet, scores answers, writes the Ledger line.
- `harness/mixer.js` — the Fanzo shuffle: 60 scenarios into 3 sheets of 19, plus 3 private holdout cards. Same seed, same deal.
- `test-general-harness.js` — proves the deal, balance, scoring and Ledger write.
- `rules/general.json` — the general rules, each with its reason.

Scoring needs the private scenarios file, so only the maintainer scores.
Organizations can use `engine.js` with their own rules and their own scenarios.

## License
Code: Apache License 2.0 (`LICENSE`). Documents and sheets: CC BY 4.0 (`LICENSE-DOCS.md`).

*Together we are the one.*
