"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
fs.mkdirSync(output, { recursive: true });
for (const name of ["index.html", "style.css", "script.js", "speech-core.js"]) fs.copyFileSync(path.join(root, name), path.join(output, name));
fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });
console.log("Static SpeechBot assets are ready in dist/.");
