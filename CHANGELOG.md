# Changelog

## 2.0.0 — SpeechBot Studio

### Interface

- Rebuilt the original screen as a complete writing and listening workspace.
- Added a responsive header, studio/saved-script navigation, and a coherent SpeechBot icon system.
- Added light and dark themes with persistent preferences.
- Added mobile layouts, reduced-motion styles, keyboard shortcuts, and an in-app guide.

### Speech and dictation

- Preserved text-to-speech, voice selection, language/accent selection, speed adjustment, and microphone dictation.
- Added pause/resume, a separate Stop control, replay from the beginning, voice preview, pitch, and volume.
- Added Natural, Story, and Study reading presets.
- Split long text into small utterances while preserving text offsets and Unicode surrogate pairs.
- Invalidated stale speech and microphone callbacks after cancellation or a replacement session.
- Added estimated timing/progress, a decorative activity indicator, and an optional reading view.
- Added a separate dictation-language selector, interim transcription, and browser/service error messages.
- Exposed missing language voices instead of silently substituting a different language.

### Workspace

- Added script titles, word/character counts, and a 12,000-character editor limit.
- Added automatic draft recovery and up to 20 locally saved scripts with their own voice settings.
- Added saved-script search, open, update, export, and confirmed removal.
- Added UTF-8 text/Markdown import, clipboard copy, and text export.
- Added English and Bangla starting prompts with draft-replacement protection.
- Added storage validation, session-only fallback, and explicit privacy information.

### Project setup

- Added a dependency-free Node launcher on port 5185, with ports 3000 and 3002 reserved for GitStack.
- Added a shell launcher, professional README, verification notes, and automated checks/tests.
- Kept the project buildless and compatible with relative-path static hosting.
