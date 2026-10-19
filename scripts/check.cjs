"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
let failures = 0;
function check(condition, description) {
  if (!condition) { console.error(`FAIL: ${description}`); failures += 1; }
}
for (const file of ["speech-core.js", "script.js", "scripts/serve.cjs", "scripts/build-static.cjs", "scripts/check.cjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  check(result.status === 0, `${file} parses: ${result.stderr}`);
}
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
check(new Set(ids).size === ids.length, "HTML IDs are unique");
for (const match of script.matchAll(/\$\("([^"]+)"\)/g)) check(ids.includes(match[1]), `Controller element #${match[1]} exists`);
for (const match of html.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g)) {
  for (const id of match[1].split(/\s+/)) check(ids.includes(id), `Accessible reference #${id} exists`);
}
for (const match of html.matchAll(/href="#([^"]+)"/g)) check(["studio", "saved"].includes(match[1]) || ids.includes(match[1]), `Local link #${match[1]} resolves`);
for (const file of ["style.css", "speech-core.js", "script.js", "assets/favicon.svg", "assets/bot.css"]) check(fs.existsSync(path.join(root, file)), `Public asset ${file} exists`);
check(!/<(?:script|link)[^>]+(?:src|href)="https?:\/\//i.test(html), "The app has no CDN script or stylesheet dependency");
check(html.includes('name="viewport"') && html.includes('lang="en"'), "Viewport and page language are set");
if (failures) process.exitCode = 1;
else console.log("Checks passed: JavaScript syntax, assets, navigation, unique IDs, accessible references, and no CDN dependencies.");
