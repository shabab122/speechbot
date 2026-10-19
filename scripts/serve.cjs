"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/speech-core.js", ["speech-core.js", "text/javascript; charset=utf-8"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/assets/bot.css", ["assets/bot.css", "text/css; charset=utf-8"]],
]);

function parsePort(value = "5185") {
  if (!/^\d+$/.test(String(value))) throw new Error("PORT must be a number between 1024 and 65535.");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be between 1024 and 65535.");
  if ([3000, 3002].includes(port)) throw new Error("Ports 3000 and 3002 are reserved for GitStack. Choose a different SpeechBot port.");
  return port;
}

function createHandler(readFile = fs.readFile) {
  return async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
    catch { response.writeHead(400); response.end("Invalid URL"); return; }
    const entry = PUBLIC_FILES.get(pathname);
    if (!entry) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
    try {
      const data = await readFile(path.join(ROOT, entry[0]));
      response.writeHead(200, { "Content-Type": entry[1], "Content-Length": data.length, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : data);
    } catch { response.writeHead(500); response.end("Unable to read the requested app file."); }
  };
}

function main() {
  let port;
  try { port = parsePort(process.env.PORT || "5185"); }
  catch (error) { console.error(error.message); process.exitCode = 1; return; }
  const server = http.createServer(createHandler());
  server.on("error", error => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use. Try PORT=5186 npm start. SpeechBot does not stop other apps or switch ports automatically.` : `Could not start SpeechBot: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`\nSpeechBot — local development\nOpen http://127.0.0.1:${port}\nPress Ctrl+C to stop.\n`));
}

if (require.main === module) main();
module.exports = { parsePort, createHandler };
