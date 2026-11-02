/*
 * Room Check data backup
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, ".data");

if (!fs.existsSync(dataDir)) {
  console.error(`No data directory found at ${dataDir}.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(path.dirname(dataDir), `.data-backup-${stamp}`);

fs.cpSync(dataDir, destination, { recursive: true, force: false, errorOnExist: true });
console.log(`Backed up ${dataDir} to ${destination}`);

const keepValue = Number(process.env.BACKUP_KEEP || 10);
const keep = Number.isFinite(keepValue) ? Math.max(1, keepValue) : 10;
const parent = path.dirname(dataDir);
const backups = fs
  .readdirSync(parent)
  .filter((name) => name.startsWith(".data-backup-"))
  .map((name) => path.join(parent, name))
  .filter((entry) => fs.statSync(entry).isDirectory())
  .sort()
  .reverse();
for (const old of backups.slice(keep)) {
  fs.rmSync(old, { recursive: true, force: true });
  console.log(`Removed old backup ${old}`);
}
console.log(`Keeping the newest ${keep} backup${keep === 1 ? "" : "s"}.`);
