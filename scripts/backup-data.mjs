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
