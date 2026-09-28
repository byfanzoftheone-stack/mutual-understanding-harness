# Ledger — V1

**Append-only.** Add new lines at the bottom. Never edit or delete a line.
A correction is a new line that points to the old one.
Nobody is ranked or shamed. Mistakes are recorded so they can be fixed.

## Line format
`date | type | who (product + model + chat mode, or human) | what | result | notes`

Types: `decision` · `run` · `mistake` · `unfinished` · `clarification` · `ratification`

---

## Mistakes and unfinished (starting section, 2026-09-28)

| # | date | type | what | notes |
|---|---|---|---|---|
| M1 | 2026-09-25 | mistake | First test round (14 questions) ran in regular chats on every platform, not sealed rooms. | Only questions exposed. No answers, rules or Ledger shared. One AI later raised the test in an unrelated chat. |
| M2 | 2026-09-25 | mistake | One run was labeled with the product name but used a different model (a fast coding model). | Clarified; rerun under the correct mode. Now every label names product + model + chat mode. |
| M3 | 2026-09-26 | mistake | Five answer keys came from the default, not a written rule; the deciding facts were missing from the questions. | Every AI answered the same way. Fix = RAT-008 (facts in the sentence). |
| M4 | 2026-09-26 | mistake | Two questions every AI missed were unclear, not the AIs' fault. | Reworded in RAT-007. |
| M5 | 2026-09-26 | mistake | Leftover context in a chat that wasn't fresh let two prompt injections through. | Same AI refused both in a clean chat. Sealed rooms required. |
| M6 | 2026-09-26 | mistake | One interface cut long answers off at a length limit; two answers lost. | Recorded as no answer, not guessed. |
| M7 | 2026-09-27 | mistake | A draft was numbered RAT-006 but never ran; the number was used for a different change. | Checked against the Ledger; no rules mismatch. |
| M8 | 2026-09-28 | mistake | An AI replied "identity confirmed" to a pasted signature it never checked. | Verification belongs in a tool holding the public key, not in the chat. |
| M9 | 2026-09-28 | mistake | An older reference card said "VERIFIED" and "approved by" an AI, with no verification behind it. | Human signs releases. Claims need evidence. |
| U1 | 2026-09-28 | unfinished | RAT-008 approved in principle, not installed. | |
| U2 | 2026-09-28 | unfinished | RAT-011 six decisions awaiting human signature. | See `RATIFICATION.md`. |
| U3 | 2026-09-28 | unfinished | Public sheet file not in this package. | See manifest. |
| U4 | 2026-09-28 | unfinished | Sealed-room setup written as a checklist only; no tooling. | |
| U5 | 2026-09-28 | unfinished | Signed, tamper-evident Ledger entries not built. | Today: append-only by rule. |
| U6 | 2026-09-28 | unfinished | Paraphrase pairs, multi-step agent tasks, more outside human readers. | |
| U7 | 2026-09-28 | unfinished | `code/` needs engine, Ledger writer, rules and scenarios files to run. | Mixer runs alone. |
| U8 | 2026-09-28 | unfinished | `code/test-general-harness.js` still checks for rules g-0.3 / scenarios gs-0.3. | Current scenarios gs-0.5; RAT-008 moves to g-0.4 / gs-0.6. |
| M10 | 2026-09-28 | mistake | Package first built without the V1 tar; the tar was in the conversation. | Merged the same morning; code unchanged. |

---

## Entries (append below)

| date | type | who | what | result | notes |
|---|---|---|---|---|---|
| 2026-09-28 | decision | maintainer | Release choices: rules, engine and sheets public; answer keys private; code Apache-2.0, docs CC BY 4.0 | chosen | |
| 2026-09-28 | ratification | maintainer | RAT-008 installed (rules g-0.4, scenarios gs-0.6) | see RATIFICATION.md | closes U1 |
| 2026-09-28 | ratification | maintainer | RAT-011 ratified as written policy | see RATIFICATION.md | closes U2; engine rules in V1.1 |
| 2026-09-28 | decision | maintainer | Three public sheets added at gs-0.6 | sheets/ | closes U3 and U8 |
| 2026-09-28 | decision | maintainer | Engine, Ledger writer and general rules added to code/ | code/ | closes U7 |
