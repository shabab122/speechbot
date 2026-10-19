# Verification

## Automated checks

Run from the project directory with Node.js 20 or later:

```bash
npm run verify
```

The delivered version passed **32 automated tests**, plus syntax, local asset, navigation, unique ID, and accessibility-reference checks. Static inspection also checked HTML structure, CSS grouping, form labels, and base text-color contrast in both themes.

| Area | Coverage |
| --- | --- |
| Text | Bangla/English/emoji, normalization, word counts, estimates, safe export filenames, chunk sizes and offsets |
| Speech controller | Voice settings, muted volume, long passages, pause timing, chunk transitions, stale callbacks, provider failures |
| Workspace controller | Empty startup, unsupported speech, saving/updating/restoring scripts, preferences and theme, storage denial |
| Voice/dictation state | Missing Bangla voice, later voice availability, playback controls, final transcript deduplication, cancellation |
| Import/rendering | Oversize import rejection, current-draft preservation, user text treated as plain text |
| Server | Port validation, protected GitStack ports, public file handling, HEAD responses, unsupported methods, arbitrary file-read prevention |

Controller tests use a minimal DOM adapter and controlled speech providers. Server tests call the request handler directly, without opening a port.

## Verification limits

Real browser rendering and actual speaker/microphone output were not tested in this environment. Device voices, recognition services, native dialogs, download permissions, responsive rendering, and pause/highlight behavior still need a real-device check. Automated state tests are not an audio-quality or visual-layout test.

## Quick real-device check

1. Open the hosted link in README.md. For local development, use `npm start` and open `http://127.0.0.1:5185`.
2. Try an English prompt. Preview an installed voice, then play/pause/resume/stop and replay it.
3. Try the quick speed buttons. Open More controls and change pitch, volume, speed, dictation language, and reading presets. Confirm new settings apply to the next reading.
4. Switch Reading view on/off. Check highlighting with a voice that reports word boundaries.
5. Save a titled script, edit/update it, reload the page, and check the restored draft and saved version.
6. Search and reopen a saved script. Export a text file, import it again, and test Copy.
7. Try the বাংলা sample. With a Bangla voice installed, listen to it; without one, check the missing-voice message.
8. In a browser with dictation support, allow the microphone, speak, stop, and check the appended final text. Also check denied permission.
9. Try both themes and narrow/mobile widths. Tab through navigation, the editor, buttons, settings, and dialogs.
10. Open New script with an unsaved draft. Check both Keep editing and Replace draft. Remove a saved script only after reviewing its confirmation.
11. If you use private browsing or block site storage, check the Session only message and export a copy of important text.

No external service credentials, GitStack configuration, Docker containers, Git repositories, or running project ports are modified by this project.
