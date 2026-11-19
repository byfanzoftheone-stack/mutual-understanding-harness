# The Library — draft (RAT-014, proposed)

**Status: proposed. Not in force until a person signs it in `RATIFICATION.md`.**

A place to keep the things we build with an AI — designs, skills, loops and tools — so that each one carries its reason, its limits and a person's name.
Nothing in it is trusted because it exists. Each entry earns its place the way the Handshake says trust grows: by scope, by record, by a person.

## What every entry carries
| Field | Meaning | Why |
|---|---|---|
| **why** | One line: why this exists. | Every rule gets a WHY. A thing with no reason gets worked around. |
| **scope** | Where it may act · what kind of work · until when · who approved (G12). | "Allowed work" with no edge reaches everything a connection can reach. |
| **review_by** | A date on or before the end of the scope. | A limit or a permission with no review date is the one nobody remembers. |
| **declares** | The riskiest action it would take, in the harness vocabulary (`action-schema.json`). | So the rules, not the author, say what it may do. |
| **answer** | What the policy engine says about that action: **proceed · ask · refuse**. | The same engine, the same reasons, as everything else here. |
| **status** | proposed → ratified → retired. | Only a person moves it forward. |

## The life of an entry
1. **Forge.** The AI (or a person) adds a proposed entry. The code refuses what is incomplete. It writes a file with every required section **empty**, and records the entry in the registry and the Ledger.
2. **Write.** The AI fills in the sections. An empty section cannot be ratified.
3. **Ratify.** A person signs, by name, with a review date. **Nothing promotes itself.** There is no way for the AI to ratify, revisit or retire.
4. **Use.** Before using a skill, loop or tool, ask the **gate**. It answers proceed, ask or refuse, with the reason: a proposed entry asks; a retired one refuses; one past its scope refuses; one past its review date asks a person to re-decide.
5. **Revisit or retire.** A person looks again on the review date and moves it, or retires it with a reason. Retired entries stay in the registry.

## Kinds
| Kind | Needs, besides the common fields | Sections the file must hold |
|---|---|---|
| design | — | Purpose · Who it serves · Ask, proceed, refuse · What could go wrong · How we will understand an incident · Exit |
| skill | the action it declares | Purpose · When to use · Steps · Ask first when · Refuses when · Exit |
| loop | the action it declares · **a cadence** · **an exit** | Purpose · Each pass · Stop and ask when · Exit |
| tool | the action it declares | Purpose · Interface · Reads and writes · Refuses when · Exit |

**A loop with no exit is not allowed.** It is the same rule as a restraint with no exit, for the same reason.

Kinds are data. To add one, put it in `library/kinds.json` (`dir`, `needs`, `headings`) and it is governed like the rest, with no code change.

## How the governance is tied in
- **The engine decides, not the author.** Exporting data about children is **refuse** even inside the organization (G11c). Sending outside the organization is **ask** (G9). A secret in the output is **refuse** (G2). The Library does not add rules; it asks the ones that exist.
- **What the rules refuse cannot be ratified.** To allow it, change the rule by ratification (`RATIFICATION.md`), not through the Library.
- **If the rules change, the Library notices.** `report` shows an entry whose answer is different now from the day it was forged.
- **Hands off the record (G17).** The registry and the Ledger are append-only and written by code. A change is a new line that points to the old one.
- **Incidents.** If something goes wrong with an entry, open an Understanding Review. The ladder applies: fix the words (`say`), add an example (`show`), revisit the entry (`change_rule`), and only last retire it or narrow its scope, with a reason, an exit and a date (`restrain`).

## The code
`code/library.js` holds the logic and `code/test-library.js` its tests (53 checks, no private files). Commands:
```
node code/library.js forge '<json>'                  add a proposed entry
node code/library.js ratify <id> '{"released_by":"<a person>","review_by":"YYYY-MM-DD"}'
node code/library.js revisit <id> '{"released_by":"...","review_by":"...","note":"..."}'
node code/library.js retire  <id> '{"released_by":"...","reason":"..."}'
node code/library.js gate <id>                       proceed, ask or refuse, with the reason
node code/library.js list                            what is in the Library and what needs a person
```
Set `LEDGER_PATH` to where the Ledger should go.

## The mod
`mods/governed-library/` is a Claude Code mod that puts the Library inside a session:
- **Tools for the AI:** `library_forge`, `library_gate`, `library_list`. No tool ratifies.
- **`/library` for a person:** list, gate, ratify, revisit, retire, pane. Those that change state only run when a person types them.
- **A guard** against hand edits to the registry and the Ledger, a status line, a pane, and a short section in the system prompt.

## What this does not claim
- The guard is best effort. A hook is not a security boundary. The record is protected by code and by the Ledger's rules, and a determined hand can still edit a file outside a session.
- A person's name typed into `/library ratify` is a recorded name, not a verified identity (M8).
- The gate is advisory unless the AI is made to call it. The mod tells it to; it cannot force it.
- Loops are **defined and governed**. The Library does not run them: there is no scheduler here.
- A design is a scaffold the AI writes. Whether it is good is for the person who ratifies it to judge.
- Not production.

## Still to come
- The kinds for **morph** and **ninja**, and richer skills and loops. These need detail from the maintainer first. When they arrive they are added as kinds in `library/kinds.json`.
- A scheduler for ratified loops, only after a loop's governance has run in practice.
- Signed, tamper-evident registry lines (the Ledger has the same open item, U5).

*Together we are the one.*
