/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import {
  $,
  $$,
  ApiError,
  LiveConnection,
  api,
  copyText,
  formatClock,
  formatList,
  formatVoteCount,
  launchConfetti,
  pluralize,
  renderConnection,
  showToast,
} from "./common.js";

const DRAFT_KEY = "roomcheck.hostDraft.v1";
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const MAX_OPTIONS = 10;
const OPTION_COLORS = ["lime", "coral", "blue", "pink", "violet", "sand", "mint", "ice", "peach", "rose"];
const DEFAULT_OPTIONS = ["Electric", "Warming up", "Need coffee", "Send help"];
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 52;

const loginView = $("#login-view");
const hostApp = $("#host-app");
const authEyebrow = $("#auth-eyebrow");
const authTitle = $("#auth-title");
const authLede = $("#auth-lede");
const authFootnote = $("#auth-footnote");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const passwordInput = $("#password-input");
const loginSubmit = $("#login-submit");
const authSetupForm = $("#auth-setup-form");
const authSetupError = $("#setup-error");
const setupCodeInput = $("#setup-code");
const newPasswordInput = $("#new-password");
const confirmPasswordInput = $("#confirm-password");
const authSetupSubmit = $("#setup-submit");
const setupView = $("#setup-view");
const openStage = $("#open-stage");
const resultsStage = $("#results-stage");
const setupForm = $("#setup-form");
const optionEditor = $("#option-editor");
const addOptionButton = $("#add-option");
const questionInput = $("#question-input");
const questionCount = $("#question-count");
const titleInput = $("#game-title");
const joinUrlInput = $("#join-url-input");
const setupUrl = $("#setup-url");
const setupQr = $("#setup-qr");
const stageQr = $("#stage-qr");
const stageUrl = $("#stage-url");
const stageTitle = $("#stage-title");
const stageQuestion = $("#stage-question");
const stageVoteCount = $("#stage-vote-count");
const stageChoiceCount = $("#stage-choice-count");
const revealButton = $("#reveal-button");
const hostConnection = $("#host-connection");
const hostConnectionLabel = $("#host-connection-label");
const toast = $("#toast");
const timerDial = $("#timer-dial");
const timerValue = $("#timer-value");
const timerLabel = $("#timer-label");
const timerRingValue = $("#timer-ring-value");
const confettiCanvas = $("#confetti-canvas");
const fullscreenButton = $("#fullscreen-button");

let roundState = null;
let currentView = "boot";
let lastRound = null;
let renderedOpenRoundId = null;
let renderedResultsRoundId = null;
let celebratedRoundId = null;
let options = [];
let joinUrl = "";
let connection = null;
let clockTimer = null;
let qrTimer = null;
let saveDraftTimer = null;
let actionInFlight = false;
let config = null;
let hostPollTimer = null;
let hostPollBusy = false;
let lastStateNow = 0;

function setView(view) {
  currentView = view;
  setupView.hidden = view !== "setup";
  openStage.hidden = view !== "open";
  resultsStage.hidden = view !== "results";
}

function handleAuthFailure() {
  if (connection) connection.close();
  connection = null;
  stopClock();
  stopHostPolling();
  showAuth("login", "Your host session expired. Enter your password again.");
}

function showAuth(mode = "login", message = "") {
  const isSetup = mode === "setup";
  hostApp.hidden = true;
  loginView.hidden = false;
  loginForm.hidden = isSetup;
  authSetupForm.hidden = !isSetup;

  authEyebrow.textContent = isSetup ? "First-run setup" : "Host console";
  authTitle.textContent = isSetup ? "Claim this room." : "Take the stage.";
  authLede.textContent = isSetup
    ? "Create the password that protects this host console. You only need to do this once."
    : "Enter the host password to open the control room.";
  authFootnote.textContent = isSetup
    ? "The one-time setup code is printed in the terminal running Room Check."
    : "Keep this page on your laptop and never share the password.";

  loginError.hidden = true;
  authSetupError.hidden = true;
  passwordInput.value = "";
  setupCodeInput.value = "";
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";

  if (message) {
    const target = isSetup ? authSetupError : loginError;
    target.textContent = message;
    target.hidden = false;
  }

  requestAnimationFrame(() => {
    if (isSetup) setupCodeInput.focus();
    else passwordInput.focus();
  });
}

