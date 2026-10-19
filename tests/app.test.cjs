"use strict";
// Controller tests use a small DOM/speech adapter; no browser or audio device is simulated.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const C = require("../speech-core.js");
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this._value = "";
    this._text = "";
    this._classes = new Set();
    this.style = { setProperty() {} };
    this.classList = {
      contains: name => this._classes.has(name),
      toggle: (name, force) => { const state = force === undefined ? !this._classes.has(name) : force; if (state) this._classes.add(name); else this._classes.delete(name); return state; },
    };
  }
  set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(" "); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "class") this.className = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() {}
  select() {}
  getBoundingClientRect() { return { top: 0, bottom: 100 }; }
  addEventListener(name, callback, options = {}) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push({ callback, options }); }
  async emit(name, extra = {}) {
    const event = { target: this, currentTarget: this, preventDefault() {}, ...extra };
    for (const listener of [...(this.listeners.get(name) || [])]) {
      await listener.callback(event);
      if (listener.options.once) this.listeners.set(name, this.listeners.get(name).filter(item => item !== listener));
    }
  }
  click() { if (!this.disabled) return this.emit("click"); }
  querySelector(tag) { return this.children.find(child => child.tagName === tag.toUpperCase()) || null; }
  showModal() { this.open = true; }
  close(value = "") { this.open = false; this.returnValue = value; return this.emit("close"); }
}

function createApp({ unsupported = false, storageBlocked = false, stored = null, recognitionSupport = false, loadedVoices = null } = {}) {
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[1]);
    element.id = match[3];
    for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
      element.setAttribute(attr[1], attr[2]);
      if (["min", "max", "step"].includes(attr[1])) element[attr[1]] = attr[2];
      if (attr[1] === "value") element.value = attr[2];
      if (attr[1] === "data-theme") element.dataset.theme = attr[2];
    }
    element.disabled = /\sdisabled(?:\s|$)/.test(match[2]);
    element.hidden = /\shidden(?:\s|$)/.test(match[2]);
    elements.set(element.id, element);
  }
  const empty = elements.get("saved-empty");
  ["h2", "p", "a"].forEach(tag => empty.append(new Element(tag)));
  const presetButtons = ["natural", "story", "study"].map(name => { const e = new Element("button"); e.dataset.preset = name; return e; });
  const sampleButtons = ["mindful", "story", "bangla"].map(name => { const e = new Element("button"); e.dataset.sample = name; return e; });
  const quickRates = ["0.8", "1", "1.5"].map(rate => { const e = new Element("button"); e.dataset.rate = rate; return e; });
  const closeButtons = ["guide-dialog", "voice-settings-dialog"].map(id => { const e = new Element("button"); e.dataset.close = id; return e; });
  const meta = new Element("meta");
  const document = new Element("document");
  document.documentElement = new Element("html");
  document.body = new Element("body");
  document.getElementById = id => { assert.ok(elements.has(id), `Missing app element ${id}`); return elements.get(id); };
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  document.createTextNode = text => { const e = new Element("#text"); e.textContent = text; return e; };
  document.querySelector = selector => selector.startsWith("meta") ? meta : null;
  document.querySelectorAll = selector => ({ "[data-preset]": presetButtons, "[data-rate]": quickRates, "[data-sample]": sampleButtons, "[data-close]": closeButtons, ".play-shortcut": [] })[selector] || [];
  const values = new Map(stored ? [["speechbot-studio:v2", stored]] : []);
  const timers = new Map();
  let timerId = 0;
  const utterances = [];
  const recognitionInstances = [];
  const synth = {
    voices: loadedVoices || [{ voiceURI: "voice-us", name: "Test English", lang: "en-US", default: true, localService: true }],
    getVoices() { return this.voices; },
    addEventListener(name, callback) { this.onvoiceschanged = callback; },
    cancel() {}, pause() {}, resume() {}, speak(utterance) { utterances.push(utterance); },
  };
  const window = new Element("window");
  Object.assign(window, {
    SpeechCore: C, speechSynthesis: unsupported ? undefined : synth,
    SpeechSynthesisUtterance: unsupported ? undefined : class { constructor(text) { this.text = text; } },
    localStorage: { getItem(key) { if (storageBlocked) throw new Error("Blocked"); return values.get(key) || null; }, setItem(key, value) { if (storageBlocked) throw new Error("Blocked"); values.set(key, value); } },
    isSecureContext: true,
    crypto: { randomUUID: () => `script-${values.size}-${timerId++}` },
    matchMedia: () => ({ matches: false }),
    confirm: () => true,
  });
  if (recognitionSupport) window.SpeechRecognition = class {
    constructor() { recognitionInstances.push(this); }
    start() {}
    stop() {}
    abort() {}
  };
  const navigator = { platform: "Linux", clipboard: { writeText: async () => {} } };
  const context = vm.createContext({ window, document, navigator, location: { hash: "#studio" }, Intl, Option: function (text, value) { const e = new Element("option"); e.textContent = text; e.value = value; return e; }, Blob, URL, Date, Math, setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id), setInterval() {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "script.js"), "utf8"), context, { filename: "script.js" });
  const $ = id => elements.get(id);
  return { $, context, window, document, values, utterances, synth, presetButtons, quickRates, sampleButtons, closeButtons, recognitionInstances, flushTimers: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } }, saved: () => JSON.parse(values.get("speechbot-studio:v2")) };
}

