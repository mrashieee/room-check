/*
 * Room Check unit tests (no browser required)
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 *
 * Fast HTTP-level tests against a temporary server instance:
 * backup rotation, tie-break secrecy, vote rate limiting, token
 * invalidation on close, strict input validation and logo caching.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const password = "unit-test-password-123";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(port, dataDir) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), UPDATE_CHECK: "off", PUBLIC_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let setupCode = "";
  const base = `http://127.0.0.1:${port}`;
  const append = (chunk) => {
    output += chunk.toString();
    const match = output.match(/FIRST-RUN SETUP CODE:\s*([A-Z0-9-]+)/);
    if (match) setupCode = match[1];
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (setupCode) {
      try {
        const response = await fetch(base + "/healthz");
        if (response.ok) return { child, base, setupCode };
      } catch {
        // Server is still starting.
      }
    }
    if (child.exitCode !== null) throw new Error(`Server exited early.\n${output}`);
    await wait(150);
  }
  throw new Error(`Server did not start.\n${output}`);
}

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    server.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function hostFetch(base, cookie, url, options = {}) {
  return fetch(base + url, {
    credentials: "omit",
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers || {}) },
  });
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "room-check-unit-"));
const port = await findFreePort();
const server = await startServer(port, dataDir);
const { base, setupCode } = server;
let cookie = "";

try {
  await test("backup rotation keeps newest N", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "room-check-backup-"));
    const dir = path.join(parent, "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "state.json"), "{}");
    for (let i = 1; i <= 4; i += 1) {
      fs.mkdirSync(path.join(parent, `.data-backup-0-seed-${i}`));
    }
    execFileSync(process.execPath, ["scripts/backup-data.mjs"], {
      cwd: root,
      env: { ...process.env, DATA_DIR: dir, BACKUP_KEEP: "3" },
      stdio: "pipe",
    });
    const backups = fs
      .readdirSync(parent)
      .filter((name) => name.startsWith(".data-backup-"));
    assert.ok(backups.length <= 3, `expected <=3 backups, got ${backups.length}`);
    const timestamped = backups.filter((name) => /^\.data-backup-\d/.test(name));
    assert.ok(timestamped.length >= 1, "expected at least one timestamped backup");
    const newest = timestamped.sort().pop();
    const mode = fs.statSync(path.join(parent, newest)).mode & 0o777;
    assert.equal(mode, 0o700, `backup dir mode ${mode.toString(8)}, expected 700`);
    fs.rmSync(parent, { recursive: true, force: true });
  });

  await test("host setup and login work", async () => {
    let response = await fetch(base + "/api/host/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupCode, password }),
    });
    assert.equal(response.status, 201, `setup failed: ${await response.text()}`);
    const setCookie = response.headers.get("set-cookie") || "";
    assert.match(setCookie, /roomcheck_host=/);
    cookie = setCookie.split(";")[0];

    response = await hostFetch(base, cookie, "/api/host/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (response.status !== 200) assert.fail(`login failed: ${await response.text()}`);
    const refreshed = (response.headers.get("set-cookie") || "").split(";")[0];
    if (refreshed) cookie = refreshed;

    response = await hostFetch(base, "roomcheck_host=stale", "/api/host/state");
    assert.equal(response.status, 401, "stale cookie should be rejected");
  });

  await test("strict duration validation rejects garbage", async () => {
    const response = await hostFetch(base, cookie, "/api/host/open", {
      method: "POST",
      body: JSON.stringify({ mode: "poll", question: "Q?", options: ["A", "B"], durationSec: "60abc" }),
    });
    assert.equal(response.status, 400, `expected 400, got ${response.status}`);
  });

  await test("tie-break winner hidden until done", async () => {
    let response = await hostFetch(base, cookie, "/api/host/open", {
      method: "POST",
      body: JSON.stringify({
        mode: "poll",
        question: "Tied?",
        options: ["A", "B"],
        durationSec: 0,
        spinOnTie: true,
      }),
    });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    const { roundId } = await response.json();
    for (const [player, option] of [["player-a-12345678", "o1"], ["player-b-12345678", "o2"]]) {
      response = await fetch(base + "/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player, optionId: option }),
      });
      if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    }
    response = await hostFetch(base, cookie, "/api/host/reveal", { method: "POST", body: "{}" });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    response = await hostFetch(base, cookie, "/api/host/tiebreak/spin", { method: "POST", body: "{}" });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    const spin = await response.json();
    assert.ok(spin.endsAt, "spin response should include endsAt");

    response = await fetch(base + "/api/state");
    const publicState = (await response.json()).state;
    assert.equal(publicState.round.tieBreak.status, "spinning");
    assert.equal(publicState.round.tieBreak.winnerOptionId, null, "public state must hide the winner while spinning");
  });

  await test("vote rate limit trips after a burst", async () => {
    let response = await hostFetch(base, cookie, "/api/host/open", {
      method: "POST",
      body: JSON.stringify({ mode: "poll", question: "Burst?", options: ["A", "B"], durationSec: 0 }),
    });
    if (response.status !== 200) assert.fail(`open failed: ${await response.text()}`);
    let limited = false;
    for (let i = 0; i < 80; i += 1) {
      response = await fetch(base + "/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "rate-limit-probe-123456", optionId: "o1" }),
      });
      if (response.status === 429) {
        limited = true;
        break;
      }
      if (response.status !== 200) assert.fail(`unexpected vote status ${response.status}: ${await response.text()}`);
    }
    assert.ok(limited, "expected a 429 after a burst of votes");
  });

  await test("logo responses are not immutably cached", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    let response = await hostFetch(base, cookie, "/api/host/theme/logo", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    response = await fetch(base + "/api/theme/logo");
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });

  await test("closed presentation invalidates the controller token", async () => {
    let response = await hostFetch(base, cookie, "/api/host/presentation/create", {
      method: "POST",
      body: JSON.stringify({ title: "Unit deck" }),
    });
    if (response.status !== 201) assert.fail(`create failed: ${await response.text()}`);
    response = await hostFetch(base, cookie, "/api/host/presentation/state");
    const before = await response.json();
    const token = before.token;
    assert.ok(token, "expected a controller token");
    response = await hostFetch(base, cookie, "/api/host/presentation/start", {
      method: "POST",
      body: "{}",
    });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    response = await hostFetch(base, cookie, "/api/host/presentation/close", {
      method: "POST",
      body: "{}",
    });
    if (response.status !== 200) assert.fail(`expected 200, got ${response.status}: ${await response.text()}`);
    response = await fetch(base + `/api/controller/state?token=${encodeURIComponent(token)}`);
    assert.equal(response.status, 401, "closed presentation token should be rejected");
  });

  await test("reopening keeps slides and the controller token", async () => {
    let response = await hostFetch(base, cookie, "/api/host/presentation/reopen", {
      method: "POST",
      body: "{}",
    });
    if (response.status !== 200) assert.fail(`reopen failed: ${await response.text()}`);
    const reopened = await response.json();
    assert.equal(reopened.presentation.status, "ready");
    assert.ok(reopened.token && reopened.token.length >= 24, "expected the token to survive reopen");

    response = await fetch(base + `/api/controller/state?token=${encodeURIComponent(reopened.token)}`);
    if (response.status !== 200) assert.fail(`controller state failed: ${await response.text()}`);
  });

  console.log(`\nunit: ${passed} passed.`);
} finally {
  await stopServer(server);
  fs.rmSync(dataDir, { recursive: true, force: true });
}
