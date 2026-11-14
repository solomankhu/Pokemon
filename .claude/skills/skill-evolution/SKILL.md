---
name: skill-evolution
description: Promotes a proven pattern into the owning skill so every future run gets it - triggered when a docs/SOLUTIONS.md row reaches 2 reuses, or when a FAILURE_PLAYBOOK lesson is specific to one skill. Writes a <=12-line entry in .claude/skills/<skill>/learned/ and indexes it; the user approves before it is active.
---

# Skill evolution

Skills improve by accretion of small, evidenced entries, not by rewriting their body.

## When
- A `docs/SOLUTIONS.md` row reached **2 reuses**.
- A lesson in `docs/FAILURE_PLAYBOOK.md` concerns **one skill's procedure** (for example
  "add-monster: forgot the kind branch in JS").
  If a lesson spans several skills, it becomes a CLAUDE.md rule through
  reflect-and-learn instead.

## Entry: `.claude/skills/<skill>/learned/<slug>.md` (≤ 12 lines)
```markdown
---
kind: pattern | rule | trap
applies_to: ["claude's monsters.py"]      # globs
evidence: SOLUTIONS #N (reuses 2) | lesson <key> (occurrences N)
status: proposed | active
---
One-paragraph statement: what to do, when, and the check that proves it was done.
```

## Index: `.claude/skills/<skill>/learned/INDEX.md`
Add one line per entry: `- [slug](slug.md) - kind - one-line hook (status)`.
If the skill's `SKILL.md` has no pointer yet, add this line under its title:
`> Learned entries: read [learned/INDEX.md](learned/INDEX.md) first; active entries override this file.`

## Approval
Write the entry with `status: proposed` and show it to the user. Set it to `active` only
when they approve. Workers must ignore `proposed` entries.

## Precedence
A gate (test or verify.js) beats a CLAUDE.md rule, which beats a learned entry, which
beats the skill body. If an entry conflicts with a gate, delete the entry.

## Pruning
If an entry was contradicted by later evidence, or the code it describes is gone, delete
it and its index line. Say so in the reply.
