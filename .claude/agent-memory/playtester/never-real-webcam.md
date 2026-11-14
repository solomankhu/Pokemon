---
name: never-real-webcam
description: Never grant camera or call getUserMedia in the MCP browser context — it opens the user's real webcam; use a separately launched fake-device Chromium for MT-16
metadata:
  type: feedback
---
Granting `camera` to the default MCP browser context and calling `getUserMedia` there opened the user's real webcam (UGREEN Camera) for under a second on 2026-10-18.

**Why:** a privacy incident. The user's camera must never be used by automation.

**How to apply:** for any webcam duty (MT-16), launch a separate Chromium through `browser_run_code_unsafe` with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` (add `--deny-permission-prompts` for the denied path), using the chromium-1228 build under `%LOCALAPPDATA%\ms-playwright\`. Keep the handles on `page`, not `globalThis`, and close every instance. The full rules are in `docs/playtests/monster-trail.md`.
