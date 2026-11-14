# Webcam gesture clips (personal, local only)

This folder holds **your own** webcam recordings, made with **SETTINGS -> Test gestures -> RECORD** in a battle with
the webcam ON. Each `webcam-clip-<label>-<n>.json` file is about 3 seconds of 80x60 greyscale frames of you, plus the
webcam settings in use (mirror, gain, punch zone, punch threshold).

**Privacy:** these are low-resolution images of a person. They are local test fixtures only. Never publish, copy,
upload, share or attach them anywhere (including issues, chats and pull requests), and never add them to an archive
or backup that leaves this machine.

## Recording

1. Start a battle with the webcam ON, open SETTINGS -> Test gestures.
2. Pick a label, press RECORD, and do the gesture once after the 3-2-1 count. The browser downloads the clip.
3. Move the downloaded file from your Downloads folder into this folder. Keep the filename.

Labels: `punch`, `guard`, `throw`, `shove`, `raise`, `lean`, `sweep`, `cancel`, `idle`, `talk`.
Plan (docs/plans/2026-10-23-webcam-gesture-set.md): about 5 clips per gesture, plus 3 `idle`/`talk` clips of you just
sitting or talking.

Load a clip in Node with `MonsterWebcam.decodeClip(fs.readFileSync(path, 'utf8'))` from `combat/webcam.js`. It
returns `null` for anything malformed. Tests that use this folder must pass when it is empty or missing.
