"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../speech-core.js");

function harness() {
  let clock = 0;
  const utterances = [];
  const calls = [];
  const states = [];
  const boundaries = [];
  const errors = [];
  const finishes = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = {
    speak(utterance) { calls.push("speak"); utterances.push(utterance); },
    cancel() { calls.push("cancel"); },
    resume() { calls.push("resume"); },
    pause() { calls.push("pause"); },
  };
  const player = new C.SpeechPlayer(synth, Utterance, { onState: state => states.push(state), onBoundary: (...args) => boundaries.push(args), onError: error => errors.push(error), onFinish: context => finishes.push(context) }, () => clock);
  return { player, synth, utterances, calls, states, boundaries, errors, finishes, advance: ms => { clock += ms; } };
}

test("text normalization preserves Bangla and emoji while removing BOM, NUL and Windows line endings", () => {
  assert.equal(C.normalizeText("\uFEFFবাংলা\r\nhello\r🌿\u0000"), "বাংলা\nhello\n🌿");
});

test("word counts and duration handle empty, multilingual and punctuation-only text", () => {
  assert.equal(C.wordCount("  \n"), 0);
  assert.equal(C.wordCount("Hello, world!"), 2);
  assert.ok(C.wordCount("প্রতিটি নতুন দিন একটি নতুন সুযোগ।") >= 5);
  assert.ok(C.wordCount("你好世界") > 0);
  assert.equal(C.estimateSeconds(""), 0);
  assert.equal(C.estimateSeconds(Array(150).fill("word").join(" "), 1), 60);
  assert.equal(C.estimateSeconds(Array(150).fill("word").join(" "), 2), 30);
  assert.equal(C.formatTime(125.8), "02:05");
  assert.equal(C.formatTime(-10), "00:00");
});

test("chunks preserve every character, original offsets, bounded size, and complete emoji", () => {
  for (const text of ["Hello world. ".repeat(120), "শব্দ এবং বাক্য। ".repeat(90), "🌿🌈🙂".repeat(400), "x".repeat(12000), " \n ".repeat(600), "A short thought."]) {
    const chunks = C.splitText(text, 81);
    assert.equal(chunks.map(chunk => chunk.text).join(""), text);
    let position = 0;
    for (const chunk of chunks) {
      assert.ok(chunk.text.length > 0 && chunk.text.length <= 81);
      assert.equal(chunk.start, position);
      assert.ok(!/[\uD800-\uDBFF]$/u.test(chunk.text));
      assert.ok(!/^[\uDC00-\uDFFF]/u.test(chunk.text));
      position += chunk.text.length;
    }
  }
  assert.throws(() => C.splitText("Hello", 1), RangeError);
});

test("workspace recovers from malformed, future-version, and null storage", () => {
  for (const raw of [null, "", "{bad", "null", "4", '{"version":99}', '[]']) {
    const result = C.readWorkspace(raw);
    assert.equal(result.version, 2);
    assert.deepEqual(result.scripts, []);
    assert.equal(result.draft.text, "");
  }
});

test("workspace validates limits and settings, rejects invalid/duplicate entries", () => {
  const raw = JSON.stringify({ version: 2, draft: { title: "t".repeat(100), text: "a".repeat(13000), id: false }, theme: "unexpected", settings: { rate: 20, volume: -1, pitch: "bad", dictationLanguage: "<script>" }, scripts: [{ id: "1", title: "Original", text: "Hello", settings: { rate: 0.7 }, updatedAt: 100 }, { id: "1", text: "Duplicate" }, { id: "2", text: "   " }, null] });
  const result = C.readWorkspace(raw);
  assert.equal(result.draft.title.length, 80);
  assert.equal(result.draft.text.length, 12000);
  assert.equal(result.draft.id, null);
  assert.equal(result.settings.rate, 2);
  assert.equal(result.settings.volume, 0);
  assert.equal(result.settings.pitch, 1);
  assert.equal(result.settings.dictationLanguage, "en-US");
  assert.equal(result.theme, null);
  assert.equal(result.scripts.length, 1);
  assert.equal(result.scripts[0].title, "Original");
  assert.equal(result.scripts[0].settings.rate, 0.7);
  assert.equal(C.readWorkspace(JSON.stringify({ version: 2, scripts: Array.from({ length: 30 }, (_, i) => ({ id: String(i), text: "Hello" })) })).scripts.length, 20);
});

