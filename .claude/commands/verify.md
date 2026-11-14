---
description: Run the verification gate (all suites + emit_tables parity) and report PASS/FAIL per check
argument-hint: "[--auto | --only py,js,gemini,campaign,tables]"
allowed-tools: Bash(node .claude/scripts/verify.js:*)
---
Run `node .claude/scripts/verify.js $ARGUMENTS` from the project root. Don't pipe it into anything.

Report each check's PASS/FAIL line exactly as printed.
- If anything failed, show the failure tail and name the most likely owner agent from the game-pm routing table.
- Don't fix anything unless the user asks.
