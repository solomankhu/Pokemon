---
name: bash-heredoc-mangling
description: Bash-tool heredocs with long JS/Python bodies intermittently fail ("unexpected EOF looking for matching '") or corrupt escapes; write patch scripts with the Write tool instead
metadata:
  type: feedback
---
Long heredocs (`python - <<'X' ... X`) carrying minified JS failed several times in the Bash tool on this machine:
"unexpected EOF while looking for matching `''", and once `\n` inside a Python string became a real newline in the JS
output. Short sed/one-line `python -c` edits were fine.

**Why:** cost several retries during the webcam v2 work (2026-10-18); a half-applied patch script aborts before
writing, which is safe, but a mangled escape writes broken JS.

**How to apply:** for any multi-line patch, Write the script (and any JS snippet it inserts) to the scratchpad and run
`python <file>`; have the script `assert s.count(old)==1` before each replace. Also never append a `// comment`
via replace onto a minified line: it comments out the rest of that line.
