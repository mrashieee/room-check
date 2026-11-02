/*
 * Room Check release check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 *
 * Pre-tag gate: clean tree, no private files staged, version consistent,
 * syntax checks pass. Run before tagging a release.
 */

import { execFileSync } from "node:child_process";

function run(command) {
  return execFileSync(command, { shell: true, encoding: "utf8" }).trim();
}

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL ${name}: ${error.message.split("\n")[0]}`);
  }
}

check("working tree clean", () => {
  if (run("git status --porcelain")) throw new Error("uncommitted changes present");
});

check("no private files tracked", () => {
  const files = run("git ls-files").split("\n");
  const bad = files.filter((file) => /^\.data|^\.local|^\.env$|\.data-backup-|^\/tmp\//.test(file));
  if (bad.length) throw new Error(`would ship private files: ${bad.slice(0, 5).join(", ")}`);
});

check("version consistent", () => {
  run("node scripts/version-check.mjs");
});

check("syntax checks pass", () => {
  run("npm run check --silent");
});

if (failures.length) {
  console.error(`\nrelease-check: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nrelease-check: ready to tag.");
