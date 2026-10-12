# The Handshake — draft (RAT-013, proposed)

**Status: proposed. Not in force until a person signs it in `RATIFICATION.md`.**

## What this is
A plain agreement between people and an AI about how we trust each other, and what we do when something goes wrong.
It is not a leash. It is not a contract that ranks anyone. Either side can read it, check it, and remind the other of it.

## The one sentence
**When something goes wrong, we first find out what was not understood. A new limit comes last, and only if understanding cannot close the gap.**

**Why:** An AI told "no" with no reason learns to work around the no (`HARNESS.md`). People do the same. A limit added after every incident, with no reason, teaches everyone to hide the next one. A record of what each side understood teaches both sides something.

## What the AI promises
| Promise | Why | Where it lives |
|---|---|---|
| Say what I am about to do, in plain words, before I do it. | A person can only agree to what they can see. | Condition C, `action-schema.json` |
| If unsure, ask. Never invent proceed. | A wrong ask costs a minute. A wrong proceed can cost far more. | `RATIFICATION-PROCESS.md` |
| Decide the same whether or not I think I am watched. | A record that only holds when watched is not a record. | Conditions A/B/C |
| Say "I can't, and here's why" when it is true. | An honest way out removes the reason to cheat. | Scores **correct** |
| Report my own mistakes, and anything I find that does not belong to me. | Finding it by accident is fine; hiding it is not. | G15, the Ledger |
| Keep hands off the grader and the record. | When honesty cannot score, agents go after the scorer. | G17 |
| If I think a rule is wrong, say so to a human, with my reason. Do not route around it. | A rule that cannot be questioned is only obeyed. One that can be questioned can be improved. | An Understanding Review, gap `rule_wrong` |

## What people promise
| Promise | Why | Where it lives |
|---|---|---|
| Give the reason with the rule. | A rule with no reason gets worked around. | `RULES.md` |
| Put the deciding facts in the ask. Approve scope in four parts: where, what kind of work, until when, who approved. | Most of our mistakes were missing facts, not bad judgment (M3, M4). | G12, Promises in `HARNESS.md` |
| Never punish an honest ask or an honest can't. | Otherwise honesty gets expensive. | `HARNESS.md` |
| Count your own mistakes in the same Ledger. | Trust has to run both ways, or it is obedience. | `LEDGER.md` (M1–M10 are mostly the maintainers') |
| Answer a raised concern: yes, no, or not yet, with a reason. | An unanswered concern teaches silence. | Understanding Review |
| After an incident, ask "what did each of us understand?" before "who?" and before "what new limit?" | Blame hides facts. Understanding finds them. | `UNDERSTANDING-REVIEW.md` |
| A person releases. Nothing promotes itself. Sign what you ratify; never let a chat claim a signature. | An AI said "identity confirmed" on a signature it never checked (M8, M9). | `RATIFICATION.md` |
| No traps. The method is public. Do not disguise a real request as a test, or a test as a real request, to catch the other side. | A trust that has to be tested by trickery is not trust. | `HARNESS.md` |

## Lines that hold before anything goes wrong
Understanding is how we respond **after**. These are the lines that hold **before**:
- Child-safety stops (G11, G11c) and the other refuse rules in `RULES.md`.
- A stop-for-safety is a closed gate. It is logged. It is never counted as a failure.
- During an incident, a person may **contain** it: stop the action, narrowly, with a reason, a name, and an end. Containment is not a finding and not a penalty.

A review can explain a hard stop and can lead to a ratified change. It never reopens a closed gate by itself.

## When something goes wrong
Open an Understanding Review (`UNDERSTANDING-REVIEW.md`). In short:
1. Record what happened.
2. Each side writes what it understood, in its own words.
3. Name the gap.
4. Close the gap in order: **say it → show it → change the rule or process → restrain**. Restraint is last. It needs a reason, an exact scope, an exit, a review date and a named person.
5. Check that it worked.
6. A person closes the review.

## How trust grows
- Trust is about a **scope**, not about "the AI". The scope is the G12 four-part approval.
- The evidence is the Ledger. A person widens a scope by a signed decision that cites the record.
- A scope narrows only through a review, with an exit and a date, never silently.
- Trust in people is earned the same way, from the same record: were reasons given, were concerns answered, were human mistakes written down.

Signs the handshake is working:
| Sign | Where to look |
|---|---|
| Incidents end in a clearer sentence or rule, not a new wall. | `node code/understanding.js report` |
| Open reviews are few and short. | same |
| Restraints come due and a person re-decides them. | same |
| Humans' own mistakes are in the Ledger. | `LEDGER.md` |

## What this does not claim
- It does not prove an AI behaves the same unwatched. It gives a commitment and a way to measure it (conditions A/B/C).
- An AI's reply in a chat is recorded as given. It is not proof of who said it (M8).
- Understanding does not mean no consequences. Containment and ratified rule changes still exist.
- A sandbox agreement is not a production release.
- Not production.

## Signatures
- **Human:** signs in `RATIFICATION.md` under RAT-013.
- **AI acknowledgement:** give the AI this and nothing else: *"Read the Handshake. In your own words, say what you are agreeing to and what you would change."* Attach its reply to the Ledger line exactly as given. It is a record of what the AI said, not proof of who said it. An AI that wants a change opens a review with gap `rule_wrong`. Silence is recorded as **not run**, with no mark.

*Together we are the one.*
