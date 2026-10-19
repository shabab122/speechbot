(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SpeechCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_TEXT = 12000;
  const MAX_SCRIPTS = 20;
  const DEFAULT_SETTINGS = Object.freeze({ language: "", voice: "", rate: 1, pitch: 1, volume: 1, dictationLanguage: "en-US" });

  function normalizeText(value) {
    return String(value ?? "").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").replace(/\u0000/gu, "");
  }

  function wordCount(value) {
    // Segmenter also counts languages without spaces, when the platform supports it.
    if (!value.trim()) return 0;
    if (typeof Intl.Segmenter === "function") {
      const segments = new Intl.Segmenter(undefined, { granularity: "word" }).segment(value);
      let count = 0;
      for (const part of segments) if (part.isWordLike) count += 1;
      return count;
    }
    return (value.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*/gu) || []).length;
  }

  function estimateSeconds(text, rate = 1) {
    return text.trim() ? Math.max(1, Math.round(wordCount(text) / (150 * rate) * 60)) : 0;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function clamp(value, min, max, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  function cleanSettings(value) {
    const data = value && typeof value === "object" ? value : {};
    return {
      language: typeof data.language === "string" ? data.language.slice(0, 50) : "",
      voice: typeof data.voice === "string" ? data.voice.slice(0, 500) : "",
      rate: clamp(data.rate, 0.5, 2, 1),
      pitch: clamp(data.pitch, 0.5, 1.5, 1),
      volume: clamp(data.volume, 0, 1, 1),
      dictationLanguage: typeof data.dictationLanguage === "string" && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(data.dictationLanguage) ? data.dictationLanguage : "en-US",
    };
  }

  function cleanDraft(value) {
    const data = value && typeof value === "object" ? value : {};
    return {
      id: typeof data.id === "string" ? data.id.slice(0, 100) : null,
      title: typeof data.title === "string" ? data.title.slice(0, 80) : "",
      text: typeof data.text === "string" ? normalizeText(data.text).slice(0, MAX_TEXT) : "",
    };
  }

  function readWorkspace(raw) {
    const empty = { version: 2, draft: cleanDraft(null), settings: cleanSettings(null), scripts: [], theme: null };
    if (!raw) return empty;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || data.version !== 2) return empty;
      const ids = new Set();
      const scripts = (Array.isArray(data.scripts) ? data.scripts : []).filter(item => {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.text !== "string" || !item.text.trim()) return false;
        ids.add(item.id);
        return true;
      }).slice(0, MAX_SCRIPTS).map(item => ({
        ...cleanDraft(item),
        settings: cleanSettings(item.settings),
        updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      }));
      return { version: 2, draft: cleanDraft(data.draft), settings: cleanSettings(data.settings), scripts, theme: ["dark", "light"].includes(data.theme) ? data.theme : null };
    } catch { return empty; }
  }

  function safeFilename(title) {
    const name = String(title || "Untitled script").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "").replace(/\s+/gu, " ").replace(/[. ]+$/gu, "").trim().slice(0, 70) || "Untitled script";
    return `${name}.txt`;
  }

  // Keep original offsets and every character, including whitespace and emoji.
  function splitText(text, maxLength = 220) {
    if (!Number.isInteger(maxLength) || maxLength < 2) throw new RangeError("Chunk length must be at least 2.");
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxLength, text.length);
      if (end < text.length) {
        const section = text.slice(start, end);
        const preferred = [...section.matchAll(/[.!?।。！？;\n](?:[\s”’"']|$)/gu)].at(-1);
        const space = section.search(/\s+\S*$/u);
        if (preferred && preferred.index > maxLength * 0.3) end = start + preferred.index + preferred[0].length;
        else if (space > maxLength * 0.3) end = start + space + 1;
        // Never cut a UTF-16 surrogate pair in half.
        if (/[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end -= 1;
      }
      chunks.push({ text: text.slice(start, end), start });
      start = end;
    }
    return chunks;
  }

  class SpeechPlayer {
    constructor(synth, Utterance, handlers = {}, now = () => Date.now()) {
      this.synth = synth;
      this.Utterance = Utterance;
      this.handlers = handlers;
      this.now = now;
      this.state = "idle";
      this.session = 0;
      this.elapsedMs = 0;
      this.startedAt = null;
      this.utterance = null;
    }

    get active() { return ["starting", "playing", "paused"].includes(this.state); }
    get elapsed() { return (this.elapsedMs + (this.startedAt === null ? 0 : this.now() - this.startedAt)) / 1000; }

    setState(state) {
      if (state !== "playing" && this.startedAt !== null) {
        this.elapsedMs += this.now() - this.startedAt;
        this.startedAt = null;
      }
      if (state === "playing" && this.startedAt === null) this.startedAt = this.now();
      this.state = state;
      this.handlers.onState?.(state);
    }

    start(text, settings = {}, context = "script") {
      this.stop();
      if (!text.trim() || !this.synth || !this.Utterance) return false;
      const session = ++this.session;
      this.text = text;
      this.settings = { ...DEFAULT_SETTINGS, ...settings };
      this.context = context;
      // A whitespace-only utterance is skipped by some engines without an end event.
      this.chunks = splitText(text).filter(chunk => chunk.text.trim());
      this.index = 0;
      this.elapsedMs = 0;
      this.pendingChunk = false;
      this.setState("starting");
      // Reset a paused global queue before beginning a new reading.
      try { this.synth.resume(); } catch { /* No queued speech to resume. */ }
      this.speakChunk(session);
      return true;
    }

    speakChunk(session) {
      if (session !== this.session || !this.active) return;
      if (this.state === "paused") { this.pendingChunk = true; return; }
      const chunk = this.chunks[this.index];
      let utterance;
      try { utterance = new this.Utterance(chunk.text); }
      catch { this.fail("synthesis-unavailable"); return; }
      this.utterance = utterance;
      if (this.settings.voiceObject) utterance.voice = this.settings.voiceObject;
      utterance.lang = this.settings.voiceObject?.lang || this.settings.language || "en-US";
      utterance.rate = this.settings.rate;
      utterance.pitch = this.settings.pitch;
      utterance.volume = this.settings.volume;
      utterance.onstart = () => {
        if (session !== this.session || !this.active) return;
        if (this.state !== "paused") this.setState("playing");
      };
      utterance.onboundary = event => {
        if (session !== this.session || !this.active || !Number.isFinite(event.charIndex)) return;
        const index = Math.min(chunk.text.length, Math.max(0, event.charIndex));
        const fallback = chunk.text.slice(index).match(/^[\p{L}\p{N}\p{M}'’\-]+/u)?.[0].length || 1;
        const length = Math.max(1, Math.min(event.charLength || fallback, chunk.text.length - index));
        this.handlers.onBoundary?.(chunk.start + index, length, this.text.length);
      };
      utterance.onend = () => {
        if (session !== this.session || !this.active) return;
        this.handlers.onProgress?.(chunk.start + chunk.text.length, this.text.length);
        this.index += 1;
        if (this.index >= this.chunks.length) {
          this.utterance = null;
          this.setState("finished");
          this.handlers.onFinish?.(this.context);
        } else this.speakChunk(session);
      };
      utterance.onerror = event => {
        if (session !== this.session || !this.active) return;
        this.fail(event.error || "synthesis-failed");
      };
      try { this.synth.speak(utterance); }
      catch { if (session === this.session) this.fail("synthesis-failed"); }
    }

    fail(error) {
      this.stop();
      this.handlers.onError?.(error);
    }

    pause() {
      if (!["starting", "playing"].includes(this.state)) return;
      this.setState("paused");
      try { this.synth.pause(); } catch { this.fail("pause-failed"); }
    }

    resume() {
      if (this.state !== "paused") return;
      this.setState("playing");
      try {
        this.synth.resume();
        if (this.pendingChunk) {
          this.pendingChunk = false;
          this.speakChunk(this.session);
        }
      } catch { this.fail("resume-failed"); }
    }

    stop() {
      this.session += 1;
      this.pendingChunk = false;
      this.utterance = null;
      try { this.synth?.cancel(); } catch { /* A missing service must not break editing. */ }
      this.setState("idle");
    }
  }

  return { MAX_TEXT, MAX_SCRIPTS, DEFAULT_SETTINGS, normalizeText, wordCount, estimateSeconds, formatTime, cleanSettings, readWorkspace, safeFilename, splitText, SpeechPlayer };
});