async function enter(app, text, title = "") {
  app.$("speech-text").value = text;
  await app.$("speech-text").emit("input");
  app.$("script-title").value = title;
  await app.$("script-title").emit("input");
}

test("controller initializes empty, disabled playback and intact editing without speech support", async () => {
  const app = createApp({ unsupported: true });
  assert.equal(app.$("speak-button").disabled, true);
  assert.equal(app.$("preview-button").disabled, true);
  await enter(app, "Hello world", "A draft");
  assert.equal(app.$("speak-button").disabled, true);
  assert.equal(app.$("save-button").disabled, false);
  await app.$("save-button").click();
  assert.equal(app.saved().scripts[0].text, "Hello world");
});

test("drafts, settings, theme, and scripts persist and restore; saving updates the same script", async () => {
  const app = createApp();
  await enter(app, "Words worth keeping.", "Keep me");
  app.$("rate-range").value = "1.4";
  await app.$("rate-range").emit("input");
  await app.$("theme-button").click();
  await app.$("save-button").click();
  const id = app.saved().scripts[0].id;
  await enter(app, "Updated words.", "Keep me");
  await app.$("save-button").click();
  assert.equal(app.saved().scripts.length, 1);
  assert.equal(app.saved().scripts[0].id, id);
  assert.equal(app.saved().scripts[0].text, "Updated words.");
  assert.equal(app.saved().scripts[0].settings.rate, 1.4);
  const next = createApp({ stored: JSON.stringify(app.saved()) });
  assert.equal(next.$("speech-text").value, "Updated words.");
  assert.equal(next.$("script-title").value, "Keep me");
  assert.equal(next.$("rate-range").value, "1.4");
  assert.equal(next.window.SpeechCore, C);
  assert.match(next.$("theme-button").getAttribute("aria-label"), /dark/);
});

test("storage denial shows session-only state while saving and editing continue", async () => {
  const app = createApp({ storageBlocked: true });
  await enter(app, "Keep a separate copy.");
  await app.$("save-button").click();
  assert.equal(app.$("storage-warning").hidden, false);
  assert.match(app.$("autosave-status").textContent, /Session only/);
  assert.equal(app.$("nav-count").textContent, "1");
  assert.match(app.$("toast-text").textContent, /session/);
});

test("play, pause, resume, stop, and voice preview keep controls in sync", async () => {
  const app = createApp();
  await enter(app, "A listening test.");
  await app.$("speak-button").click();
  const utterance = app.utterances[0];
  assert.equal(app.$("speech-text").readOnly, true);
  utterance.onstart();
  assert.match(app.$("speak-button").textContent, /Pause/);
  await app.$("speak-button").click();
  assert.equal(app.$("player-state").textContent, "Paused");
  await app.$("speak-button").click();
  assert.match(app.$("player-state").textContent, /reading/);
  await app.$("stop-button").click();
  assert.equal(app.$("speech-text").readOnly, false);
  assert.equal(app.$("stop-button").disabled, true);
  await app.$("preview-button").click();
  assert.match(app.$("preview-button").textContent, /Stop preview/);
  app.utterances.at(-1).onstart();
  app.utterances.at(-1).onend();
  assert.match(app.$("preview-button").textContent, /Preview voice/);
});

test("missing Bangla voices are explicit; a later voiceschanged event enables real playback", async () => {
  const app = createApp();
  await app.sampleButtons[2].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.$("speech-text").value, /প্রতিটি/);
  assert.equal(app.$("speak-button").disabled, true);
  assert.match(app.$("voice-hint").textContent, /No matching voice/);
  app.synth.voices.push({ voiceURI: "bn-bd", name: "Test Bangla", lang: "bn-BD", localService: true });
  app.synth.onvoiceschanged();
  assert.equal(app.$("speak-button").disabled, false);
  await app.$("speak-button").click();
  assert.equal(app.utterances[0].lang, "bn-BD");
});

test("unsafe title/text remains plain text in saved cards and reading view", async () => {
  const app = createApp();
  await enter(app, '<img src=x onerror="alert(1)">', "<script>alert(1)</script>");
  await app.$("save-button").click();
  const card = app.$("saved-grid").children[0];
  assert.equal(card.querySelector("h2").textContent, "<script>alert(1)</script>");
  assert.equal(card.querySelector("h2").children.length, 0);
  await app.$("reading-toggle").click();
  assert.match(app.$("reading-text").textContent, /<img/);
  assert.equal(app.$("reading-text").children.length, 0);
});

