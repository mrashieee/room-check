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

if (fs.existsSync(authFile)) {
  fs.rmSync(authFile, { force: true });
  console.log("");
  console.log("Host password cleared.");
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
