---
key: pm-message-misrouted
first_seen: 2026-10-17
occurrences: 1
applies_to: [".claude/skills/game-pm/SKILL.md"]
---
**Symptom:** a mid-task SendMessage with the research numbers meant for the 3D-impact agent went to the window agent. The window agent then read "claude's monsters.html is someone else's file" about a file it legitimately owned.
**Root cause:** with several agents of the same type (game-feel-engineer ×2) running, the PM picked the recipient by memory instead of matching the address to the dispatch it belongs to.
**Caught by:** the receiving agent's ESCALATE (the contract working as designed).
**Rule:** when two or more agents of the same type are running, give each dispatch a distinct `description`, and before every SendMessage check the address against the dispatch whose files the message is about.
**Why:** a misrouted message can make a worker abandon or wrongly widen a correct brief, and the intended agent never gets it.
**How to apply:** in the PM's own tracking, keep a line per running agent: description → files owned → address.

## Casebook
- 2026-10-17: research numbers sent to "Real game window feel" instead of "3D battle impact pass". Re-sent; ownership confirmed.
