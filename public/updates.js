/*
 * Room Check updates page
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { loadTheme } from "./theme.js";

const statusPanel = document.querySelector("#update-status");
const statusDot = document.querySelector("#update-status-dot");
const statusLabel = document.querySelector("#update-status-label");
const statusCopy = document.querySelector("#update-status-copy");
const currentVersion = document.querySelector("#current-version");
const latestVersion = document.querySelector("#latest-version");
const releaseLink = document.querySelector("#release-link");
const checkAgain = document.querySelector("#check-again");
const installModeNote = document.querySelector("#install-mode-note");
const updateInstructions = document.querySelector("#update-instructions");
const releaseNotes = document.querySelector("#release-notes");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function setStatus(state, label, copy) {
  statusPanel.dataset.state = state;
  statusDot.dataset.state = state;
  statusLabel.textContent = label;
  statusCopy.textContent = copy;
}

function addInstruction(title, lines) {
  const heading = document.createElement("h3");
  heading.textContent = title;
  const block = document.createElement("pre");
  block.className = "update-command";
  block.textContent = lines.join("\n");
  updateInstructions.append(heading, block);
}

function renderInstructions(update) {
  updateInstructions.replaceChildren();
  const version = update.latestVersion || update.currentVersion;
  const installMode = update.installMode === "git" ? "git" : "archive";

  if (update.error || update.disabled) {
    installModeNote.textContent =
      "The update commands will appear when Room Check can read the latest release.";
    return;
  }

  if (installMode === "git") {
    installModeNote.textContent =
      "This install looks like a git checkout. Run these commands from the project folder, then restart the server.";
    addInstruction("Git checkout", [
      "git fetch --tags",
      `git checkout v${version}`,
      "npm ci",
      "# restart Room Check",
    ]);
    addInstruction("Before you update", [
      "Back up .data/ first.",
      "Do not update during a live poll or hands round.",
      "Keep a single Room Check instance running.",
    ]);
  } else {
    installModeNote.textContent =
      "This install looks like an archive download. Download the release ZIP, replace the app files, keep .data/, then restart.";
    addInstruction("Archive install", [
      `Download the v${version} release ZIP.`,
      "Replace the app files.",
      "Keep .data/ and .env.",
      "npm ci",
      "# restart Room Check",
    ]);
    addInstruction("Before you update", [
      "Back up .data/ first.",
      "Do not update during a live poll or hands round.",
      "Keep a single Room Check instance running.",
    ]);
  }
}

function render(update) {
  currentVersion.textContent = update.currentVersion || "—";
  latestVersion.textContent = update.latestVersion || "—";
  releaseLink.hidden = !update.releaseUrl;
  if (update.releaseUrl) releaseLink.href = update.releaseUrl;
  releaseNotes.textContent = update.releaseNotes || "No release notes were provided for this release.";
  renderInstructions(update);

  if (update.disabled) {
    setStatus("error", "Update checks are off.", "Enable UPDATE_CHECK to check GitHub Releases.");
    return;
  }
  if (update.error) {
    setStatus("error", "Could not check for updates.", update.error);
    return;
  }

  const checked = formatDate(update.checkedAt ? new Date(update.checkedAt).toISOString() : "");
  if (update.updateAvailable) {
    setStatus(
      "available",
      `Room Check ${update.latestVersion} is available.`,
      `${update.releaseName || "A newer release"} was published${update.publishedAt ? ` on ${formatDate(update.publishedAt)}` : ""}.`,
    );
  } else {
    setStatus(
      "current",
      "You're up to date.",
      `This install is on ${update.currentVersion}${checked ? ` — checked ${checked}` : ""}.`,
    );
  }
}

async function checkForUpdates({ force = false } = {}) {
  checkAgain.disabled = true;
  const original = checkAgain.textContent;
  checkAgain.textContent = "Checking…";
  try {
    const response = await fetch(`/api/update${force ? "?force=1" : ""}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Update check failed (${response.status}).`);
    const payload = await response.json();
    if (!payload?.update) throw new Error("The update response was empty.");
    render(payload.update);
  } catch (error) {
    setStatus("error", "Could not check for updates.", error.message || "Try again later.");
  } finally {
    checkAgain.disabled = false;
    checkAgain.textContent = original;
  }
}

checkAgain.addEventListener("click", () => checkForUpdates({ force: true }));
await loadTheme();
await checkForUpdates();