test("text filenames retain Unicode but remove path and invalid filename characters", () => {
  assert.equal(C.safeFilename("বাংলা / গল্প: ১?"), "বাংলা গল্প ১.txt");
  assert.equal(C.safeFilename("..."), "Untitled script.txt");
  assert.ok(!C.safeFilename("../test\\file").includes("/"));
});

test("playback receives the selected voice, language, rate, pitch and muted volume", () => {
  const h = harness();
  const voice = { lang: "bn-BD", name: "Bangla" };
  assert.equal(h.player.start("স্বাগতম", { voiceObject: voice, rate: 0.8, pitch: 1.1, volume: 0 }), true);
  const utterance = h.utterances[0];
  assert.equal(utterance.voice, voice);
  assert.equal(utterance.lang, "bn-BD");
  assert.equal(utterance.rate, 0.8);
  assert.equal(utterance.pitch, 1.1);
  assert.equal(utterance.volume, 0);
  utterance.onstart();
  assert.equal(h.player.state, "playing");
  utterance.onend();
  assert.equal(h.player.state, "finished");
  assert.deepEqual(h.finishes, ["script"]);
});

test("pause/resume excludes paused time from the elapsed timer", () => {
  const h = harness();
  h.player.start("A thought.");
  h.advance(2000);
  assert.equal(h.player.elapsed, 0, "Waiting for speech start is excluded");
  h.utterances[0].onstart();
  h.advance(3000);
  h.player.pause();
  h.advance(10000);
  assert.equal(h.player.elapsed, 3);
  h.player.resume();
  h.advance(2000);
  assert.equal(h.player.elapsed, 5);
  h.utterances[0].onend();
  h.advance(1000);
  assert.equal(h.player.elapsed, 5);
});

test("stop invalidates late callbacks, including errors and a pending restart", () => {
  const h = harness();
  h.player.start("First script");
  const old = h.utterances[0];
  h.player.stop();
  h.player.start("Replacement script");
  old.onstart(); old.onend(); old.onerror({ error: "network" }); old.onboundary({ charIndex: 3 });
  assert.equal(h.player.state, "starting");
  assert.equal(h.utterances.length, 2);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.boundaries, []);
  h.utterances[1].onstart();
  h.utterances[1].onend();
  assert.equal(h.player.state, "finished");
});

test("multi-chunk playback reaches the end once and preserves word offsets", () => {
  const h = harness();
  const text = "A complete sentence. ".repeat(150);
  h.player.start(text);
  let spoken = "";
  let index = 0;
  while (h.player.active) {
    const utterance = h.utterances[index++];
    assert.ok(utterance, "Next chunk is queued");
    utterance.onstart();
    const offset = spoken.length;
    utterance.onboundary({ charIndex: 2, charLength: 8 });
    assert.equal(h.boundaries.at(-1)[0], offset + 2);
    spoken += utterance.text;
    utterance.onend();
  }
  assert.equal(spoken, text);
  assert.deepEqual(h.finishes, ["script"]);
});

test("whitespace-only chunks cannot stall the reading queue", () => {
  const h = harness();
  h.player.start(`Hello.${" ".repeat(600)}World!`);
  while (h.player.active) {
    const utterance = h.utterances.at(-1);
    assert.ok(utterance.text.trim());
    utterance.onstart();
    utterance.onend();
  }
  assert.equal(h.player.state, "finished");
});

test("an end event received while paused waits to queue the next chunk until resume", () => {
  const h = harness();
  h.player.start("A whole sentence. ".repeat(40));
  h.utterances[0].onstart();
  h.player.pause();
  h.utterances[0].onend();
  assert.equal(h.player.state, "paused");
  assert.equal(h.utterances.length, 1);
  h.player.resume();
  assert.equal(h.utterances.length, 2);
});

test("errors terminate the queue and unsupported speech does not throw", () => {
  const h = harness();
  h.player.start("A whole sentence. ".repeat(40));
  h.utterances[0].onerror({ error: "voice-unavailable" });
  assert.equal(h.player.state, "idle");
  assert.equal(h.utterances.length, 1);
  assert.deepEqual(h.errors, ["voice-unavailable"]);
  assert.equal(new C.SpeechPlayer(null, null).start("Hello"), false);
  assert.equal(h.player.start("   "), false);
});

test("synchronous provider failures are handled and cannot leave a stuck active player", () => {
  const h = harness();
  h.synth.speak = () => { throw new Error("No service"); };
  h.player.start("Hello");
  assert.equal(h.player.state, "idle");
  assert.deepEqual(h.errors, ["synthesis-failed"]);
});
