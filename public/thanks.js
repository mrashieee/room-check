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
if (qr) qr.src = `/api/qr?data=${encodeURIComponent(githubUrl)}`;

async function watchForStandby() {
  if (!audienceThanks) return;
  try {
    const response = await fetch("/api/state", { credentials: "same-origin" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.state?.closed === false) {
      clearInterval(standbyTimer);
      location.replace("/join");
    }
  } catch {
    // Keep the thanks page visible if the network blips.
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
      location.href = "/host";
      return;
    }
    if (!response.ok) throw new Error("Could not start another session.");
    location.href = "/host";
  } catch {
    location.href = "/host";
  } finally {
    startButton.disabled = false;
  }
});

loadTheme();
if (audienceThanks) {
  watchForStandby();
  standbyTimer = setInterval(watchForStandby, 2000);
}
