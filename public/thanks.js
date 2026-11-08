/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { loadTheme } from "./theme.js";

const githubUrl = "https://github.com/mrashieee/room-check";
const qr = document.querySelector("#thanks-qr");
const startButton = document.querySelector("#thanks-start");
const audienceThanks = location.pathname === "/thanks";
let standbyTimer = null;
let watchBusy = false;
let lastStateRev = 0;
if (qr) qr.src = `/api/qr?data=${encodeURIComponent(githubUrl)}`;

async function watchForStandby() {
  if (!audienceThanks || watchBusy) return;
  watchBusy = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("/api/state", {
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) return;
    const payload = await response.json();
    const incomingRev = Number(payload?.rev) || 0;
    if (incomingRev && incomingRev < lastStateRev) return;
    if (incomingRev) lastStateRev = incomingRev;
    if (payload?.state?.closed === false) {
      clearInterval(standbyTimer);
      standbyTimer = null;
      location.replace("/join");
    }
  } catch {
    // Keep the thanks page visible if the network blips.
  } finally {
    clearTimeout(timer);
    watchBusy = false;
  }
}

startButton?.addEventListener("click", async () => {
  startButton.disabled = true;
  try {
    const response = await fetch("/api/host/reset", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (response.status === 401) {
      location.href = "/interactions?next=/thanks-host";
      return;
    }
    if (!response.ok) throw new Error("Could not start another session.");
    location.href = "/";
  } catch {
    location.href = "/";
  } finally {
    startButton.disabled = false;
  }
});

function startStandbyWatch() {
  if (!audienceThanks || standbyTimer) return;
  watchForStandby();
  standbyTimer = setInterval(watchForStandby, 2000);
}

function stopStandbyWatch() {
  clearInterval(standbyTimer);
  standbyTimer = null;
}

loadTheme();
if (audienceThanks) {
  startStandbyWatch();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") startStandbyWatch();
    else stopStandbyWatch();
  });
  window.addEventListener("beforeunload", stopStandbyWatch);
}
