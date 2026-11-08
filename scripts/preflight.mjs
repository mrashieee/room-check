/*
 * Room Check preflight check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 *
 * Verifies the machine is ready for an event: Node version, port free,
 * writable data dir, disk space, QR generation and a recent backup.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, ".data");
const failures = [];
const warnings = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}

function warn(name, message) {
  warnings.push(name);
  console.warn(`  warn ${name}: ${message}`);
}

const [major, minor] = process.versions.node.split(".").map(Number);
await check("node >= 22.9", () => {
  if (!(major > 22 || (major === 22 && minor >= 9))) {
    throw new Error(`found ${process.versions.node}`);
  }
});

await check(`port ${port} free`, () => {
  let output = "";
  try {
    output = execFileSync("ss", ["-ltn"], { encoding: "utf8" });
  } catch {
    return; // ss unavailable; skip.
  }
  if (new RegExp(`:${port}\\b`).test(output)) {
    throw new Error("something is already listening (stop it or set PORT)");
  }
});

await check(`data dir writable (${dataDir})`, () => {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.accessSync(dataDir, fs.constants.W_OK);
});

await check("disk space", () => {
  let output = "";
  try {
    output = execFileSync("df", ["-k", root], { encoding: "utf8" });
  } catch {
    return; // df unavailable; skip.
  }
  const line = output.trim().split("\n").pop();
  const availableKb = Number(line.split(/\s+/)[3]);
  if (Number.isFinite(availableKb) && availableKb < 2048 * 1024) {
    throw new Error(
      `only ${Math.round(availableKb / 1024)} MB free; allow room for an 80-slide deck (up to 2 GB)`,
    );
  }
});

await check("qr generation", async () => {
  const { default: QRCode } = await import("qrcode");
  const png = await QRCode.toBuffer("https://example.test/join", { width: 160 });
  if (!png?.length) throw new Error("empty QR output");
});

await check("pdf parser present", () => {
  fs.accessSync(path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.mjs"));
  fs.accessSync(path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs"));
});

try {
  const parent = path.dirname(path.resolve(dataDir));
  const backups = fs
    .readdirSync(parent)
    .filter((name) => name.startsWith(".data-backup-"))
    .sort();
  if (!backups.length) {
    warn("backup", "no backups found; run npm run backup-data");
  } else {
    console.log(`  ok   backup (${backups.length} found, newest ${backups[backups.length - 1]})`);
  }
} catch {
  warn("backup", "could not list backup directory");
}

if (failures.length) {
  console.error(`\npreflight: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\npreflight: ready${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
