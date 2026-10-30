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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return text;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const closeList = () => {
    if (!listType) return;
    html += `</${listType}>`;
    listType = null;
  };
  const openList = (type) => {
    if (listType === type) return;
    closeList();
    listType = type;
    html += `<${type}>`;
  };
  const flushCode = () => {
    if (!inCode) return;
    html += `<pre class="release-code"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
    codeLines = [];
    inCode = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      else {
        closeList();
        inCode = true;
        codeLines = [];
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1].length + 1);
      html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      openList("ul");
      html += `<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      openList("ol");
      html += `<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      html += `<blockquote>${renderInline(line.replace(/^>\s?/, ""))}</blockquote>`;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      html += "<hr />";
      continue;
    }
    closeList();
    html += `<p>${renderInline(line)}</p>`;
  }

  flushCode();
  closeList();
  return html || "<p>No release notes were provided for this release.</p>";
}

function fallbackCopy(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

async function copyText(text, button) {
  const original = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1500);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (!fallbackCopy(text)) {
      button.textContent = "Copy failed";
    }
  } catch {
    if (!fallbackCopy(text)) button.textContent = "Copy failed";
  }
}

function addCopyButton(parent, text, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-command";
  button.textContent = "Copy";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => copyText(text, button));
  parent.append(button);
  return button;
}

function addCommand(parent, command) {
  const row = document.createElement("div");
  row.className = "command-row";
  const code = document.createElement("code");
  code.textContent = command;
  row.append(code);
  addCopyButton(row, command, `Copy command: ${command}`);
  parent.append(row);
}

function addStep(number, title, description, commands = []) {
  const step = document.createElement("section");
  step.className = "update-step";
  const marker = document.createElement("span");
  marker.className = "update-step-number";
  marker.textContent = String(number).padStart(2, "0");
  marker.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "update-step-body";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = description;
  body.append(heading, copy);
  if (commands.length) {
    const commandList = document.createElement("div");
    commandList.className = "command-list";
    for (const command of commands) addCommand(commandList, command);
    body.append(commandList);
  }
  step.append(marker, body);
  updateInstructions.append(step);
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

  const allCommands = [];
  const head = document.createElement("div");
  head.className = "update-instructions-head";
  updateInstructions.append(head);

  if (installMode === "git") {
    installModeNote.textContent =
      "This looks like a git checkout. Follow the steps, then restart Room Check.";
    addStep(1, "Back up your data", "Keep a copy of the room state before changing the app.", [
      "npm run backup-data",
    ]);
    allCommands.push("npm run backup-data");
    addStep(2, "Update the code", "Fetch release tags and check out this release.", [
      "git fetch --tags",
      `git checkout v${version}`,
    ]);
    allCommands.push("git fetch --tags", `git checkout v${version}`);
    addStep(3, "Install dependencies", "Use the lockfile so the install matches the release.", [
      "npm ci",
    ]);
    allCommands.push("npm ci");
    addStep(4, "Restart Room Check", "Stop the current process and start it again. With systemd, restart the Room Check service.");
  } else {
    installModeNote.textContent =
      "This looks like an archive install. Replace the app files, keep .data/ and .env, then restart.";
    addStep(1, "Back up your data", "Keep a copy of the room state before changing the app.", [
      "npm run backup-data",
    ]);
    allCommands.push("npm run backup-data");
    addStep(2, "Replace the app files", `Download the v${version} release ZIP and replace the app files. Keep .data/ and .env.`);
    addStep(3, "Install dependencies", "Use the lockfile so the install matches the release.", [
      "npm ci",
    ]);
    allCommands.push("npm ci");
    addStep(4, "Restart Room Check", "Stop the current process and start it again. With systemd, restart the Room Check service.");
  }

  if (allCommands.length) {
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "text-button";
    allButton.textContent = "Copy all commands";
    allButton.addEventListener("click", () => copyText(allCommands.join("\n"), allButton));
    head.append(allButton);
  }

  const warning = document.createElement("p");
  warning.className = "update-warning";
  warning.textContent =
    "Do not update during a live poll or Live Hands round. Keep one Room Check instance running.";
  updateInstructions.append(warning);
}

function render(update) {
  currentVersion.textContent = update.currentVersion || "—";
  latestVersion.textContent = update.latestVersion || "—";
  releaseLink.hidden = !update.releaseUrl;
  if (update.releaseUrl) releaseLink.href = update.releaseUrl;
  releaseNotes.innerHTML = update.releaseNotes
    ? renderMarkdown(update.releaseNotes)
    : "<p>No release notes were provided for this release.</p>";
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
