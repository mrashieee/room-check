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

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

try {
  if (!fs.existsSync(dataDir)) {
    fail(`No data directory found at ${dataDir}.`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let destination = path.join(path.dirname(dataDir), `.data-backup-${stamp}`);
    if (fs.existsSync(destination)) {
      destination += `-${process.pid}`;
    }

    fs.cpSync(dataDir, destination, { recursive: true, force: false, errorOnExist: true });
    try {
      fs.chmodSync(destination, 0o700);
    } catch {
      // Some filesystems do not support chmod.
    }
    console.log(`Backed up ${dataDir} to ${destination}`);

    const parsed = Number.parseInt(process.env.BACKUP_KEEP || "10", 10);
    const keep = Number.isFinite(parsed) ? Math.max(1, parsed) : 10;
    const parent = path.dirname(dataDir);
    let backups = [];
    try {
      backups = fs
        .readdirSync(parent)
        .filter((name) => name.startsWith(".data-backup-"))
        .map((name) => path.join(parent, name))
        .filter((entry) => {
          try {
            return fs.statSync(entry).isDirectory();
          } catch {
            return false;
          }
        })
        .sort()
        .reverse();
    } catch (error) {
      fail(`Could not list backups in ${parent}: ${error.message}`);
      backups = null;
    }
    if (backups) {
      for (const old of backups.slice(keep)) {
        try {
          fs.rmSync(old, { recursive: true, force: true });
          console.log(`Removed old backup ${old}`);
        } catch (error) {
          console.error(`Could not remove old backup ${old}: ${error.message}`);
        }
      }
      console.log(`Keeping the newest ${keep} backup${keep === 1 ? "" : "s"}.`);
    }
  }
} catch (error) {
  fail(`Backup failed: ${error.message}`);
}
