"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePort, createHandler } = require("../scripts/serve.cjs");

test("default port is isolated and GitStack ports are explicitly rejected", () => {
  assert.equal(parsePort(), 5185);
  assert.equal(parsePort("5186"), 5186);
  for (const value of ["3000", "3002", "0", "80", "65536", "123abc", "5.5", "-1"]) assert.throws(() => parsePort(value));
});

async function request(url, method = "GET", reader) {
  let status, headers, body;
  const response = { writeHead(code, values = {}) { status = code; headers = values; }, end(value) { body = value; } };
  await createHandler(reader)({ url, method }, response);
  return { status, headers, body };
}

test("public files have correct types; HEAD returns headers without a body", async () => {
  const get = await request("/");
  assert.equal(get.status, 200);
  assert.match(get.headers["Content-Type"], /text\/html/);
  assert.match(get.body.toString(), /SpeechBot — Your speak assistant/);
  const head = await request("/speech-core.js", "HEAD");
  assert.equal(head.status, 200);
  assert.ok(head.headers["Content-Length"] > 0);
  assert.equal(head.body, undefined);
  assert.equal((await request("/assets/favicon.svg")).headers["Content-Type"], "image/svg+xml");
  assert.match((await request("/assets/bot.css")).headers["Content-Type"], /text\/css/);
});

test("server prevents arbitrary project file reads, encoded traversal and unsupported methods", async () => {
  for (const url of ["/.env", "/package.json", "/scripts/serve.cjs", "/tests/core.test.cjs", "/%2e%2e%2fpackage.json", "/unknown"]) assert.equal((await request(url)).status, 404);
  assert.equal((await request("/%ZZ")).status, 400);
  assert.equal((await request("/", "POST")).status, 405);
  assert.equal((await request("/", "DELETE")).headers.Allow, "GET, HEAD");
});

test("file errors produce a controlled response", async () => {
  const result = await request("/", "GET", () => { throw new Error("Cannot read"); });
  assert.equal(result.status, 500);
});
