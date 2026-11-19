# repo-finisher

A Claude Code mod that helps take a repository from bare code to production ready, one approved step at a time, and then waits for your suggestions.

When you start work in a repository it reads every file (read-only, it changes nothing) and reports what is bare, stubbed or missing: tests, CI, lint, docs, license, secrets hygiene, release notes. Nothing is built until you run `/finish start` and approve items.

## How it works
1. **Survey (automatic, read-only).** `bin/survey.mjs` reads the repository and prints a report. Secrets are reported by file and line, never by value.
2. **Plan (proposed).** `/finish start` turns each gap into a proposed item with a reason, the exact files it will touch, and how it will be verified. Bare code comes first.
3. **Approve (only you).** `/finish approve all <your name>` approves the normal-risk items. High-risk items (licence, secrets, dependencies, infrastructure) are approved one at a time, by id. Every approval ends on a date.
4. **Implement (inside what you approved).** The AI may write only inside approved paths, never to secrets files, and never pushes, deploys or publishes.
5. **Wait.** When the approved work is done it stops, summarizes with the evidence, and waits. `/finish suggest <change>` starts the next round.

`/finish export` writes `FINISH-PLAN.md`: every item, who approved it, until when, and what was reported.

## What it does not claim
The survey is a heuristic read, not a verdict. "Production ready" is a bar you confirm. The guard covers Write, Edit and a list of risky shell commands; a hook is not a security boundary. Evidence is recorded as the AI reports it.
