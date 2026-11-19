# governed-library

A Claude Code mod that gives a project a Library of designs, skills, loops and tools, each governed by the Mutual Understanding Harness (RAT-014, proposed).

It needs the harness's `code/library.js` in the project. The logic and its tests live there; this mod is the model's tools, the person's commands, a pane and a guard.

## What it adds
- **Tools for the model:** `library_forge` (add a proposed entry, then write its sections), `library_gate` (proceed, ask or refuse before using an entry) and `library_list`. There is deliberately no tool to ratify, revisit or retire.
- **`/library` for a person:** list, gate, ratify, revisit, retire, pane. Ratify, revisit and retire only run when a person types them.
- **A guard:** the registry and the Ledger cannot be edited by hand through Write, Edit or a shell redirect (best effort; a hook is not a security boundary).
- **A status line and a pane:** how many entries are ratified, proposed, and due for a person.
- **A short system-prompt section** telling the model how the Library works.

## Governance
Every entry carries a WHY, a scope (where, what kind of work, until when, who approved), a review date and the action it declares. The policy engine decides what that action may do. A loop needs a cadence and an exit. Only a person ratifies.

Set `LEDGER_PATH` to where the Ledger should be written; without it the harness's default is used.
