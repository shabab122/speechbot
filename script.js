(() => {
  "use strict";

  const C = window.SpeechCore;
  const $ = id => document.getElementById(id);
  const textArea = $("speech-text");
  const titleInput = $("script-title");
  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechAvailable = Boolean(synth && window.SpeechSynthesisUtterance);
  const STORAGE_KEY = "speechbot-studio:v2";
  const PRESETS = { natural: { rate: 1, pitch: 1 }, story: { rate: 0.9, pitch: 1.1 }, study: { rate: 0.8, pitch: 1 } };
  const COMMON_LANGUAGES = ["en-US", "en-GB", "bn-BD", "bn-IN", "hi-IN", "ar-SA", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"];
  const SAMPLES = {
    mindful: { title: "A mindful moment", text: "Take a small pause. Let your shoulders soften, and take one slow breath.\n\nYou do not have to solve everything today. Notice the light in the room, the sound of the world outside, and the ground beneath your feet.\n\nFor this moment, being here is enough.", preset: "study" },
    story: { title: "Once upon a thought", text: "At the end of a quiet street, there was a bookshop that opened only when it rained.\n\nMira had walked past it a hundred times. But that afternoon, with her shoes full of rain and her pockets full of questions, she finally turned the handle.\n\nA bell rang. Somewhere between the shelves, a voice said, \"We have been saving a story for you.\"", preset: "story" },
    bangla: { title: "বাংলায় কিছু কথা", text: "প্রতিটি নতুন দিন একটি নতুন সুযোগ। ছোট ছোট চেষ্টা থেকেই বড় পরিবর্তন আসে।\n\nএকটু সময় নিয়ে নিজের স্বপ্নের কথা ভাবুন। আজ হয়তো সব কাজ শেষ হবে না, কিন্তু একটি ছোট পদক্ষেপ আপনাকে অনেক দূর এগিয়ে নিতে পারে।\n\nনিজের ওপর বিশ্বাস রাখুন। আপনার গল্প এখনো লেখা হচ্ছে।", preset: "natural" },
  };
  let raw = null;
  let storageAvailable = true;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { storageAvailable = false; }
  const workspace = C.readWorkspace(raw);
  let settings = { ...workspace.settings };
  let preferredVoice = settings.voice;
  let voices = [];
  let voicesSettled = false;
  let readingView = false;
  let boundary = null;
  let actualProgress = 0;
  let autosaveTimer;
  let toastTimer;
  let recognition = null;
  let recognitionSession = 0;
  let dictationState = "idle";
  let importBusy = false;
  let importSession = 0;
  let stats = { words: 0, seconds: 0 };
  const displayNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function labelButton(id, name, text) {
    const button = $(id);
    button.replaceChildren(icon(name), node("span", "", text));
    button.setAttribute("aria-label", text);
    button.title = text;
  }

  function message(text = "", error = false) {
    const area = $("support-message");
    area.textContent = text;
    area.hidden = !text;
    area.classList.toggle("is-error", error);
  }

  function toast(text) {
    clearTimeout(toastTimer);
    $("toast-text").textContent = text;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3600);
  }

  function captureDraft() {
    workspace.draft = { id: workspace.draft.id, title: titleInput.value, text: textArea.value };
    workspace.settings = { ...settings };
  }

  function persist() {
    clearTimeout(autosaveTimer);
    captureDraft();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      storageAvailable = true;
    } catch { storageAvailable = false; }
    $("storage-warning").hidden = storageAvailable;
    $("autosave-status").replaceChildren(node("span", "status-dot"), document.createTextNode(storageAvailable ? "Saved on this device" : "Session only"));
    return storageAvailable;
  }

  function queueSave() {
    $("autosave-status").replaceChildren(node("span", "status-dot"), document.createTextNode(storageAvailable ? "Saving draft…" : "Session only"));
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(persist, 350);
  }

  function languageName(tag) {
    try { return displayNames?.of(tag) || tag; } catch { return tag; }
  }

  function voiceId(voice) { return voice.voiceURI || `${voice.name}::${voice.lang}`; }
  function matchingVoices() { return settings.language ? voices.filter(voice => voice.lang.toLowerCase() === settings.language.toLowerCase()) : voices; }
  function selectedVoice() { return voices.find(voice => voiceId(voice) === settings.voice); }
  function missingVoice() { return Boolean(settings.language && !matchingVoices().length); }
  function dictating() { return dictationState !== "idle"; }

  const player = new C.SpeechPlayer(synth, window.SpeechSynthesisUtterance, {
    onState: state => {
      document.body.classList.toggle("is-speaking", state === "playing");
      if (state === "starting") { actualProgress = 0; boundary = null; }
      if (state === "idle") { actualProgress = 0; boundary = null; }
      if (!player.active) renderReading();
      refreshControls();
      renderPlayer();
    },
    onBoundary: (start, length, total) => {
      if (player.context !== "script") return;
      boundary = { start, length };
      actualProgress = Math.max(actualProgress, start / total * 100);
      renderReading();
    },
    onProgress: (completed, total) => { actualProgress = completed / total * 100; },
    onFinish: context => {
      actualProgress = 100;
      boundary = null;
      renderReading();
      renderPlayer();
      if (context === "preview") toast("Voice preview finished.");
    },
    onError: error => {
      const errors = {
        "not-allowed": "Playback was blocked. Press Play again to allow speech in this tab.",
        "voice-unavailable": "This voice is unavailable. Choose another device voice and try again.",
        "language-unavailable": "A voice for this language is unavailable. Install a matching voice or choose another language.",
        "audio-busy": "Your audio device is busy. Close other audio apps and try again.",
        "audio-hardware": "An audio device could not be used. Check your speaker or headphones.",
        "network": "This voice needs a connection. Check your network or try a local device voice.",
        "synthesis-unavailable": "The speech service is unavailable on this device.",
        "text-too-long": "The voice could not read this passage. Try a shorter script or another voice.",
        "pause-failed": "This voice could not pause. Try another voice.",
        "resume-failed": "This voice could not resume. Press Play to start again.",
      };
      message(errors[error] || "Speech could not play. Check your audio output and try another voice.", true);
    },
  });

  function refreshControls() {
    const hasText = Boolean(textArea.value.trim());
    const activeScript = player.active && player.context === "script";
    const activePreview = player.active && player.context === "preview";
    const playable = speechAvailable && hasText && !missingVoice();
    $("speak-button").disabled = dictating() || (!activeScript && !playable);
    const playing = activeScript && player.state !== "paused";
    labelButton("speak-button", playing ? "pause" : "play", playing ? (player.state === "starting" ? "Starting…" : "Pause") : activeScript ? "Resume" : "Speak");
    $("speak-button").setAttribute("aria-label", activeScript ? (player.state === "paused" ? "Resume reading" : "Pause reading") : "Read script aloud");
    $("stop-button").disabled = !player.active && !dictating();
    $("restart-button").disabled = !playable || dictating();
    $("preview-button").disabled = !speechAvailable || missingVoice() || dictating();
    labelButton("preview-button", activePreview ? "stop" : "play", activePreview ? "Stop preview" : "Preview voice");
    ["copy-button", "export-button", "save-button", "reading-toggle"].forEach(id => { $(id).disabled = !hasText; });
    $("clear-button").disabled = !textArea.value || player.active || dictating();
    $("import-button").disabled = player.active || dictating() || importBusy;
    textArea.readOnly = player.active || dictating();
    const saved = workspace.scripts.some(script => script.id === workspace.draft.id);
    labelButton("save-button", "save", saved ? "Update script" : "Save script");
    $("mic-button").disabled = !Recognition || dictationState === "stopping";
    $("mic-button").classList.toggle("is-listening", dictating());
    $("mic-button").setAttribute("aria-pressed", String(dictating()));
    const micLabel = dictationState === "starting" ? "Cancel mic" : dictationState === "stopping" ? "Finishing…" : dictationState === "listening" ? "Stop dictation" : "Dictate";
    labelButton("mic-button", "mic", micLabel);
    $("mic-button").title = Recognition ? "Draft with your microphone" : "Dictation is unavailable in this browser";
    $("dictation-language").disabled = !Recognition || dictating();
  }

  function refreshStats() {
    stats.words = C.wordCount(textArea.value);
    stats.seconds = C.estimateSeconds(textArea.value, settings.rate);
    $("word-count").textContent = `${stats.words.toLocaleString()} ${stats.words === 1 ? "word" : "words"}`;
    $("char-count").textContent = `${textArea.value.length.toLocaleString()} / 12,000 characters`;
    $("time-estimate").textContent = `~${C.formatTime(stats.seconds)}`;
    renderPlayer();
  }

  function renderPlayer() {
    const activePreview = player.context === "preview" && player.active;
    const seconds = activePreview ? C.estimateSeconds(player.text, settings.rate) : stats.seconds;
    const finishedScript = player.state === "finished" && player.context === "script";
    const elapsed = player.active || finishedScript ? player.elapsed : 0;
    $("elapsed-time").textContent = C.formatTime(elapsed);
    $("total-time").textContent = `~${C.formatTime(seconds)}`;
    $("playback-progress").value = finishedScript ? 100 : player.active ? Math.min(98, Math.max(actualProgress, seconds ? elapsed / seconds * 95 : 0)) : 0;
    $("player-card").classList.toggle("is-playing", player.state === "playing");
    $("player-card").classList.toggle("is-paused", player.state === "paused");
    const names = { idle: "Ready to play", starting: "Starting…", playing: activePreview ? "Voice preview" : "Now reading", paused: "Paused", finished: player.context === "preview" ? "Ready to play" : "All read" };
    $("player-state").textContent = speechAvailable ? names[player.state] : "Speech unavailable";
    $("player-caption").hidden = settings.volume !== 0;
    $("player-caption").textContent = "Muted. Raise the volume in More controls to listen.";
  }

  function renderReading() {
    if (!readingView) return;
    const target = $("reading-text");
    const text = textArea.value;
    if (boundary && player.active && player.context === "script") {
      const highlight = node("mark", "", text.slice(boundary.start, boundary.start + boundary.length));
      target.replaceChildren(document.createTextNode(text.slice(0, boundary.start)), highlight, document.createTextNode(text.slice(boundary.start + boundary.length)));
      // Scroll only the reading pane, without moving the whole page.
      const pane = target.getBoundingClientRect();
      const word = highlight.getBoundingClientRect();
      if (word.top < pane.top || word.bottom > pane.bottom) target.scrollTop += word.top - pane.top - 70;
    } else target.textContent = text;
  }

  function toggleReading(force) {
    readingView = typeof force === "boolean" ? force : !readingView;
    $("reading-text").hidden = !readingView;
    textArea.hidden = readingView;
    $("reading-toggle").setAttribute("aria-pressed", String(readingView));
    labelButton("reading-toggle", readingView ? "file" : "eye", readingView ? "Back to editor" : "Reading view");
    renderReading();
  }

  function editorChanged() {
    if (player.active || player.state === "finished") player.stop();
    captureDraft();
    actualProgress = 0;
    boundary = null;
    refreshStats();
    refreshControls();
    renderReading();
    queueSave();
  }

  function populateVoices() {
    if (!speechAvailable) return;
    try { voices = synth.getVoices().slice().filter(voice => voice && typeof voice.name === "string" && typeof voice.lang === "string"); }
    catch { voices = []; }
    voices.sort((a, b) => a.lang.localeCompare(b.lang) || Number(b.default) - Number(a.default) || a.name.localeCompare(b.name));
    if (voices.length) voicesSettled = true;
    const languages = [...new Set([...COMMON_LANGUAGES, ...voices.map(voice => voice.lang), ...(settings.language ? [settings.language] : [])])].sort((a, b) => languageName(a).localeCompare(languageName(b)));
    const accentSelect = $("accent-select");
    accentSelect.replaceChildren(new Option("All languages", ""));
    for (const language of languages) {
      const count = voices.filter(voice => voice.lang.toLowerCase() === language.toLowerCase()).length;
      accentSelect.append(new Option(`${languageName(language)}${count ? ` · ${count}` : " · not installed"}`, language));
    }
    accentSelect.value = settings.language;
    const filtered = matchingVoices();
    const voiceSelect = $("voice-select");
    voiceSelect.replaceChildren();
    filtered.forEach(voice => voiceSelect.append(new Option(`${voice.name}${voice.localService ? " · local" : ""}`, voiceId(voice))));
    if (filtered.length) {
      const chosen = filtered.find(voice => voiceId(voice) === preferredVoice) || filtered.find(voice => voiceId(voice) === settings.voice) || filtered.find(voice => voice.default) || filtered[0];
      settings.voice = voiceId(chosen);
      voiceSelect.value = settings.voice;
    } else voiceSelect.append(new Option(settings.language ? "No matching voice installed" : voicesSettled ? "System default (if available)" : "Loading device voices…", ""));
    voiceSelect.disabled = !filtered.length;
    accentSelect.disabled = false;
    $("voice-count").textContent = `${voices.length} ${voices.length === 1 ? "voice" : "voices"} on this device`;
    $("voice-hint").textContent = missingVoice() ? "No matching voice is installed. Add a voice in your device's language or accessibility settings, then reload." : !voices.length && voicesSettled ? "No named voices were found. The browser's system default will be tried." : "Voices are provided by your device and browser.";
    $("voice-hint").hidden = !(missingVoice() || (!voices.length && voicesSettled));
    refreshControls();
  }

  function syncSettings() {
    $("dictation-language").value = settings.dictationLanguage;
    for (const key of ["rate", "pitch", "volume"]) {
      const range = $(`${key}-range`);
      range.value = settings[key];
      range.style.setProperty("--fill", `${(Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`);
    }
    $("rate-output").textContent = `${settings.rate.toFixed(1)}×`;
    $("pitch-output").textContent = settings.pitch.toFixed(1);
    $("volume-output").textContent = `${Math.round(settings.volume * 100)}%`;
    document.querySelectorAll("[data-rate]").forEach(button => {
      const selected = Number(button.dataset.rate) === settings.rate;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-preset]").forEach(button => {
      const preset = PRESETS[button.dataset.preset];
      const selected = preset.rate === settings.rate && preset.pitch === settings.pitch;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    refreshStats();
  }

  function settingsChanged() {
    if (player.active) { player.stop(); toast("Settings updated. Press Play to listen again."); }
    syncSettings();
    captureDraft();
    refreshControls();
    queueSave();
  }

  function playbackSettings() { return { ...settings, voiceObject: selectedVoice() }; }

  function startReading() {
    if (!speechAvailable || missingVoice() || !textArea.value.trim() || dictating()) return;
    message();
    boundary = null;
    actualProgress = 0;
    player.start(textArea.value, playbackSettings(), "script");
  }

  function togglePlayback() {
    if (player.active && player.context === "script") {
      if (player.state === "paused") player.resume(); else player.pause();
    } else startReading();
  }

  function previewVoice() {
    if (player.active && player.context === "preview") { player.stop(); return; }
    if (!speechAvailable || missingVoice() || dictating()) return;
    const language = (selectedVoice()?.lang || settings.language || "en-US").split("-")[0];
    const greetings = { en: "Hello! This is your SpeechBot voice. Let's bring your words to life.", bn: "স্বাগতম। আপনার কথাগুলো শুনতে আমি প্রস্তুত। চলুন, একসাথে একটি নতুন গল্প শুরু করি।", hi: "नमस्ते। आपके शब्दों को आवाज़ देने के लिए मैं तैयार हूँ।", ar: "مرحباً، أنا مستعد لقراءة كلماتك.", es: "Hola. Estoy listo para dar voz a tus palabras.", fr: "Bonjour. Je suis prêt à donner une voix à vos mots.", de: "Hallo. Ich bin bereit, deinen Worten eine Stimme zu geben.", ja: "こんにちは。あなたの言葉に声を届けます。", zh: "你好。让我们一起为文字赋予声音。" };
    message();
    player.start(greetings[language] || greetings.en, playbackSettings(), "preview");
  }

  function stopDictation(discard = false) {
    if (!recognition) return;
    const current = recognition;
    if (discard) {
      recognitionSession += 1;
      recognition = null;
      dictationState = "idle";
      try { current.abort(); } catch { /* Already disconnected. */ }
      $("dictation-interim").hidden = true;
    } else {
      dictationState = "stopping";
      try { current.stop(); } catch {
        recognitionSession += 1;
        recognition = null;
        dictationState = "idle";
      }
    }
    refreshControls();
  }

  function toggleDictation() {
    if (!Recognition) return;
    if (dictating()) { stopDictation(dictationState === "starting"); return; }
    if (!window.isSecureContext) {
      message("Microphone dictation needs HTTPS or localhost. Run the included local server, then open its address.", true);
      return;
    }
    player.stop();
    toggleReading(false);
    message("Your browser's recognition provider may process microphone audio online. Allow the microphone to begin.");
    const session = ++recognitionSession;
    let current;
    try { current = new Recognition(); }
    catch { message("The browser's dictation service is unavailable.", true); return; }
    recognition = current;
    current.lang = settings.dictationLanguage;
    current.continuous = false;
    current.interimResults = true;
    dictationState = "starting";
    const applied = new Set();
    current.onstart = () => {
      if (session !== recognitionSession) return;
      dictationState = "listening";
      refreshControls();
      message("Listening. Speak naturally; your words will appear in the editor.");
    };
    current.onresult = event => {
      if (session !== recognitionSession) return;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript.trim();
        if (result.isFinal && !applied.has(index)) {
          applied.add(index);
          if (!transcript) continue;
          const separator = textArea.value && !/\s$/u.test(textArea.value) ? " " : "";
          if (textArea.value.length + separator.length + transcript.length > C.MAX_TEXT) {
            stopDictation(true);
            message("This script has reached its 12,000-character limit. Save it and start a new script to keep dictating.", true);
            return;
          }
          textArea.value += separator + transcript;
          editorChanged();
          textArea.scrollTop = textArea.scrollHeight;
        } else if (!result.isFinal) interim += `${transcript} `;
      }
      $("dictation-interim").textContent = interim.trim();
      $("dictation-interim").hidden = !interim.trim();
    };
    current.onerror = event => {
      if (session !== recognitionSession) return;
      const errors = { "not-allowed": "Microphone access was blocked. Allow it in your browser's site permissions and try again.", "service-not-allowed": "Your browser's speech recognition service is unavailable or disabled.", "audio-capture": "No microphone was found. Check your audio input and browser permissions.", "no-speech": "No speech was detected. Tap Dictate to try again.", "network": "Dictation could not connect to its recognition service. Check your internet connection.", "language-not-supported": "The recognition service does not support this dictation language. Try another language." };
      if (event.error !== "aborted") message(errors[event.error] || "Dictation ended unexpectedly. You can keep typing or try again.", true);
    };
    current.onend = () => {
      if (session !== recognitionSession) return;
      recognition = null;
      dictationState = "idle";
      $("dictation-interim").hidden = true;
      refreshControls();
      if (!$("support-message").classList.contains("is-error")) message("Dictation finished. Your text is ready to edit.");
    };
    refreshControls();
    try { current.start(); }
    catch {
      stopDictation(true);
      message("Dictation could not start. Check microphone permission or try a supported browser.", true);
    }
  }

  function confirmAction(title, description, action) {
    const dialog = $("confirm-dialog");
    if (dialog.open) return Promise.resolve(false);
    $("confirm-heading").textContent = title;
    $("confirm-description").textContent = description;
    $("confirm-action").textContent = action;
    if (typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n\n${description}`));
    return new Promise(resolve => {
      dialog.returnValue = "";
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }

  function draftNeedsProtection() {
    if (!textArea.value.trim() && !titleInput.value.trim()) return false;
    const saved = workspace.scripts.find(script => script.id === workspace.draft.id);
    return !saved || saved.text !== textArea.value || saved.title !== titleInput.value || JSON.stringify(saved.settings) !== JSON.stringify(settings);
  }

  async function replaceDraft(draft, nextSettings = null, options = {}) {
    if (draftNeedsProtection() && !await confirmAction(options.title || "Replace this draft?", options.description || "Your current draft has unsaved changes. Choose Keep editing to save or export it first.", options.action || "Replace draft")) return false;
    importSession += 1;
    stopDictation(true);
    player.stop();
    workspace.draft = { id: draft.id || null, title: draft.title || "", text: draft.text || "" };
    titleInput.value = workspace.draft.title;
    textArea.value = workspace.draft.text;
    if (nextSettings) {
      settings = C.cleanSettings(nextSettings);
      preferredVoice = settings.voice;
      populateVoices();
      syncSettings();
    }
    toggleReading(false);
    actualProgress = 0;
    boundary = null;
    message();
    refreshStats();
    refreshControls();
    persist();
    if (location.hash !== "#studio") location.hash = "studio";
    textArea.focus();
    return true;
  }

  function saveScript() {
    if (!textArea.value.trim()) return;
    captureDraft();
    const index = workspace.scripts.findIndex(script => script.id === workspace.draft.id);
    if (index < 0 && workspace.scripts.length >= C.MAX_SCRIPTS) {
      message("Your shelf holds 20 scripts. Export and remove a saved script to make room for another.", true);
      return;
    }
    const id = index >= 0 ? workspace.scripts[index].id : window.crypto?.randomUUID?.() || `script-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const title = titleInput.value.trim() || textArea.value.trim().split("\n")[0].slice(0, 55) || "Untitled script";
    const script = { id, title, text: textArea.value, settings: { ...settings }, updatedAt: Date.now() };
    if (index >= 0) workspace.scripts[index] = script;
    else workspace.scripts.unshift(script);
    titleInput.value = title;
    workspace.draft.id = id;
    const kept = persist();
    refreshControls();
    renderSaved();
    toast(kept ? (index >= 0 ? "Script updated on this device." : "Script added to your shelf.") : "Saved for this session. Export a copy to keep it.");
  }

  async function loadSample(key) {
    const sample = SAMPLES[key];
    if (!sample) return;
    const next = { ...settings, ...PRESETS[sample.preset] };
    if (key === "bangla") {
      next.language = voices.find(voice => /^bn-BD$/i.test(voice.lang))?.lang || voices.find(voice => /^bn(?:-|$)/i.test(voice.lang))?.lang || "bn-BD";
      next.dictationLanguage = "bn-BD";
      next.voice = "";
    } else if (settings.language.startsWith("bn")) { next.language = ""; next.voice = ""; }
    if (await replaceDraft(sample, next)) {
      toast("A little inspiration, ready to make your own.");
      if (missingVoice()) message("This Bangla sample is ready to edit. To hear it, install a Bangla voice in your device's language or accessibility settings and reload.");
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { message("Choose a plain-text .txt or .md file.", true); return; }
    if (file.size > 512 * 1024) { message("This file is too large. Choose a text file under 512 KB with up to 12,000 characters.", true); return; }
    const session = ++importSession;
    importBusy = true;
    refreshControls();
    try {
      const text = C.normalizeText(await file.text());
      if (session !== importSession) return;
      if (text.length > C.MAX_TEXT) { message("This file exceeds 12,000 characters. Split it into smaller scripts, then import again.", true); return; }
      if (!text.trim()) { message("This file is empty. Choose a file with some text.", true); return; }
      if (await replaceDraft({ title: file.name.replace(/\.(txt|md)$/i, "").slice(0, 80), text })) toast("Text imported. Make it sound like you.");
    } catch { message("This file could not be read. Try a UTF-8 plain-text file.", true); }
    finally { importBusy = false; refreshControls(); }
  }

  function exportText(title = titleInput.value, text = textArea.value) {
    if (!text.trim()) return;
    const blob = new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = node("a", "");
    link.href = url;
    link.download = C.safeFilename(title);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Your text file is ready to download.");
  }

  async function copyText() {
    if (!textArea.value.trim()) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(textArea.value);
      else {
        const field = node("textarea", "visually-hidden");
        field.value = textArea.value;
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        $("copy-button").focus();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      toast("Words copied. Take them somewhere good.");
    } catch { message("Copy permission was blocked. Select your text and use your device's Copy command.", true); }
  }

  function renderSaved() {
    $("nav-count").textContent = String(workspace.scripts.length);
    const query = $("script-search").value.trim().toLocaleLowerCase();
    const scripts = workspace.scripts.slice().sort((a, b) => b.updatedAt - a.updatedAt).filter(script => `${script.title}\n${script.text}`.toLocaleLowerCase().includes(query));
    $("saved-summary").textContent = `${workspace.scripts.length} of 20 scripts${query ? ` · ${scripts.length} found` : ""}`;
    const grid = $("saved-grid");
    grid.replaceChildren();
    $("saved-empty").hidden = scripts.length > 0;
    $("saved-empty").querySelector("h2").textContent = workspace.scripts.length ? "No matching scripts." : "No saved scripts yet.";
    $("saved-empty").querySelector("p").textContent = workspace.scripts.length ? "Try another word or title." : "Save a script to keep it here.";
    $("saved-empty").querySelector("a").hidden = workspace.scripts.length > 0;
    for (const script of scripts) {
      const card = node("article", "saved-card");
      const top = node("div", "saved-card-top");
      top.append(icon("file"), node("span", "", script.updatedAt ? new Date(script.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Saved script"));
      const excerpt = node("p", "excerpt", script.text);
      excerpt.dir = "auto";
      const heading = node("h2", "", script.title || "Untitled script");
      heading.dir = "auto";
      const meta = node("p", "saved-meta", `${C.wordCount(script.text)} words · ${script.settings.rate.toFixed(1)}× · ~${C.formatTime(C.estimateSeconds(script.text, script.settings.rate))}`);
      const actions = node("div", "saved-card-actions");
      const open = node("button", "text-button", "Open script");
      open.type = "button";
      open.append(icon("arrow"));
      open.addEventListener("click", () => replaceDraft(script, script.settings));
      const tools = node("div", "tool-group");
      const download = node("button", "icon-button");
      download.type = "button";
      download.setAttribute("aria-label", `Export ${script.title} as text`);
      download.title = "Export .txt";
      download.append(icon("download"));
      download.addEventListener("click", () => exportText(script.title, script.text));
      const remove = node("button", "icon-button");
      remove.type = "button";
      remove.title = "Remove saved script";
      remove.setAttribute("aria-label", `Remove ${script.title}`);
      remove.append(icon("trash"));
      remove.addEventListener("click", async () => {
        if (!await confirmAction("Remove this saved script?", `“${script.title}” will be removed from your saved scripts on this device. Export it first if you need a copy.`, "Remove script")) return;
        workspace.scripts = workspace.scripts.filter(item => item.id !== script.id);
        if (workspace.draft.id === script.id) workspace.draft.id = null;
        persist();
        renderSaved();
        refreshControls();
        toast("Saved script removed.");
        $("script-search").focus();
      });
      tools.append(download, remove);
      actions.append(open, tools);
      card.append(top, heading, excerpt, meta, actions);
      grid.append(card);
    }
  }

  function renderRoute(moveFocus = false) {
    const saved = location.hash === "#saved";
    $("studio-view").hidden = saved;
    $("saved-view").hidden = !saved;
    for (const [id, active] of [["studio-link", !saved], ["saved-link", saved]]) {
      $(id).classList.toggle("is-active", active);
      if (active) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
    }
    if (saved) { player.stop(); stopDictation(true); renderSaved(); }
    if (moveFocus) {
      $("main-content").focus({ preventScroll: true });
      window.scrollTo?.(0, 0);
    }
    document.title = saved ? "Saved scripts — SpeechBot" : "SpeechBot — Your speak assistant";
  }

  function setTheme(theme) {
    workspace.theme = theme;
    document.documentElement.dataset.theme = theme;
    $("theme-button").replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
    $("theme-button").setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#080c1d" : "#f1f3fc";
  }

  function initialize() {
    titleInput.value = workspace.draft.title;
    textArea.value = workspace.draft.text;
    setTheme(workspace.theme || "dark");
    $("storage-warning").hidden = storageAvailable;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    document.querySelectorAll(".play-shortcut").forEach(key => { key.textContent = mac ? "⌘" : "Ctrl"; });
    for (let i = 0; i < 68; i += 1) {
      const bar = node("span", "");
      const envelope = Math.sin(i / 67 * Math.PI);
      bar.style.setProperty("--bar-height", `${6 + envelope * (12 + ((i * 17 + 11) % 29))}px`);
      bar.style.setProperty("--delay", `${-(i % 13) * 0.11}s`);
      $("activity-wave").append(bar);
    }
    syncSettings();
    populateVoices();
    if (synth?.addEventListener) synth.addEventListener("voiceschanged", populateVoices);
    else if (synth) synth.onvoiceschanged = populateVoices;
    if (speechAvailable) setTimeout(() => { voicesSettled = true; populateVoices(); }, 1200);
    else {
      $("accent-select").disabled = true;
      $("voice-select").replaceChildren(new Option("Speech is unavailable here", ""));
      $("voice-count").textContent = "Speech unavailable in this browser";
      message("Speech playback is unavailable in this browser. You can still write, save, copy, import, and export scripts.");
    }
    $("browser-support").textContent = `This browser: speech playback ${speechAvailable ? "detected" : "unavailable"}; microphone dictation ${Recognition ? "detected" : "unavailable"}. Detected support still depends on available device voices and permissions.`;
    refreshStats();
    refreshControls();
    renderSaved();
    renderRoute();
    if (workspace.draft.text) $("autosave-status").replaceChildren(node("span", "status-dot"), document.createTextNode(storageAvailable ? "Draft restored" : "Session only"));

    textArea.addEventListener("input", editorChanged);
    titleInput.addEventListener("input", () => { captureDraft(); queueSave(); });
    $("speak-button").addEventListener("click", togglePlayback);
    $("stop-button").addEventListener("click", () => { player.stop(); stopDictation(true); });
    $("restart-button").addEventListener("click", startReading);
    $("preview-button").addEventListener("click", previewVoice);
    $("mic-button").addEventListener("click", toggleDictation);
    $("reading-toggle").addEventListener("click", () => toggleReading());
    $("accent-select").addEventListener("change", event => { settings.language = event.target.value; preferredVoice = ""; populateVoices(); settingsChanged(); });
    $("voice-select").addEventListener("change", event => { settings.voice = event.target.value; preferredVoice = settings.voice; settingsChanged(); });
    $("dictation-language").addEventListener("change", event => { settings.dictationLanguage = event.target.value; queueSave(); });
    for (const key of ["rate", "pitch", "volume"]) $(`${key}-range`).addEventListener("input", event => { settings[key] = Number(event.target.value); settingsChanged(); });
    document.querySelectorAll("[data-rate]").forEach(button => button.addEventListener("click", () => { settings.rate = Number(button.dataset.rate); settingsChanged(); }));
    $("advanced-button").addEventListener("click", () => $("voice-settings-dialog").showModal());
    document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => { Object.assign(settings, PRESETS[button.dataset.preset]); settingsChanged(); }));
    $("reset-settings").addEventListener("click", () => { Object.assign(settings, { rate: 1, pitch: 1, volume: 1 }); settingsChanged(); toast("Voice adjustments reset."); });
    document.querySelectorAll("[data-sample]").forEach(button => button.addEventListener("click", () => loadSample(button.dataset.sample)));
    ["new-script", "saved-new-script"].forEach(id => $(id).addEventListener("click", () => replaceDraft({})));
    $("clear-button").addEventListener("click", () => replaceDraft({ id: workspace.draft.id, title: titleInput.value, text: "" }, null, { title: "Clear this text?", description: "Save or export your current draft first if you want to keep these words.", action: "Clear text" }));
    $("save-button").addEventListener("click", saveScript);
    $("copy-button").addEventListener("click", copyText);
    $("export-button").addEventListener("click", () => exportText());
    $("import-button").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", importFile);
    $("script-search").addEventListener("input", renderSaved);
    $("theme-button").addEventListener("click", () => { setTheme(workspace.theme === "dark" ? "light" : "dark"); persist(); });
    $("guide-button").addEventListener("click", () => $("guide-dialog").showModal());
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
    window.addEventListener("hashchange", () => renderRoute(true));
    document.addEventListener("keydown", event => {
      if (event.isComposing || $("confirm-dialog").open || $("guide-dialog").open || $("voice-settings-dialog").open) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Enter" && !$("studio-view").hidden) { event.preventDefault(); togglePlayback(); }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s" && !$("studio-view").hidden) { event.preventDefault(); saveScript(); }
      if (event.key === "Escape") { player.stop(); stopDictation(true); }
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
    window.addEventListener("pagehide", () => { persist(); player.stop(); stopDictation(true); });
    setInterval(() => { if (player.active) renderPlayer(); }, 300);
  }

  initialize();
})();
