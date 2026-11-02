/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", ".data");
const authFile = path.join(dataDir, "auth.json");
const secretFile = path.join(dataDir, "session-secret");

if (fs.existsSync(authFile)) {
  fs.rmSync(authFile, { force: true });
  try {
    fs.rmSync(secretFile, { force: true });
  } catch {
    // No secret file to remove.
  }
  console.log("");
  console.log("Host password and session secret cleared.");
  console.log("All host sessions are now invalid after a restart.");
  console.log("");
  console.log("Restart Room Check to get a new first-run setup code:");
  console.log("  npm start");
  console.log("");
} else {
  console.log("");
  console.log("No host password is configured at " + authFile);
  console.log("Start Room Check and use the first-run setup code from the terminal.");
  console.log("");
}
