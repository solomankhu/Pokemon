---
name: headless-fullscreen-screen-size
description: Playwright headless Chromium reports screen == viewport, so MONSTER TRAIL's isFullscreen() screen-fill check reads "fullscreen" unless the context sets a bigger screen
metadata:
  type: reference
---

`claude's monsters.html` `isFullscreen()` treats a window that fills `screen` as browser fullscreen (F11 / launcher `--start-fullscreen`), because the Fullscreen API can't see that mode. Headless Chromium sets `screen` equal to the viewport, so every headless page looks fullscreen and the F toggle shows the "Press F11" toast instead of calling `requestFullscreen`.

**Why:** cost one confusing playtest run (2026-10-17) where F appeared to do nothing.
**How to apply:** in private Playwright scripts, use `newPage({ viewport: {1280x720}, screen: { width: 1920, height: 1080 } })` before testing the fullscreen toggle or idle-cursor hide. A private Playwright install lives in the npx cache (see `findPlaywright` in `combat/browser-playtest.cjs`), and Chromium is under `%LOCALAPPDATA%\ms-playwright\chromium-*`. Use that when the brief forbids the shared MCP browser.
