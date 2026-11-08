/*
 * Room Check version consistency check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 *
 * Fails if package.json, the README badge and the CHANGELOG header disagree.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const failures = [];

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
if (!readme.includes(`Version ${version}`) || !readme.includes(`version-${version}`)) {
  failures.push(`README.md badge does not match package.json version ${version}.`);
}

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${version}`)) {
  failures.push(`CHANGELOG.md has no "## ${version}" section.`);
}

for (const name of fs.readdirSync(path.join(root, "public"))) {
  if (!/\.(html|css)$/.test(name)) continue;
  const text = fs.readFileSync(path.join(root, "public", name), "utf8");
  for (const match of text.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)) {
    if (match[1] !== version) {
      failures.push(`public/${name} references v${match[1]}, expected v${version}.`);
    }
  }
}

const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
if (!server.includes("PACKAGE_JSON")) {
  failures.push("server.mjs no longer reads its version from package.json.");
}

if (failures.length) {
  for (const failure of failures) console.error(`version-check: ${failure}`);
  process.exit(1);
}
console.log(`version-check: consistent at ${version}.`);
