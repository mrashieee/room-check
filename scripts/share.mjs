/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Tunnel, bin, install } from "cloudflared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);
const localUrl = `http://localhost:${port}`;
const startedAt = Date.now();

let tunnel = null;
let server = null;
let shuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function elapsed() {
  const total = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return minutes ? `${minutes}m ${seconds}s` : `${total}s`;
}

function log(message = "") {
  console.log(`[${timestamp()} +${elapsed()}] ${message}`);
}

function warn(message = "") {
  console.warn(`[${timestamp()} +${elapsed()}] ${message}`);
}

function logError(message = "") {
  console.error(`[${timestamp()} +${elapsed()}] ${message}`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (tunnel) {
    try {
      tunnel.stop();
    } catch {
      // Already stopped.
    }
  }
  if (server && !server.killed) {
    server.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 1200).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function ensureCloudflared() {
  if (fs.existsSync(bin)) return;
  console.log("");
  log("Downloading the Cloudflare tunnel helper (one time only)…");
  await install(bin);
  if (!fs.existsSync(bin)) {
    throw new Error("Cloudflare tunnel helper did not install.");
  }
  log("Cloudflare tunnel helper downloaded.");
}

function waitForTunnel(tunnelProcess) {
  return new Promise((resolve, reject) => {
    let url = null;
    let connected = false;

    const cleanup = () => {
      clearTimeout(timeout);
      tunnelProcess.off("url", onUrl);
      tunnelProcess.off("connected", onConnected);
      tunnelProcess.off("error", onError);
      tunnelProcess.off("exit", onExit);
    };

    const finishIfReady = () => {
      if (!url || !connected) return;
      cleanup();
      resolve(url);
    };

    const fail = (error) => {
      cleanup();
      reject(error);
    };

    const onUrl = (value) => {
      url = value;
      log(`Public URL received: ${value}`);
      finishIfReady();
    };

    const onConnected = () => {
      connected = true;
      log("Tunnel connected to Cloudflare.");
      finishIfReady();
    };

    const onError = (error) => fail(error);

    const onExit = (code) => {
      if (shuttingDown) return;
      fail(new Error(`Cloudflare tunnel exited early (code ${code ?? "unknown"}).`));
    };

    const timeout = setTimeout(() => {
      fail(new Error("The Cloudflare tunnel did not connect in time."));
    }, 60_000);

    tunnelProcess.on("url", onUrl);
    tunnelProcess.on("connected", onConnected);
    tunnelProcess.on("error", onError);
    tunnelProcess.on("exit", onExit);
  });
}

async function publicLinkHealthy(url) {
  try {
    const response = await fetch(url + "/healthz", {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "room-check-startup-check" },
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

async function verifyPublicLink(url) {
  console.log("");
  log("Waiting for the public link to propagate…");
  const deadline = Date.now() + 120_000;
  let successes = 0;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    if (await publicLinkHealthy(url)) {
      successes += 1;
      log(`Health check ${attempt}: ok (${successes}/3).`);
      if (successes >= 3) return true;
    } else {
      successes = 0;
      log(`Health check ${attempt}: not ready yet.`);
    }
    await delay(2000);
  }
  return false;
}

async function main() {
  let url;
  try {
    await ensureCloudflared();

    console.log("");
    log("Opening a temporary public link…");
    log("This can take a few seconds.");

    tunnel = Tunnel.quick(localUrl, { "--no-autoupdate": true });
    url = await waitForTunnel(tunnel);
  } catch (error) {
    console.error("");
    logError("Could not open a public link.");
    logError(error.message);
    console.error("");
    logError("You can still use Room Check on the same Wi-Fi with: npm start");
    logError("Or set PUBLIC_URL to a URL you already have.");
    console.error("");
    shutdown(1);
    return;
  }

  log(`Tunnel ready. Starting Room Check on ${localUrl}…`);

  server = spawn(process.execPath, ["--env-file-if-exists=.env", "server.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PUBLIC_URL: url,
    },
  });

  server.on("exit", (code) => {
    if (!shuttingDown) {
      log("Room Check stopped.");
    }
    shutdown(code ?? 0);
  });

  server.on("error", (error) => {
    logError(`Could not start Room Check: ${error.message}`);
    shutdown(1);
  });

  tunnel.on("exit", (code) => {
    if (shuttingDown) return;
    logError("The public tunnel closed unexpectedly. Stop and run npm run share again.");
    if (server && !server.killed) server.kill("SIGTERM");
    shutdown(1);
  });

  const verified = await verifyPublicLink(url);
  if (shuttingDown) return;

  if (verified) {
    log("Public link verified and ready:");
    console.log("  " + url);
    log("Keep this terminal open for the whole event.");
  } else {
    warn("The public link is taking longer than expected to come online.");
    warn("It may become available shortly:");
    console.log("  " + url);
    warn("If it does not work, restart with: npm run share");
  }
}

main();
