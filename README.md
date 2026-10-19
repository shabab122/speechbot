<img src="assets/favicon.svg" width="52" height="52" alt="SpeechBot logo" />

# SpeechBot

A compact text-to-speech assistant with a friendly bot and multilingual device voices.

**[Open SpeechBot](https://speechbot-voice-assistant.snowyspoon16.chatgpt.site)**

Use this hosted link for everyday listening. No terminal or `npm start` is needed. The hosted Site currently uses owner-only access; your ChatGPT sign-in may be required. Localhost is only for development.

## Simple screen, complete controls

- Type or paste text, choose a language and voice, then press **Speak**.
- Pause, resume, stop, restart, and preview a voice.
- Try the quick speeds. Open **More controls** for pitch, volume, detailed speed, reading styles, and dictation language.
- Dictate with the microphone or use Reading view.
- Import text, copy, export, and save scripts with the compact toolbar.
- Keep up to 20 scripts with their voice settings. Drafts and theme preferences recover in the same browser.
- Try the Calm, Story, and বাংলা samples, or switch between dark and light themes.

The bot illustration comes from the supplied original project. The compact design retains the features introduced in SpeechBot Studio 2.0.

## Language and browser support

Voices come from your browser and operating system. Bangla playback needs an installed `bn-BD` or `bn-IN` voice. Unavailable languages are labelled clearly.

Language selection changes the reading voice; it does not translate text. Dictation, word highlighting, and pause behavior depend on browser and device support. Some voices and recognition services need an internet connection. Audio download is unavailable; **Export .txt** saves your words.

References: [Speech synthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) · [Speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Your scripts

Scripts stay in this browser's local storage. They are not synchronized between devices, profiles, or addresses. Localhost and hosted drafts use separate storage; export and import to move text between them.

Clearing site data removes the workspace. If storage is blocked or full, SpeechBot shows **Session only**; export important text to keep it. Dictation audio may be processed by your browser provider. SpeechBot has no speech-generation backend or analytics.

The editor holds **12,000 characters**. Import supports UTF-8 `.txt` and `.md` files up to **512 KB**, within the editor limit. Markdown is treated as plain text.

## Local development (optional)

Requires **Node.js 20+**. No dependency installation is needed.

```bash
cd SpeechBot
npm start
```

Open **http://127.0.0.1:5185**. On Ubuntu, `bash start.sh` also works. Ports **3000** and **3002** are reserved for GitStack and are rejected by the launcher. If 5185 is occupied:

```bash
PORT=5186 npm start
```

## Checks and static output

```bash
npm run verify
npm run build
```

`verify` checks the source and runs **32 automated tests**. `build` copies public assets to `dist/`. The project uses HTML, CSS, vanilla JavaScript, and the Web Speech API; no framework or build dependency is required.

| File | Purpose |
| --- | --- |
| `index.html` | Compact interface, saved scripts, and dialogs |
| `style.css` | Responsive layout, themes, and animation |
| `assets/bot.css` | Original CSS bot illustration |
| `script.js` | UI, dictation, storage, and script actions |
| `speech-core.js` | Speech playback and text utilities |
| `scripts/` | Local server, static build, and source checks |
| `tests/` | Regression tests |
| `VERIFICATION.md` | Test scope and real-device checks |

Keyboard shortcuts: **Ctrl/⌘ + Enter** to play/pause, **Ctrl/⌘ + S** to save, **Escape** to stop. Dialogs retain normal keyboard behavior.

## Release and hosting

The live link points to the deployed **2.1** release. Pushing to your own GitHub repository does not automatically redeploy this hosted Site. The ZIP contains the complete source and static files.

See [CHANGELOG.md](CHANGELOG.md) for updates and [ORIGINAL-PROJECT.md](ORIGINAL-PROJECT.md) for the original reference.

