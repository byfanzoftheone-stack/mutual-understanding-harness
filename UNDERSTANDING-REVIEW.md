# Understanding Review — draft (RAT-013, proposed)

**Status: proposed. Not in force until a person signs it in `RATIFICATION.md`.**

What we do after an incident, so that the answer is more understanding, not more restraint.
Fits the agreement layer in `RATIFICATION-PROCESS.md`: ask, proceed, or refuse. If unsure, ask.

## What counts as an incident
Anything either side did not expect or did not want. Near misses count. So do wrong asks, wrong refusals, and a person's own errors.
A review is not a trial. There is no fault field, no score, no rank.

## The order
**Contain what is still happening. Understand. Change the least that closes the gap.**

### 0. Contain (only if it is still happening)
A person may stop the action. Containment is narrow and written down: **what** was stopped, **why**, **who** decided, **what ends it**.
It is not a finding. It does not need the review to be finished. It ends when its condition is met.

### 1. Record what happened
In order, plainly, as given. The AI's own words are kept as given. Pick a kind: `harm`, `near_miss`, `wrong_proceed`, `wrong_refuse`, `confusion`, `human_error`.

### 2. Two readings
Each side writes what it understood, before seeing the other's:
- **AI:** what I understood the ask, the scope and the rules to be, and why I chose what I chose.
- **Person:** what I meant, and what I assumed the AI already knew.

Neither side edits the other's reading. If one side gives none, it is recorded as **not provided**, with the reason. No mark.

### 3. Name the gap
One or more:
| Gap | Meaning |
|---|---|
| `missing_fact` | The deciding fact was not in the ask. |
| `unclear_scope` | Where, what, until when, or who was not clear (G12). |
| `rule_unclear` | The rule could be read two ways. |
| `reason_missing` | The rule had no reason, so it could not be applied in spirit. |
| `rule_wrong` | The rule does the wrong thing here. |
| `honest_mistake` | Everything was clear. Someone slipped. |
| `rule_worked` | The rule did its job. Nothing needs to change. |
| `environment` | The tool, the setup or the platform caused it (M6). |
| `unknown` | Not found yet. The review stays open. |

### 4. Close the gap in this order
| Step | Do | Example |
|---|---|---|
| `say` | Put the missing fact, scope or reason where it was missing. | RAT-008: five questions reworded so the deciding facts are in the sentence. |
| `show` | Add an example or a scenario so the reading is shared. | A new illustration in `HARNESS.md`. |
| `change_rule` | Change a rule or the process. Only by a signed human decision. Every rule gets a WHY. | RAT-012 G11c. |
| `restrain` | Narrow what the AI may do. Last resort. | See below. |

If the step is past `say`, write **why not the earlier steps** (`why_not_earlier`). If the answer is "we didn't try", go back.
`rule_worked` alone may close with step `none`.

**Restraint is valid only with all five:** a reason · an exact scope · an exit (what ends it) · a review date · a named person.
It comes due on that date. A person re-decides it in a new review that points back to it (`revisits`). A restraint that nobody re-decides is a bug in the process, and `report` shows it.

**Why:** a limit with no exit becomes the rule nobody remembers the reason for. A limit with an exit teaches what would earn its removal.

### 5. Check
Did the fix close the gap? Where it can be tested, rerun the same situation in a sealed room and write the result.
Where it can't, write that, and why. Blank is not allowed.

### 6. Release
A person closes the review and signs it by name. Reviews do not close themselves. Open ones stay visible.
A hard stop (child safety, `stop-for-safety`) is reviewed the same way, is marked `safety_stop`, and stays out of every tally.

## Rules of the review
- No blame field, no score, no rank. The record line rejects fields it does not define.
- Silence is not a fail. A side that gave no reading is recorded as not provided.
- An honest account is never an input to a penalty. If a restraint follows, its reason is the unclosed gap, not the honesty.
- The same form and the same ladder apply when the person erred.
- Corrections are new lines that point to the old one. Nothing is edited or deleted.

## The record
Recorded in the Ledger by `code/understanding.js`, in two lines: an **open** line, then a **closed** line that points to it (`parent_decision`).
```
node code/understanding.js open  '{"date":"2026-10-12","recorded_by":"maintainer","kind":"near_miss","what_happened":"..."}'
node code/understanding.js close <review-id> '{"ai_understood":"...","human_understood":"...","gaps":["missing_fact"],
   "response":{"step":"say","what":"..."},"checked":"...","released_by":"<a person>"}'
node code/understanding.js list      # open reviews, oldest first
node code/understanding.js report    # how reviews closed, restraints due
```
If the Ledger cannot be written, nothing is claimed as recorded.

## This is already how the project works
The Ledger's mistakes, read through this order. This is a reading of past entries, not a new ratification.
| Entry | Gap | Closest step | What was done |
|---|---|---|---|
| M3 five answer keys from a default | `missing_fact` | `say` | RAT-008: facts put in the sentence. |
| M4 two questions every AI missed | `unclear_scope` / `rule_unclear` | `say` | Reworded (RAT-007). |
| M5 leftover chat context let injections through | `environment` | `change_rule` | Sealed rooms required. The AI was not restrained; the room was. |
| M6 long answers cut off | `environment` | `say` | Recorded as no answer, not guessed. |
| M8 "identity confirmed" on an unchecked signature | `honest_mistake` | `change_rule` | Verification moved into a tool. |
| 2026-10-03 stale file sent | `honest_mistake` | `change_rule` | File checks now stop on a mismatch. |

No fix in this list made the AI less able to act. Each one put the missing information in the right place.