function handleActionError(error, fallback = "That didn’t work. Try again.") {
  if (error instanceof ApiError && error.status === 401) {
    handleAuthFailure();
    return;
  }
  showToast(toast, error?.message || fallback, 4200);
}

function debounceSaveDraft() {
  clearTimeout(saveDraftTimer);
  saveDraftTimer = setTimeout(() => saveDraft(), 250);
}

function currentDraft() {
  return {
    title: titleInput.value.trim(),
    question: questionInput.value,
    options: options.map((option) => option.label),
    durationSec: readDuration(),
  };
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
  } catch {
    // Drafts are a convenience only.
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function updateQuestionCount() {
  questionCount.textContent = `${questionInput.value.length} / 160`;
}

function setTimerChoice(seconds) {
  const value = String(seconds);
  const input = $$('input[name="duration"]').find((radio) => radio.value === value);
  if (input) input.checked = true;
}

function readDuration() {
  const checked = $('input[name="duration"]:checked');
  return checked ? Number(checked.value) : 60;
}

function normalizeOptions(labels) {
  const source = Array.isArray(labels) && labels.length ? labels : DEFAULT_OPTIONS;
  return source.slice(0, MAX_OPTIONS).map((label) => ({ label: typeof label === "string" ? label : "" }));
}

function renderOptionEditor(focusIndex = null) {
  optionEditor.replaceChildren();

  options.forEach((option, index) => {
    const row = document.createElement("div");
    row.className = "option-edit";
    row.dataset.color = OPTION_COLORS[index] || "lime";

    const badge = document.createElement("span");
    badge.className = "option-letter";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = LETTERS[index] || String(index + 1);

    const input = document.createElement("input");
    input.className = "text-input";
    input.type = "text";
    input.maxLength = 52;
    input.value = option.label;
    input.placeholder = `Answer ${index + 1}`;
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Answer ${index + 1}`);
    input.addEventListener("input", () => {
      options[index].label = input.value;
      debounceSaveDraft();
    });

    const remove = document.createElement("button");
    remove.className = "remove-option";
    remove.type = "button";
    remove.disabled = options.length <= 2;
    remove.setAttribute("aria-label", `Remove answer ${index + 1}`);
    remove.title = options.length <= 2 ? "Keep at least two answers" : "Remove answer";
    remove.innerHTML =
      '<svg viewBox="0 0 20 20"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
    remove.addEventListener("click", () => {
      if (options.length <= 2) return;
      options.splice(index, 1);
      renderOptionEditor(Math.max(0, index - 1));
      debounceSaveDraft();
      updateAddOptionState();
    });

    row.append(badge, input, remove);
    optionEditor.append(row);

    if (focusIndex === index) {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
  });

  updateAddOptionState();
}

function updateAddOptionState() {
  addOptionButton.disabled = options.length >= MAX_OPTIONS;
}

function populateSetup(draft) {
  const source = draft && typeof draft === "object" ? draft : null;
  const loaded = loadDraft();
  const chosen = source || loaded;
  titleInput.value = chosen?.title || "Room Check";
  questionInput.value = chosen?.question || "How’s the energy in the room right now?";
  options = normalizeOptions(chosen?.options);
  setTimerChoice(Number.isFinite(Number(chosen?.durationSec)) ? Number(chosen.durationSec) : 60);
  updateQuestionCount();
  renderOptionEditor();
  applyJoinUrl(joinUrl, { silent: true });
  saveDraft();
}

function populateSetupFromRound(round) {
  titleInput.value = round.title || "Room Check";
  questionInput.value = round.question || "";
  options = round.options.map((option) => ({ label: option.label }));
  setTimerChoice(round.durationSec ?? 60);
  updateQuestionCount();
  renderOptionEditor();
  applyJoinUrl(joinUrl, { silent: true });
  saveDraft();
}

function isValidJoinUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function qrImageUrl(value) {
  return `/api/qr?data=${encodeURIComponent(value)}`;
}

function applyJoinUrl(value, { silent = false } = {}) {
  const next = String(value || "").trim();
  if (!isValidJoinUrl(next)) {
    if (!silent) showToast(toast, "Use a full link starting with http:// or https://.", 3500);
    return false;
  }

  joinUrl = next;
  const label = joinUrl.replace(/^https?:\/\//, "");
  setupUrl.textContent = label;
  stageUrl.textContent = label;
  if (setupQr.src !== new URL(qrImageUrl(joinUrl), location.href).href) {
    setupQr.src = qrImageUrl(joinUrl);
  }
  if (stageQr.src !== new URL(qrImageUrl(joinUrl), location.href).href) {
    stageQr.src = qrImageUrl(joinUrl);
  }
  saveDraft();
  return true;
}

function scheduleJoinUrlUpdate() {
  clearTimeout(qrTimer);
  qrTimer = setTimeout(() => {
    const value = joinUrlInput.value.trim();
    if (isValidJoinUrl(value)) applyJoinUrl(value, { silent: true });
  }, 280);
}

function updateJoinUrlNote(isPublic) {
  const note = $("#qr-mode-note");
  const hint = $("#join-url-hint");
  if (isPublic) {
    note.textContent = "Public link — phones can join from any network.";
    hint.textContent = "This is a public link. It works without shared Wi-Fi.";
  } else {
    note.textContent = "Best for a room on the same Wi-Fi.";
    hint.innerHTML =
      "Phones must be on the same Wi-Fi as this laptop. For a public link, stop this and run <code>npm run share</code>.";
  }
}

function chooseInitialJoinUrl(configValue) {
  const hostNames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!hostNames.has(location.hostname) && !configValue?.publicUrl) {
    return location.origin;
  }
  return configValue?.joinUrl || location.origin;
}

async function loadConfig() {
  try {
    config = await api("/api/config");
  } catch {
    config = null;
  }
  const initial = chooseInitialJoinUrl(config);
  joinUrlInput.value = initial;
  applyJoinUrl(initial, { silent: true });
  updateJoinUrlNote(Boolean(config?.publicUrl || initial !== config?.joinUrl));
}

function showStage(round) {
  const isNewRound = renderedOpenRoundId !== round.id;
  if (isNewRound) {
    renderedOpenRoundId = round.id;
    renderedResultsRoundId = null;
    stageQuestion.textContent = round.question;
    stageQuestion.classList.toggle("is-long", round.question.length > 68 && round.question.length <= 112);
    stageQuestion.classList.toggle("is-very-long", round.question.length > 112);
    stageTitle.textContent = round.title || "Room Check";
    stageChoiceCount.textContent = `${round.options.length} ${pluralize(round.options.length, "answer")}`;
    if (joinUrl) {
      stageQr.src = qrImageUrl(joinUrl);
      stageUrl.textContent = joinUrl.replace(/^https?:\/\//, "");
    }
  }
  stageVoteCount.textContent = formatVoteCount(round.totalVotes);
  setView("open");
  updateTimer(round);
}

function buildHostResults(round) {
  const results = round.results;
  if (!results) return;

  $("#results-vote-total").textContent = formatVoteCount(results.total);
  $("#results-question").textContent = round.question;
  $("#results-reason").textContent =
    round.revealReason === "timer" ? "Revealed by timer" : "Revealed by host";

  const bars = $("#host-result-bars");
  bars.replaceChildren();
  bars.classList.toggle("is-many", results.options.length > 4);

  const ordered = [...results.options].sort((a, b) => b.count - a.count);
  ordered.forEach((option, index) => {
    const row = document.createElement("div");
    row.className = "host-result";
    row.dataset.color = option.color || "lime";
    row.style.setProperty("--i", String(index));
    if (results.winners.includes(option.optionId)) row.classList.add("is-winner");

    const top = document.createElement("div");
    top.className = "host-result-top";

    const rank = document.createElement("span");
    rank.className = "result-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = option.label;

    const percent = document.createElement("span");
    percent.className = "result-percent";
    percent.textContent = `${option.percent}%`;

    const count = document.createElement("span");
    count.className = "result-count";
    count.textContent = `${formatVoteCount(option.count)} ${pluralize(option.count, "vote")}`;

    const track = document.createElement("div");
    track.className = "host-result-track";
    const fill = document.createElement("span");
    fill.className = "host-result-fill";
    track.append(fill);

    top.append(rank, label, percent, count);
    row.append(top, track);
    bars.append(row);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        row.style.setProperty("--bar-width", `${option.percent}%`);
      });
    });
  });

  const note = $("#winner-note-text");
  const tieNote = $("#results-tie");
  tieNote.hidden = true;

  if (!results.total) {
    note.textContent = "Silence. The room declined to participate.";
  } else if (results.winners.length === 1) {
    const winner = results.options.find((option) => option.optionId === results.winners[0]);
    note.textContent = `“${winner?.label || "That one"}” takes it with ${winner?.percent || 0}% of the room.`;
  } else {
    const labels = results.winners
      .map((optionId) => results.options.find((option) => option.optionId === optionId)?.label)
      .filter(Boolean);
    const topCount = results.options.find((option) => results.winners.includes(option.optionId))?.count || 0;
    tieNote.textContent = `The room is in a tie: ${formatList(labels)}.`;
    tieNote.hidden = false;
    note.textContent = `No single favorite — ${labels.length} answers tied with ${formatVoteCount(topCount)} ${pluralize(topCount, "vote")} each.`;
  }

  renderedResultsRoundId = round.id;
  setView("results");
}

function showResults(round) {
  setView("results");
  if (renderedResultsRoundId !== round.id) {
    buildHostResults(round);
  }
}

function applyState(state) {
  const incomingNow = Number(state?.now) || 0;
  if (incomingNow && incomingNow < lastStateNow) return;
  lastStateNow = Math.max(lastStateNow, incomingNow);
  if (connection) connection.syncServerTime(state);

  const round = state.round;
  const previousStatus = roundState?.round?.status || null;

  if (!round) {
    const hadRound = Boolean(roundState?.round);
    roundState = state;

    if (currentView === "boot" || hadRound) {
      if (lastRound) {
        populateSetupFromRound(lastRound);
      } else {
        populateSetup();
      }
      setView("setup");
    }
    return;
  }

  const isNewReveal = round.status === "revealed" && previousStatus === "open";

  if (round.status === "open") {
    roundState = state;
    lastRound = round;
    showStage(round);
    return;
  }

  roundState = state;
  lastRound = round;
  showResults(round);

  if (isNewReveal && celebratedRoundId !== round.id) {
    celebratedRoundId = round.id;
    launchConfetti(confettiCanvas);
  }
}

function startClock() {
  stopClock();
  clockTimer = setInterval(() => {
    if (roundState?.round?.status === "open") updateTimer(roundState.round);
  }, 250);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
}

function updateTimer(round) {
  if (!round || round.status !== "open") return;

  if (!round.endsAt || round.durationSec <= 0) {
    timerDial.classList.add("is-manual");
    timerDial.classList.remove("is-urgent");
    timerValue.textContent = "OPEN";
    timerLabel.textContent = "host closes";
    timerRingValue.style.strokeDashoffset = "0";
    return;
  }

  const remaining = Math.max(0, round.endsAt - connection.serverNow());
  const total = Math.max(1, round.durationSec * 1000);
  const fraction = Math.min(1, remaining / total);
  timerDial.classList.remove("is-manual");
  timerDial.classList.toggle("is-urgent", remaining <= 10_000);
  timerValue.textContent = formatClock(remaining);
  timerLabel.textContent = remaining > 0 ? "left" : "revealing";
  timerRingValue.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - fraction));
}

function setActionBusy(button, busy, busyText = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.querySelector("span")?.textContent || button.textContent;
    const label = button.querySelector("span");
    if (label) label.textContent = busyText;
    else button.textContent = busyText;
    button.disabled = true;
  } else {
    const label = button.querySelector("span");
    const original = button.dataset.originalText;
    if (label && original) label.textContent = original;
    else if (original) button.textContent = original;
    button.disabled = false;
  }
}

async function revealResults() {
  if (actionInFlight || roundState?.round?.status !== "open") return;
  actionInFlight = true;
  setActionBusy(revealButton, true, "Revealing…");
  try {
    const result = await api("/api/host/reveal", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(revealButton, false);
  }
}

async function startRound(event) {
  event.preventDefault();
  if (actionInFlight) return;

  const labels = options.map((option) => option.label.trim()).filter(Boolean);
  if (labels.length < 2) {
    showToast(toast, "Add at least two answers.", 3500);
    return;
  }

  const unique = new Set(labels.map((label) => label.toLocaleLowerCase()));
  if (unique.size !== labels.length) {
    showToast(toast, "Each answer needs to be different.", 3500);
    return;
  }

  if (!questionInput.value.trim()) {
    showToast(toast, "Write a question for the room.", 3500);
    questionInput.focus();
    return;
  }

  const enteredJoinUrl = joinUrlInput.value.trim();
  if (!isValidJoinUrl(enteredJoinUrl)) {
    showToast(toast, "Use a valid audience link starting with http:// or https://.", 4000);
    joinUrlInput.focus();
    return;
  }
  applyJoinUrl(enteredJoinUrl, { silent: true });
  saveDraft();

  const button = $("#start-button");
  actionInFlight = true;
  setActionBusy(button, true, "Opening…");

  try {
    const result = await api("/api/host/open", {
      method: "POST",
      body: {
        title: titleInput.value.trim(),
        question: questionInput.value,
        options: labels,
        durationSec: readDuration(),
      },
    });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(button, false);
  }
}

async function resetToSetup() {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    const result = await api("/api/host/reset", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
  }
}

function askReset() {
  if (!window.confirm("Close this round and start over? Any votes in this round will be discarded.")) return;
  resetToSetup();
}

async function playAgain() {
  if (actionInFlight || !lastRound) return;
  actionInFlight = true;
  const button = $("#again-button");
  setActionBusy(button, true, "Reopening…");

  try {
    const result = await api("/api/host/open", {
      method: "POST",
      body: {
        title: lastRound.title,
        question: lastRound.question,
        options: lastRound.options.map((option) => option.label),
        durationSec: lastRound.durationSec,
      },
    });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(button, false);
  }
}

async function newQuestion() {
  if (actionInFlight) return;
  if (lastRound) {
    populateSetupFromRound(lastRound);
  }
  actionInFlight = true;
  try {
    const result = await api("/api/host/reset", { method: "POST", body: {} });
    applyState(result.state);
    questionInput.focus();
    questionInput.select();
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  document.documentElement.requestFullscreen().catch(() => {
    showToast(toast, "Your browser blocked full screen. Try F11 instead.", 3500);
  });
}

function connectHostSocket() {
  if (connection) connection.close();
  connection = new LiveConnection({
    role: "host",
    onState: applyState,
    onStatus(status) {
      renderConnection(
        hostConnection,
        hostConnectionLabel,
        status,
        status === "online" ? "Connected" : status === "offline" ? "Reconnecting" : "Connecting",
      );
      if (status === "online") {
        stopHostPolling();
      } else {
        startHostPolling();
      }
    },
  });
}

async function pollHostState() {
  if (hostPollBusy) return;
  hostPollBusy = true;
  try {
    const payload = await api("/api/host/state");
    if (payload?.state) applyState(payload.state);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      handleAuthFailure();
    }
  } finally {
    hostPollBusy = false;
  }
}

function startHostPolling() {
  if (hostPollTimer) return;
  pollHostState();
  hostPollTimer = setInterval(pollHostState, 3000);
}

function stopHostPolling() {
  clearInterval(hostPollTimer);
  hostPollTimer = null;
}

async function enterConsole() {
  const stateResponse = await api("/api/host/state");
  loginView.hidden = true;
  hostApp.hidden = false;
  await loadConfig();
  connectHostSocket();
  applyState(stateResponse.state);
  startClock();
  if (currentView === "setup") questionInput.focus();
}

async function init() {
  let auth;
  try {
    auth = await api("/api/host/me");
  } catch {
    showAuth("login", "Could not reach the server. Refresh this page to try again.");
    return;
  }

  if (auth.authed) {
    try {
      await enterConsole();
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showAuth("login");
        return;
      }
      showAuth("login", "Could not load the host console. Refresh to try again.");
      return;
    }
  }

  showAuth(auth.configured ? "login" : "setup");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!passwordInput.value) {
    loginError.textContent = "Enter the host password.";
    loginError.hidden = false;
    return;
  }

  loginSubmit.disabled = true;
  const original = loginSubmit.textContent;
  loginSubmit.textContent = "Checking…";
  loginError.hidden = true;

  try {
    await api("/api/host/login", {
      method: "POST",
      body: { password: passwordInput.value },
    });
    loginSubmit.textContent = "Welcome in…";
    await enterConsole();
  } catch (error) {
    if (error.code === "setup_required") {
      showAuth("setup", "This host needs a password first. Find the setup code in your terminal.");
    } else if (error.code === "already_configured") {
      showAuth("login", "The host password is already configured.");
    } else {
      loginError.textContent = error.message || "That password is not right.";
      loginError.hidden = false;
      passwordInput.select();
    }
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = original;
  }
});

passwordInput.addEventListener("input", () => {
  loginError.hidden = true;
});

setupCodeInput.addEventListener("input", () => {
  authSetupError.hidden = true;
  const clean = setupCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  setupCodeInput.value = clean.length > 4 ? clean.slice(0, 4) + "-" + clean.slice(4) : clean;
});

newPasswordInput.addEventListener("input", () => {
  authSetupError.hidden = true;
});

confirmPasswordInput.addEventListener("input", () => {
  authSetupError.hidden = true;
});

authSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!setupCodeInput.value.trim()) {
    authSetupError.textContent = "Enter the setup code from the terminal.";
    authSetupError.hidden = false;
    setupCodeInput.focus();
    return;
  }
  if (newPasswordInput.value.trim().length < 8) {
    authSetupError.textContent = "Use at least 8 characters for the password.";
    authSetupError.hidden = false;
    newPasswordInput.focus();
    return;
  }
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    authSetupError.textContent = "The two passwords don’t match.";
    authSetupError.hidden = false;
    confirmPasswordInput.focus();
    return;
  }

  authSetupSubmit.disabled = true;
  const original = authSetupSubmit.textContent;
  authSetupSubmit.textContent = "Creating password…";
  authSetupError.hidden = true;

  try {
    await api("/api/host/setup", {
      method: "POST",
      body: {
        setupCode: setupCodeInput.value,
        password: newPasswordInput.value,
      },
    });
    if (connection) {
      connection.close();
      connection = null;
    }
    await enterConsole();
  } catch (error) {
    if (error.code === "already_configured") {
      showAuth("login", "The host password is already set. Enter it to continue.");
    } else {
      authSetupError.textContent = error.message || "Could not create the password. Try again.";
      authSetupError.hidden = false;
    }
  } finally {
    authSetupSubmit.disabled = false;
    authSetupSubmit.textContent = original;
  }
});

setupForm.addEventListener("submit", startRound);
questionInput.addEventListener("input", () => {
  updateQuestionCount();
  debounceSaveDraft();
});
titleInput.addEventListener("input", debounceSaveDraft);

$("#timer-choices").addEventListener("change", () => {
  debounceSaveDraft();
});

addOptionButton.addEventListener("click", () => {
  if (options.length >= MAX_OPTIONS) return;
  options.push({ label: "" });
  renderOptionEditor(options.length - 1);
  debounceSaveDraft();
});

joinUrlInput.addEventListener("input", scheduleJoinUrlUpdate);
joinUrlInput.addEventListener("blur", () => {
  const value = joinUrlInput.value.trim();
  if (isValidJoinUrl(value)) {
    applyJoinUrl(value, { silent: true });
  }
});

$("#copy-link-button").addEventListener("click", async () => {
  const value = joinUrlInput.value.trim() || joinUrl;
  if (!isValidJoinUrl(value)) {
    showToast(toast, "Add a valid link first.", 2500);
    return;
  }
  const copied = await copyText(value);
  showToast(toast, copied ? "Audience link copied." : "Could not copy — select the link instead.", 2600);
});

revealButton.addEventListener("click", revealResults);
$("#cancel-round-button").addEventListener("click", askReset);
$("#again-button").addEventListener("click", playAgain);
$("#new-question-button").addEventListener("click", newQuestion);
fullscreenButton.addEventListener("click", toggleFullscreen);

$("#lock-button").addEventListener("click", async () => {
  try {
    await api("/api/host/logout", { method: "POST", body: {} });
  } catch {
    // Lock the UI regardless.
  }
  if (connection) connection.close();
  stopClock();
  stopHostPolling();
  location.reload();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  ) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFullscreen();
  }

  if (event.key.toLowerCase() === "r" && currentView === "open") {
    event.preventDefault();
    revealResults();
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFull = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-label", isFull ? "Exit full screen" : "Enter full screen");
});

window.addEventListener("beforeunload", () => {
  if (connection) connection.close();
  stopClock();
  stopHostPolling();
  clearTimeout(qrTimer);
  clearTimeout(saveDraftTimer);
});

init();
