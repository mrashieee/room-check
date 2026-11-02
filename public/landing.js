/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { initCustomizer } from "./customizer.js";
import { loadTheme } from "./theme.js";

const fullscreenButton = document.querySelector("#landing-fullscreen");
const endSessionButton = document.querySelector("#landing-end-session");

let presentationLive = false;
let stateTimer = null;

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function setEndState(active) {
  endSessionButton.disabled = !active;
  endSessionButton.title = active ? "End the current session" : "No live session";
}

async function refreshState() {
  try {
    const response = await fetch("/api/host/state", { credentials: "same-origin" });
    if (response.status === 401) {
      presentationLive = false;
      setEndState(false);
      return;
    }
    if (!response.ok) return;
    const payload = await response.json();
    const state = payload.state;
    presentationLive = state?.presentation?.status === "live";
    const interactionLive =
      state?.round?.status === "open" ||
      state?.survey?.status === "open";
    setEndState(presentationLive || interactionLive);
  } catch {
    // Keep the last known state if the network blips.
  }
}

async function endSession() {
  if (endSessionButton.disabled) return;
  if (!window.confirm("End the current session? The audience will see the thank-you screen.")) {
    return;
  }

  endSessionButton.disabled = true;
  const endpoint = presentationLive ? "/api/presentation/end" : "/api/host/end";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (response.status === 401) {
      location.href = "/host?next=/";
      return;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Could not end the session.");
    }
    location.href = "/thanks-host";
  } catch (error) {
    endSessionButton.disabled = false;
    window.alert(error.message || "Could not end the session.");
  }
}

fullscreenButton.addEventListener("click", toggleFullscreen);
endSessionButton.addEventListener("click", endSession);
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-label", active ? "Exit full screen" : "Enter full screen");
  fullscreenButton.title = active ? "Exit full screen" : "Full screen";
});

loadTheme();
initCustomizer();
refreshState();
stateTimer = setInterval(refreshState, 5000);
window.addEventListener("beforeunload", () => clearInterval(stateTimer));