test("import rejects oversize files without replacing the current draft", async () => {
  const app = createApp();
  await enter(app, "Existing draft.");
  app.$("file-input").files = [{ name: "long.txt", size: 13000, text: async () => "a".repeat(13000) }];
  await app.$("file-input").emit("change");
  assert.equal(app.$("speech-text").value, "Existing draft.");
  assert.match(app.$("support-message").textContent, /exceeds 12,000/);
});

test("dictation appends final results only once and ignores callbacks after cancel", async () => {
  const app = createApp({ recognitionSupport: true });
  await enter(app, "Hello");
  await app.$("mic-button").click();
  const recognition = app.recognitionInstances[0];
  recognition.onstart();
  const result = [{ transcript: "world" }];
  result.isFinal = true;
  recognition.onresult({ resultIndex: 0, results: [result] });
  recognition.onresult({ resultIndex: 0, results: [result] });
  assert.equal(app.$("speech-text").value, "Hello world");
  await app.$("stop-button").click();
  recognition.onresult({ resultIndex: 1, results: [result, result] });
  assert.equal(app.$("speech-text").value, "Hello world");
  assert.equal(app.$("speech-text").readOnly, false);
});

test("valid UTF-8 import normalizes text and persists its filename as the title", async () => {
  const app = createApp();
  app.$("file-input").files = [{ name: "বাংলা নোট.txt", size: 100, text: async () => "\uFEFFআমার লেখা\r\nA new line." }];
  await app.$("file-input").emit("change");
  assert.equal(app.$("speech-text").value, "আমার লেখা\nA new line.");
  assert.equal(app.$("script-title").value, "বাংলা নোট");
  assert.equal(app.saved().draft.text, "আমার লেখা\nA new line.");
});

test("draft replacement preserves unsaved text on cancel and clears only after confirmation", async () => {
  const app = createApp();
  await enter(app, "Do not lose this draft.", "My words");
  const cancel = app.$("new-script").click();
  assert.equal(app.$("confirm-dialog").open, true);
  await app.$("confirm-dialog").close("cancel");
  await cancel;
  assert.equal(app.$("speech-text").value, "Do not lose this draft.");
  const confirm = app.$("new-script").click();
  await app.$("confirm-dialog").close("confirm");
  await confirm;
  assert.equal(app.$("speech-text").value, "");
  assert.equal(app.$("script-title").value, "");
  assert.equal(app.saved().draft.text, "");
});

test("removing a saved script requires confirmation and retains the current editor text", async () => {
  const app = createApp();
  await enter(app, "A saved note.", "A note");
  await app.$("save-button").click();
  const card = app.$("saved-grid").children[0];
  const actions = card.children.at(-1);
  const remove = actions.children.at(-1).children.at(-1);
  const pending = remove.click();
  assert.equal(app.$("confirm-dialog").open, true);
  await app.$("confirm-dialog").close("confirm");
  await pending;
  assert.equal(app.saved().scripts.length, 0);
  assert.equal(app.saved().draft.id, null);
  assert.equal(app.$("speech-text").value, "A saved note.");
});

test("recognition permission errors remain visible when recognition ends", async () => {
  const app = createApp({ recognitionSupport: true });
  await app.$("mic-button").click();
  const recognition = app.recognitionInstances[0];
  recognition.onerror({ error: "not-allowed" });
  recognition.onend();
  assert.match(app.$("support-message").textContent, /access was blocked/);
  assert.equal(app.$("speech-text").readOnly, false);
  assert.equal(app.$("mic-button").getAttribute("aria-pressed"), "false");
});

test("compact quick speeds update full controls, selected state, estimates and persisted preferences", async () => {
  const app = createApp();
  await enter(app, Array(150).fill("word").join(" "));
  await app.quickRates[2].click();
  app.flushTimers();
  assert.equal(app.$("rate-range").value, "1.5");
  assert.equal(app.$("rate-output").textContent, "1.5×");
  assert.equal(app.quickRates[2].getAttribute("aria-pressed"), "true");
  assert.equal(app.quickRates[1].getAttribute("aria-pressed"), "false");
  assert.equal(app.$("time-estimate").textContent, "~00:40");
  assert.equal(app.saved().settings.rate, 1.5);
});

test("extra controls open only on request and close independently from the compact screen", async () => {
  const app = createApp();
  assert.ok(!app.$("voice-settings-dialog").open);
  await app.$("advanced-button").click();
  assert.equal(app.$("voice-settings-dialog").open, true);
  await app.closeButtons[1].click();
  assert.equal(app.$("voice-settings-dialog").open, false);
  assert.equal(app.$("studio-view").hidden, false);
});
