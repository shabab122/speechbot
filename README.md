<img src="assets/favicon.svg" width="56" height="56" alt="SpeechBot logo" />

# SpeechBot Studio

**Give your words a voice.**

A focused text-to-speech workspace for listening to study notes, trying a story aloud, and drafting with your microphone. Built with HTML, CSS, and JavaScript, with no framework, paid API key, or third-party runtime dependency.

## Getting started

Install **Node.js 20 or later**, extract the project, then run:

```bash
cd SpeechBot-Studio
npm start
```

Open **http://127.0.0.1:5185** in your browser. No `npm install` is needed. Press **Ctrl+C** in the terminal to stop the server.

On Ubuntu, you can also run:

```bash
bash start.sh
```

The included server binds to your own computer. It uses **5185**, explicitly rejects **3000** and **3002**, and never stops another application. If 5185 is already occupied, choose another port:

```bash
PORT=5186 npm start
```

Use the same address each time to return to the same browser storage. Opening `index.html` directly also loads the interface; localhost or HTTPS is the recommended way to use microphone permissions and consistent storage.

## What you can do

| Area | Features |
| --- | --- |
| Writing | Editable title, a 12,000-character editor, word/character counts, estimated reading time, and automatic draft recovery |
| Listening | Play, pause, resume, stop, and read again from the beginning |
| Voices | Installed device voices, language/accent filtering, voice preview, and a clear message for unavailable languages |
| Adjustments | Speed from 0.5× to 2×, pitch from 0.5 to 1.5, volume, and Natural / Story / Study presets |
| Reading view | A focused text pane with word highlighting when the selected voice provides word events |
| Dictation | A microphone input with a separate dictation language, interim text, and permission/error handling |
| Saved scripts | Up to 20 scripts, each with its own voice settings; search, open, update, export, and remove |
| Text files | Import UTF-8 `.txt` and `.md` files; copy or export a script as `.txt` |
| Appearance | Responsive layouts, persistent light/dark themes, and a decorative playback activity animation |
| Accessibility | Explicit labels, keyboard navigation, visible focus states, status messages, and reduced-motion support |

Three starting prompts are included: **A mindful moment**, **Once upon a thought**, and **বাংলায় কিছু কথা**. They populate the editor without starting audio automatically. Replacing an unsaved draft asks before discarding it.

The waveform is an animated activity indicator, rather than a measurement of generated audio. Time and progress are approximate.

## A typical session

1. Write or import a passage and give it a title.
2. Choose a language and an installed voice. Use **Preview voice** to try the sound.
3. Adjust the reading style, speed, pitch, or volume.
4. Press **Play script**. Pause, resume, stop, or switch to **Reading view** as needed.
5. Select **Save script** to keep the text and settings, or **Export .txt** to keep a separate file.

Changing a voice or adjustment during playback stops the reading. Press Play to hear the new settings from the beginning. The editor is read-only during playback and dictation so the displayed words stay consistent with the active session.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+Enter / ⌘+Enter | Play or pause the current script |
| Ctrl+S / ⌘+S | Save or update the current script |
| Escape | Stop reading or cancel dictation |

Shortcuts apply in the studio. Open dialogs keep their normal keyboard behavior.

## Browser support and Bangla

SpeechBot uses the browser's **Web Speech API**. It detects speech synthesis and speech recognition separately. When speech is unavailable, the editor, saved scripts, and text import/export remain usable.

- **Voices come from your browser and operating system.** Their number, quality, accent, pronunciation, and availability vary.
- **Bangla text is supported in the editor, import/export, and saved scripts.** Bangla playback requires a matching `bn-BD` or `bn-IN` voice on the device. Choose an installed accent; unavailable languages are labelled clearly.
- **Dictation is browser-dependent.** A microphone, permission, and a supported recognition service are required. Some browsers do not expose speech recognition.
- **Word highlighting and pause/resume behavior depend on the voice provider.** A voice may play correctly without reporting individual word boundaries.
- **Audio export is unavailable.** Browser speech synthesis does not expose an audio file. Export .txt downloads your script text.
- **Some voices and dictation use online services.** The interface has no remote assets, but speech features may need a network connection.

API references: [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), and [word boundary events](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event).

## Storage and privacy

Drafts, scripts, voice preferences, and the selected theme are stored under `speechbot-studio:v2` in this browser's `localStorage`.

- Your saved shelf belongs to this browser and address; it does not synchronize across devices or browser profiles.
- Clearing site data removes the stored workspace. Private browsing may clear it when the session ends.
- If storage is blocked or full, SpeechBot shows **Session only** and continues to work in memory. Export important text to keep it.
- SpeechBot has no backend, analytics, account, or cloud database. The local server only serves the interface files.
- Dictation audio may be processed by your browser's speech service. Online speech voices may also use a provider's service.

Imports are limited to **512 KB** and **12,000 characters**. Oversize files are rejected without replacing the current draft. Imported Markdown is treated as plain text. User text is never rendered as HTML.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Studio, saved-script view, accessible dialogs, and inline icon definitions |
| `style.css` | Responsive layouts, themes, component styles, and animations |
| `script.js` | Editor, voice selection, dictation, local storage, routes, and UI actions |
| `speech-core.js` | Text utilities, storage validation, and the speech playback controller |
| `assets/favicon.svg` | Local SpeechBot brand icon |
| `scripts/serve.cjs` | Dependency-free local server with protected port choices |
| `scripts/check.cjs` | JavaScript and markup-reference checks |
| `tests/` | Node tests for speech, state handling, storage, imports, and server behavior |
| `start.sh` | Ubuntu/macOS shell launcher |
| `CHANGELOG.md` | Improvements in this version |
| `VERIFICATION.md` | Automated verification and real-device check instructions |

## Development checks

```bash
npm run check
npm test
```

Or run both:

```bash
npm run verify
```

Tests use Node's built-in runner and controlled speech/DOM adapters. They check cancellation races, long passages, multilingual text, timing, draft recovery, storage errors, voice availability, imports, dictation, and server requests. They do not produce real audio or validate a rendered browser layout.

## Static hosting

This is a static project, so it can be served with a static host such as GitHub Pages. Keep `index.html`, `style.css`, `script.js`, `speech-core.js`, and `assets/` together. Asset paths are relative and navigation uses URL hashes, so there is no build step or server-side route rewrite.

For GitHub Pages, push the project files to a repository, select the branch/root folder in the repository's Pages settings, and use the resulting HTTPS URL. Browser/device voice limitations still apply after hosting. This ZIP does not publish or change any repository automatically.

## Original project

SpeechBot Studio extends the supplied `speechbot-basic-text-to-speech-main` project, retaining its text-to-speech, language/accent selection, speed control, dictation, and SpeechBot identity. The original README's project link is preserved in [ORIGINAL-PROJECT.md](ORIGINAL-PROJECT.md).
