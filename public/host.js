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
import { applyTheme, loadTheme } from "./theme.js";
import { contrastRatio } from "./theme-config.js";
import { initCustomizer } from "./customizer.js";

const DRAFT_KEY = "roomcheck.hostDraft.v2";
const LEGACY_DRAFT_KEY = "roomcheck.hostDraft.v1";
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const MAX_OPTIONS = 10;
const MAX_QUESTIONS = 20;
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
const surveyStage = $("#survey-stage");
const endedStage = $("#ended-stage");
const setupForm = $("#setup-form");
const modeChoices = $("#mode-choices");
const sessionBuilder = $("#session-builder");
const multiQuestionToggle = $("#multi-question-toggle");
const importQuestionsInput = $("#import-questions-input");
const sessionCount = $("#session-count");
const questionList = $("#question-list");
const addQuestionButton = $("#add-question");
const removeQuestionButton = $("#remove-question");
const questionEditorLabel = $("#question-editor-label");
const questionEditorHead = $(".question-editor-head");
const questionTimerField = $("#question-timer-field");
const questionTieField = $("#question-tie-field");
const surveyTimerField = $("#survey-timer-field");
const surveyTimerChoices = $("#survey-timer-choices");
const modeHint = $("#mode-hint");
const startButtonLabel = $("#start-button-label");
const setupSubmitNote = $("#setup-submit-note");
const optionEditor = $("#option-editor");
const addOptionButton = $("#add-option");
const questionInput = $("#question-input");
const questionCount = $("#question-count");
const titleInput = $("#game-title");
const spinOnTieInput = $("#spin-on-tie");
const joinUrlInput = $("#join-url-input");
const setupUrl = $("#setup-url");
const setupQr = $("#setup-qr");
const stageQr = $("#stage-qr");
const stageUrl = $("#stage-url");
const stageTitle = $("#stage-title");
const stageQuestion = $("#stage-question");
const stageVoteCount = $("#stage-vote-count");
const stageChoiceCount = $("#stage-choice-count");
const stageLiveLabel = $("#stage-live-label");
const stageLede = $("#stage-lede");
const stageStatLabel = $("#stage-stat-label");
const stageDetailNote = $("#stage-detail-note");
const stageShortcuts = $("#stage-shortcuts");
const stageProgress = $("#stage-progress");
const surveyStageEyebrow = $("#survey-stage-eyebrow");
const surveyStageTitle = $("#survey-stage-title");
const surveyTotal = $("#survey-total");
const surveyTotalLabel = $("#survey-total-label");
const surveyTimer = $("#survey-timer");
const surveyQuestionList = $("#survey-question-list");
const surveyFootnote = $("#survey-footnote");
const surveyBackButton = $("#survey-back-button");
const surveyFinishButton = $("#survey-finish-button");
const handsGlyph = $("#hands-glyph");
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
const endSessionButton = $("#end-session-button");
const updateNotice = $("#update-notice");
const updateNoticeTitle = $("#update-notice-title");
const updateNoticeCopy = $("#update-notice-copy");
const updateDismiss = $("#update-dismiss");
const endedBackButton = $("#ended-back-button");
const resultsEyebrowHost = $("#results-eyebrow-host");
const nextQuestionButton = $("#next-question-button");
const againButton = $("#again-button");
const newQuestionButton = $("#new-question-button");
const githubQr = $("#github-qr");
const GITHUB_URL = "https://github.com/mrashieee/room-check";
const wheelOverlay = $("#wheel-overlay");
const wheelDisc = $("#wheel-disc");
const wheelLegend = $("#wheel-legend");
const wheelTitle = $("#wheel-title");
const wheelSubtitle = $("#wheel-subtitle");
const wheelStatus = $("#wheel-status");
const wheelSpinButton = $("#wheel-spin-button");
const wheelResult = $("#wheel-result");
const WHEEL_ANIMATION_MS = 6500;
const UPDATE_DISMISSED_KEY = "roomcheck.updateDismissed.v1";

let roundState = null;
let currentView = "boot";
let lastRound = null;
let lastSession = null;
let draftQuestions = [];
let activeQuestionIndex = 0;
let renderedOpenRoundId = null;
let renderedResultsSignature = null;
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
let wheelRoundId = null;
let wheelOptions = [];
let wheelAutoTimer = null;
let wheelFallbackTimer = null;
let wheelStopTimer = null;
let wheelSpinBusy = false;
let wheelWinnerId = null;
let wheelIsOpen = false;

function sessionProgressText(session) {
  return session && session.total > 1 ? `Question ${session.index} of ${session.total}` : "";
}

function setView(view) {
  currentView = view;
  setupView.hidden = view !== "setup";
  openStage.hidden = view !== "open";
  resultsStage.hidden = view !== "results";
  surveyStage.hidden = view !== "survey";
  endedStage.hidden = view !== "ended";
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

function defaultQuestionDraft({ blank = false } = {}) {
  return {
    question: blank ? "" : "How’s the energy in the room right now?",
    options: [...DEFAULT_OPTIONS],
    durationSec: 60,
    spinOnTie: true,
  };
}

function normalizeQuestionDraft(raw) {
  return {
    question: typeof raw?.question === "string" ? raw.question : "",
    options: normalizeOptions(raw?.options).map((option) => option.label),
    durationSec: Number.isFinite(Number(raw?.durationSec)) ? Number(raw.durationSec) : 60,
    spinOnTie: raw?.spinOnTie !== false,
  };
}

function normalizeQuestionDrafts(rawQuestions, fallback = null) {
  const source = Array.isArray(rawQuestions) && rawQuestions.length ? rawQuestions : null;
  if (source) return source.slice(0, MAX_QUESTIONS).map(normalizeQuestionDraft);
  if (fallback?.question) return [normalizeQuestionDraft(fallback)];
  return [defaultQuestionDraft()];
}

function captureActiveQuestion() {
  const current = draftQuestions[activeQuestionIndex];
  if (!current) return;
  current.question = questionInput.value;
  current.options = options.map((option) => option.label);
  current.durationSec = readDuration();
  current.spinOnTie = spinOnTieInput.checked;
}

function currentDraft() {
  captureActiveQuestion();
  return {
    version: 2,
    mode: readMode(),
    multi: multiQuestionToggle.checked,
    surveyDurationSec: readSurveyDuration(),
    title: titleInput.value.trim(),
    questions: draftQuestions.map((question) => ({
      question: question.question,
      options: [...question.options],
      durationSec: question.durationSec,
      spinOnTie: question.spinOnTie,
    })),
    activeIndex: activeQuestionIndex,
  };
}

function saveDraft() {
  if (!draftQuestions.length) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
  } catch {
    // Drafts are a convenience only.
  }
}

function loadDraft() {
  for (const key of [DRAFT_KEY, LEGACY_DRAFT_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (Array.isArray(parsed.questions)) return parsed;
      if (typeof parsed.question === "string") {
        return {
          version: 2,
          mode: parsed.mode === "hands" ? "hands" : "poll",
          title: parsed.title,
          questions: [normalizeQuestionDraft(parsed)],
          activeIndex: 0,
        };
      }
    } catch {
      // Try the next draft format.
    }
  }
  return null;
}

function loadActiveQuestion() {
  const current = draftQuestions[activeQuestionIndex] || defaultQuestionDraft();
  options = normalizeOptions(current.options);
  questionInput.value = current.question || "";
  setTimerChoice(Number.isFinite(Number(current.durationSec)) ? Number(current.durationSec) : 60);
  spinOnTieInput.checked = current.spinOnTie !== false;
  updateQuestionCount();
  renderOptionEditor();
  updateQuestionBuilder();
}

function updateQuestionBuilder() {
  if (!questionList || !sessionCount || !questionEditorLabel) return;
  sessionCount.textContent = `${draftQuestions.length} ${pluralize(draftQuestions.length, "question")}`;
  questionEditorLabel.textContent = `Editing question ${activeQuestionIndex + 1} of ${draftQuestions.length}`;
  removeQuestionButton.disabled = draftQuestions.length <= 1;
  addQuestionButton.disabled = draftQuestions.length >= MAX_QUESTIONS;

  questionList.replaceChildren();
  draftQuestions.forEach((question, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "question-card";
    card.classList.toggle("is-active", index === activeQuestionIndex);
    card.dataset.index = String(index);
    card.setAttribute("aria-label", `Edit question ${index + 1}`);

    const number = document.createElement("span");
    number.className = "question-card-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "question-card-copy";
    const title = document.createElement("strong");
    title.textContent = question.question.trim() || "Untitled question";
    const meta = document.createElement("small");
    const timer =
      question.durationSec > 0 ? `${question.durationSec}s timer` : "manual reveal";
    const answers = question.options.filter(Boolean).length;
    meta.textContent = multiQuestionToggle.checked
      ? `${answers} answers`
      : `${answers} answers · ${timer}`;
    copy.append(title, meta);

    card.append(number, copy);
    card.addEventListener("click", () => switchQuestion(index));
    questionList.append(card);
  });

  syncModeUI();
}

function switchQuestion(index) {
  if (index === activeQuestionIndex || index < 0 || index >= draftQuestions.length) return;
  captureActiveQuestion();
  activeQuestionIndex = index;
  loadActiveQuestion();
  saveDraft();
}

function addQuestion() {
  if (draftQuestions.length >= MAX_QUESTIONS) return;
  captureActiveQuestion();
  draftQuestions.push(defaultQuestionDraft({ blank: true }));
  activeQuestionIndex = draftQuestions.length - 1;
  loadActiveQuestion();
  saveDraft();
  questionInput.focus();
}

function removeActiveQuestion() {
  if (draftQuestions.length <= 1) return;
  draftQuestions.splice(activeQuestionIndex, 1);
  activeQuestionIndex = Math.min(activeQuestionIndex, draftQuestions.length - 1);
  loadActiveQuestion();
  saveDraft();
}

const IMPORT_DURATIONS = new Set([0, 30, 60, 90, 120]);

function importedAnswerLabels(item) {
  const raw = item?.answers ?? item?.options ?? item?.answer;
  if (typeof raw === "string") return [raw];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((answer) => (typeof answer === "string" ? answer : answer?.label))
    .filter((answer) => typeof answer === "string")
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function parseImportedQuestions(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.questions)
      ? payload.questions
      : payload && typeof payload === "object"
        ? [payload]
        : null;

  if (!list || list.length === 0) {
    throw new Error('Use a JSON array or an object with a "questions" array.');
  }
  if (list.length > MAX_QUESTIONS) {
    throw new Error(`Keep the import to ${MAX_QUESTIONS} questions or fewer.`);
  }

  return list.map((item, index) => {
    const label = `Question ${index + 1}`;
    const question = typeof item?.question === "string" ? item.question.trim() : "";
    if (!question) throw new Error(`${label}: add a "question" attribute.`);
    if (question.length > 160) throw new Error(`${label}: keep the question under 160 characters.`);

    const answers = importedAnswerLabels(item);
    if (answers.length < 2) throw new Error(`${label}: add at least two answers.`);
    if (answers.length > MAX_OPTIONS) throw new Error(`${label}: keep it to ten answers or fewer.`);
    if (answers.some((answer) => answer.length > 52)) {
      throw new Error(`${label}: keep each answer under 52 characters.`);
    }
    const unique = new Set(answers.map((answer) => answer.toLocaleLowerCase()));
    if (unique.size !== answers.length) {
      throw new Error(`${label}: each answer needs to be different.`);
    }

    const rawDuration = item?.durationSec ?? item?.duration ?? item?.timer ?? 60;
    const durationSec = Number(rawDuration);
    if (!IMPORT_DURATIONS.has(durationSec)) {
      throw new Error(`${label}: use a duration of 0, 30, 60, 90 or 120 seconds.`);
    }

    return {
      question,
      options: answers,
      durationSec,
      spinOnTie: item?.spinOnTie !== false && item?.tieBreaker !== false,
    };
  });
}

async function importQuestionsFile(file) {
  if (!file) return;
  if (file.size > 256 * 1024) {
    showToast(toast, "Keep the JSON file under 256 KB.", 4200);
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const imported = parseImportedQuestions(payload);
    if (
      draftQuestions.length > 1 &&
      !window.confirm("Replace the current question set with the imported questions?")
    ) {
      return;
    }
    setMode("poll");
    draftQuestions = imported;
    activeQuestionIndex = 0;
    multiQuestionToggle.checked = imported.length > 1;
    loadActiveQuestion();
    saveDraft();
    showToast(
      toast,
      `Imported ${imported.length} ${pluralize(imported.length, "question")}.`,
      3200,
    );
  } catch (error) {
    showToast(toast, error?.message || "Could not read that JSON file.", 5200);
  } finally {
    importQuestionsInput.value = "";
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

function setSurveyTimerChoice(seconds) {
  const value = String(seconds);
  const input = $$('input[name="surveyDuration"]').find((radio) => radio.value === value);
  if (input) input.checked = true;
}

function readSurveyDuration() {
  const checked = $('input[name="surveyDuration"]:checked');
  return checked ? Number(checked.value) : 0;
}

function readMode() {
  const checked = $('input[name="mode"]:checked', setupForm);
  return checked?.value === "hands" ? "hands" : "poll";
}

function setMode(mode) {
  const input = $$('input[name="mode"]', setupForm).find((radio) => radio.value === mode);
  if (input) input.checked = true;
  syncModeUI();
}

function syncModeUI() {
  const mode = readMode();
  const hands = mode === "hands";
  const multi = !hands && multiQuestionToggle.checked;
  setupForm.dataset.mode = mode;
  $$(".poll-only", setupForm).forEach((element) => {
    element.hidden = hands;
  });
  sessionBuilder.hidden = !multi;
  questionEditorHead.hidden = !multi;
  questionTimerField.hidden = hands || multi;
  questionTieField.hidden = hands || multi;
  surveyTimerField.hidden = hands || !multi;
  modeHint.textContent = hands
    ? "The audience can raise and lower a hand from their phone. The count updates live on this screen."
    : multi
      ? "Build a run of poll questions. The host reveals each result and moves the room on."
      : "Ask one question, collect votes, then reveal the results.";
  const count = multi ? draftQuestions.length || 1 : 1;
  startButtonLabel.textContent = hands
    ? "Open live hands"
    : multi
      ? `Start ${count}-question survey`
      : "Open the room";
  setupSubmitNote.textContent = hands
    ? "The raised-hand button goes live instantly. Keep this tab projected."
    : multi
      ? "People answer each question in order. Counts update live."
      : "The QR code goes live instantly. Keep this tab projected.";
}

function normalizeOptions(labels) {
  const source = Array.isArray(labels) && labels.length ? labels : DEFAULT_OPTIONS;
  return source.slice(0, MAX_OPTIONS).map((label) => {
    if (typeof label === "string") return { label };
    if (label && typeof label === "object" && typeof label.label === "string") {
      return { label: label.label };
    }
    return { label: "" };
  });
}

function renderOptionEditor(focusIndex = null) {
  optionEditor.replaceChildren();

  options.forEach((option, index) => {
    const row = document.createElement("div");
    row.className = "option-edit";
    row.dataset.color = OPTION_COLORS[index] || "lime";
    applyChoiceInk(row, row.dataset.color);

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
      if (draftQuestions[activeQuestionIndex]) {
        draftQuestions[activeQuestionIndex].options = options.map((option) => option.label);
      }
      updateQuestionBuilder();
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
      if (draftQuestions[activeQuestionIndex]) {
        draftQuestions[activeQuestionIndex].options = options.map((option) => option.label);
      }
      updateQuestionBuilder();
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

function applyChoiceInk(element, colorKey) {
  const color =
    getComputedStyle(document.documentElement).getPropertyValue(`--data-${colorKey}`).trim() || "#ebc831";
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#1d3b32";
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim() || "#f6ecd7";
  element.style.setProperty(
    "--accent-ink",
    contrastRatio(color, ink) >= contrastRatio(color, paper) ? ink : paper,
  );
}

function refreshChoiceInks() {
  for (const row of document.querySelectorAll(".option-edit")) {
    applyChoiceInk(row, row.dataset.color || "lime");
  }
  for (const item of document.querySelectorAll(".wheel-legend-item")) {
    applyChoiceInk(item, item.dataset.color || "lime");
  }
}

document.addEventListener("roomcheck:theme", refreshChoiceInks);

function populateSetup(draft) {
  const source = draft && typeof draft === "object" ? draft : null;
  const chosen = source || loadDraft();
  titleInput.value = chosen?.title || "Room Check";
  draftQuestions = normalizeQuestionDrafts(chosen?.questions, chosen);
  activeQuestionIndex = Math.min(
    Math.max(Number(chosen?.activeIndex) || 0, 0),
    draftQuestions.length - 1,
  );
  const multi = typeof chosen?.multi === "boolean" ? chosen.multi : draftQuestions.length > 1;
  multiQuestionToggle.checked = multi;
  setSurveyTimerChoice(Number(chosen?.surveyDurationSec) || 0);
  setMode(chosen?.mode === "hands" ? "hands" : "poll");
  loadActiveQuestion();
  applyJoinUrl(joinUrl, { silent: true });
  saveDraft();
}

function populateSetupFromRound(round) {
  titleInput.value = round.title || "Room Check";
  draftQuestions = [
    normalizeQuestionDraft({
      question: round.question || "",
      options: round.options.map((option) => option.label),
      durationSec: round.durationSec ?? 60,
      spinOnTie: round.spinOnTie !== false,
    }),
  ];
  activeQuestionIndex = 0;
  multiQuestionToggle.checked = false;
  setSurveyTimerChoice(0);
  setMode(round.mode === "hands" ? "hands" : "poll");
  loadActiveQuestion();
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
  const isHands = round.mode === "hands";
  const handsClosed = isHands && round.status === "closed";
  const isNewRound = renderedOpenRoundId !== round.id;

  if (isNewRound) {
    renderedOpenRoundId = round.id;
    renderedResultsSignature = null;
    wheelRoundId = null;
    hideWheel();
    stageQuestion.textContent = round.question;
    stageQuestion.classList.toggle("is-long", round.question.length > 68 && round.question.length <= 112);
    stageQuestion.classList.toggle("is-very-long", round.question.length > 112);
    stageTitle.textContent = round.title || "Room Check";
    const progress = sessionProgressText(roundState?.session);
    stageProgress.hidden = !progress;
    stageProgress.textContent = progress;
    if (joinUrl) {
      stageQr.src = qrImageUrl(joinUrl);
      stageUrl.textContent = joinUrl.replace(/^https?:\/\//, "");
    }
  }

  const progress = sessionProgressText(roundState?.session);
  stageProgress.hidden = !progress;
  stageProgress.textContent = progress;
  openStage.classList.toggle("is-hands", isHands);
  openStage.classList.toggle("is-closed", handsClosed);
  stageLiveLabel.textContent = isHands ? (handsClosed ? "Hands closed" : "Hands live") : "Voting live";
  stageLiveLabel.parentElement.classList.toggle("live-chip--warm", handsClosed);
  handsGlyph.hidden = !isHands;
  timerDial.hidden = isHands;
  stageShortcuts.hidden = isHands;

  if (isHands) {
    stageLede.textContent = handsClosed
      ? "Hands are down. This is the final count."
      : "Scan the code. Raise a hand. Put it down anytime.";
    stageStatLabel.textContent = handsClosed ? "hands raised" : "hands up";
    stageChoiceCount.textContent = handsClosed ? "Final count" : "Live count";
    stageDetailNote.textContent = handsClosed ? "round closed" : "updates instantly";
    stageVoteCount.textContent = formatVoteCount(round.raisedCount);
    const label = revealButton.querySelector("span");
    if (label) label.textContent = "Done — hands down";
    revealButton.hidden = handsClosed;
    $("#cancel-round-button").textContent = handsClosed ? "New question" : "Start over";
  } else {
    const accent = document.createElement("span");
    accent.textContent = "No overthinking.";
    stageLede.replaceChildren(document.createTextNode("Scan the code. Pick an answer. "), accent);
    stageStatLabel.textContent = "votes in";
    stageChoiceCount.textContent = `${round.options.length} ${pluralize(round.options.length, "answer")}`;
    stageDetailNote.textContent = "on every phone";
    stageVoteCount.textContent = formatVoteCount(round.totalVotes);
    const label = revealButton.querySelector("span");
    if (label) label.textContent = "Done — reveal results";
    revealButton.hidden = false;
    $("#cancel-round-button").textContent = "Start over";
  }

  setView("open");
  if (!isHands) updateTimer(round);
}

function buildHostResults(round) {
  const results = round.results;
  if (!results) return;

  const tieBreak = round.tieBreak;
  const wheelWinnerId = tieBreak?.status === "done" ? tieBreak.winnerOptionId : null;
  const displayWinners = wheelWinnerId ? [wheelWinnerId] : results.winners;

  $("#results-vote-total").textContent = formatVoteCount(results.total);
  $("#results-question").textContent = round.question;
  $("#results-reason").textContent =
    round.revealReason === "timer" ? "Revealed by timer" : "Revealed by host";

  const bars = $("#host-result-bars");
  bars.replaceChildren();
  bars.classList.toggle("is-many", results.options.length > 4);

  let ordered = [...results.options].sort((a, b) => b.count - a.count);
  if (wheelWinnerId) {
    ordered = [
      ...ordered.filter((option) => option.optionId === wheelWinnerId),
      ...ordered.filter((option) => option.optionId !== wheelWinnerId),
    ];
  }

  ordered.forEach((option, index) => {
    const row = document.createElement("div");
    row.className = "host-result";
    row.dataset.color = option.color || "lime";
    row.style.setProperty("--i", String(index));
    if (displayWinners.includes(option.optionId)) row.classList.add("is-winner");

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
  } else if (wheelWinnerId) {
    const winner = results.options.find((option) => option.optionId === wheelWinnerId);
    const tiedLabels = results.winners
      .map((optionId) => results.options.find((option) => option.optionId === optionId)?.label)
      .filter(Boolean);
    tieNote.textContent = `The wheel broke the tie: ${winner?.label || "One answer"} wins.`;
    tieNote.hidden = false;
    note.textContent = `The wheel picked “${winner?.label || "one answer"}” from ${formatList(tiedLabels)}.`;
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
}

function buildWheelSvg(tiedOptions) {
  const ns = "http://www.w3.org/2000/svg";
  const size = 200;
  const center = size / 2;
  const radius = 96;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Tie-breaker wheel with " + tiedOptions.map((option) => option.label).join(", "));

  const slice = (Math.PI * 2) / tiedOptions.length;
  const styles = getComputedStyle(document.documentElement);

  tiedOptions.forEach((option, index) => {
    const start = -Math.PI / 2 + index * slice;
    const end = start + slice;
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const largeArc = slice > Math.PI ? 1 : 0;

    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      `M ${center} ${center} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
    );
    const color =
      styles.getPropertyValue(`--data-${option.color}`).trim() ||
      styles.getPropertyValue(`--${option.color}`).trim() ||
      "#e6b422";
    const ink = styles.getPropertyValue("--color-ink").trim() || "#1d3b32";
    const paper = styles.getPropertyValue("--color-paper").trim() || "#f6ecd7";
    const textInk =
      contrastRatio(color, ink) >= contrastRatio(color, paper) ? ink : paper;
    path.setAttribute("fill", color);
    path.setAttribute("stroke", ink);
    path.setAttribute("stroke-width", "1.2");
    svg.append(path);

    const mid = start + slice / 2;
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", (center + Math.cos(mid) * radius * 0.64).toFixed(2));
    text.setAttribute("y", (center + Math.sin(mid) * radius * 0.64).toFixed(2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("fill", textInk);
    text.setAttribute("font-family", "Golos Text, sans-serif");
    text.setAttribute("font-size", "13");
    text.setAttribute("font-weight", "600");
    text.textContent = LETTERS[index] || String(index + 1);
    svg.append(text);
  });

  return svg;
}

function renderWheelLegend(tiedOptions) {
  wheelLegend.replaceChildren();
  tiedOptions.forEach((option, index) => {
    const item = document.createElement("div");
    item.className = "wheel-legend-item";
    item.dataset.color = option.color || "lime";
    item.dataset.optionId = option.optionId;
    applyChoiceInk(item, item.dataset.color);

    const letter = document.createElement("span");
    letter.className = "wheel-legend-letter";
    letter.textContent = LETTERS[index] || String(index + 1);

    const label = document.createElement("span");
    label.className = "wheel-legend-label";
    label.textContent = option.label;

    item.append(letter, label);
    wheelLegend.append(item);
  });
}

function clearWheelTimers() {
  clearTimeout(wheelAutoTimer);
  wheelAutoTimer = null;
  clearTimeout(wheelFallbackTimer);
  wheelFallbackTimer = null;
  clearTimeout(wheelStopTimer);
  wheelStopTimer = null;
}

function revealWheelWinner(winnerId) {
  const winner = wheelOptions.find((option) => option.optionId === winnerId);
  if (!winner) return;
  wheelResult.textContent = `${winner.label} wins!`;
  wheelResult.hidden = false;
  wheelStatus.textContent = "The wheel has chosen.";
  wheelLegend.querySelectorAll(".wheel-legend-item").forEach((item) => {
    item.classList.toggle("is-winner", item.dataset.optionId === winnerId);
  });
}

function hideWheel() {
  clearWheelTimers();
  wheelOverlay.hidden = true;
  wheelIsOpen = false;
  wheelRoundId = null;
  wheelWinnerId = null;
  wheelSpinBusy = false;
  wheelOptions = [];
  wheelSpinButton.hidden = true;
  wheelResult.hidden = true;
  wheelResult.textContent = "";
  wheelLegend.replaceChildren();
  wheelDisc.classList.remove("is-waiting");
  wheelDisc.replaceChildren();
  wheelDisc.style.transition = "none";
  wheelDisc.style.transform = "rotate(0deg)";
}

function showWheel(round) {
  if (!round.tieBreak || round.tieBreak.status === "done") {
    hideWheel();
    return;
  }

  const tiedOptions = round.results.winners
    .map((optionId) => round.results.options.find((option) => option.optionId === optionId))
    .filter(Boolean);
  if (tiedOptions.length < 2) {
    hideWheel();
    return;
  }

  if (wheelRoundId !== round.id || !wheelIsOpen) {
    clearWheelTimers();
    wheelRoundId = round.id;
    wheelIsOpen = true;
    wheelWinnerId = null;
    wheelSpinBusy = false;
    wheelOptions = tiedOptions;
    wheelTitle.textContent = "The room is split.";
    wheelSubtitle.textContent = `One spin decides between ${formatList(tiedOptions.map((option) => option.label))}.`;
    wheelSpinButton.hidden = true;
    wheelResult.hidden = true;
    wheelResult.textContent = "";
    wheelLegend.replaceChildren();
    renderWheelLegend(tiedOptions);
    wheelDisc.replaceChildren(buildWheelSvg(tiedOptions));
    wheelDisc.classList.remove("is-waiting");
    wheelDisc.style.transition = "none";
    wheelDisc.style.transform = "rotate(0deg)";
    wheelOverlay.hidden = false;
    if (round.tieBreak.status === "ready") {
      wheelStatus.textContent = "Starting the wheel…";
      wheelAutoTimer = setTimeout(() => {
        wheelAutoTimer = null;
        spinWheel();
      }, 900);
    } else {
      wheelStatus.textContent = "Spinning…";
      wheelDisc.classList.add("is-waiting");
    }
  } else if (round.tieBreak.status === "spinning" && !wheelWinnerId) {
    clearTimeout(wheelAutoTimer);
    wheelAutoTimer = null;
    wheelStatus.textContent = "Spinning…";
    wheelDisc.classList.add("is-waiting");
  }
}

async function spinWheel() {
  if (!wheelIsOpen || wheelSpinBusy || wheelWinnerId) return;
  const spinningRoundId = wheelRoundId;
  clearTimeout(wheelAutoTimer);
  wheelAutoTimer = null;
  wheelSpinBusy = true;
  wheelSpinButton.hidden = true;
  wheelDisc.classList.remove("is-waiting");
  wheelStatus.textContent = "Spinning…";

  try {
    const result = await api("/api/host/tiebreak/spin", { method: "POST", body: {} });
    if (!wheelIsOpen || wheelRoundId !== spinningRoundId) return;
    wheelWinnerId = result.winnerOptionId;
    wheelDisc.classList.remove("is-waiting");
    const index = wheelOptions.findIndex((option) => option.optionId === wheelWinnerId);
    const slice = 360 / wheelOptions.length;
    const offset = 360 - ((index + 0.5) * slice) % 360;
    const rotation = 360 * 6 + offset;

    wheelDisc.style.transition = "none";
    wheelDisc.style.transform = "rotate(0deg)";
    void wheelDisc.offsetWidth;
    wheelDisc.style.transition = `transform ${WHEEL_ANIMATION_MS}ms cubic-bezier(0.08, 0.82, 0.12, 1)`;
    requestAnimationFrame(() => {
      wheelDisc.style.transform = `rotate(${rotation}deg)`;
    });

    clearTimeout(wheelStopTimer);
    wheelStopTimer = setTimeout(() => {
      wheelStopTimer = null;
      revealWheelWinner(wheelWinnerId);
    }, WHEEL_ANIMATION_MS + 120);

    wheelFallbackTimer = setTimeout(async () => {
      wheelFallbackTimer = null;
      try {
        const payload = await api("/api/host/state");
        if (payload?.state) applyState(payload.state);
      } catch {
        // The WebSocket state will catch up if this fails.
      }
    }, WHEEL_ANIMATION_MS + 3200);
  } catch (error) {
    if (!wheelIsOpen) return;
    wheelSpinBusy = false;
    wheelDisc.classList.remove("is-waiting");
    wheelStatus.textContent = error?.message || "Could not spin the wheel.";
    wheelSpinButton.hidden = false;
    wheelSpinButton.textContent = "Try again";
  }
}

function updateSessionControls(round) {
  const session = roundState?.session;
  const multi = Boolean(session && session.total > 1);
  nextQuestionButton.hidden = !multi;
  againButton.hidden = multi;
  newQuestionButton.hidden = multi;

  if (!multi) {
    resultsEyebrowHost.textContent = "That’s a wrap";
    return;
  }

  const last = session.index >= session.total;
  resultsEyebrowHost.textContent = last
    ? "Final question · that’s a wrap"
    : `Question ${session.index} of ${session.total}`;
  nextQuestionButton.textContent = last ? "Finish session" : "Next question";
  nextQuestionButton.dataset.finish = last ? "1" : "0";
  nextQuestionButton.disabled = Boolean(round.tieBreak && round.tieBreak.status !== "done");
}

function showResults(round) {
  setView("results");
  const tieBreak = round.tieBreak;
  const signature = [
    round.id,
    round.revealedAt || "",
    tieBreak?.status || "none",
    tieBreak?.winnerOptionId || "",
  ].join(":");

  if (renderedResultsSignature !== signature) {
    renderedResultsSignature = signature;
    buildHostResults(round);
  }

  updateSessionControls(round);

  if (tieBreak && tieBreak.status !== "done") {
    showWheel(round);
  } else {
    hideWheel();
  }
}

function updateSurveyTimer(survey) {
  if (!survey) return;
  if (survey.status === "closed") {
    surveyTimer.textContent = "Closed";
    return;
  }
  if (!survey.endsAt) {
    surveyTimer.textContent = "Manual";
    return;
  }
  const remaining = Math.max(0, survey.endsAt - (connection?.serverNow() ?? Date.now()));
  surveyTimer.textContent = remaining > 0 ? `Closes in ${formatClock(remaining)}` : "Closing…";
}

function showSurvey(survey) {
  setView("survey");
  const closed = survey.status === "closed";
  surveyStageEyebrow.textContent = closed ? "Survey closed" : "Live survey";
  surveyStageTitle.textContent = survey.title || "Room Check survey";
  const totalRespondents = survey.counts?.totalRespondents || 0;
  surveyTotal.textContent = formatVoteCount(totalRespondents);
  surveyTotalLabel.textContent = `${pluralize(totalRespondents, "person", "people")} answered`;
  surveyFinishButton.hidden = closed;
  surveyBackButton.textContent = closed ? "Back to setup" : "Start over";
  surveyFootnote.textContent = closed
    ? "Final response counts. The audience is on the thank-you screen."
    : "Counts update as people answer. No answer breakdown is shown here.";
  updateSurveyTimer(survey);

  surveyQuestionList.replaceChildren();
  survey.questions.forEach((question, index) => {
    const count = survey.counts?.questions?.[question.id] || 0;
    const row = document.createElement("div");
    row.className = "survey-question-row";

    const number = document.createElement("span");
    number.className = "survey-question-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "survey-question-copy";
    const label = document.createElement("strong");
    label.textContent = question.question;
    const meta = document.createElement("span");
    meta.textContent = `${formatVoteCount(count)} ${pluralize(count, "person", "people")} answered`;
    copy.append(label, meta);

    const countLabel = document.createElement("strong");
    countLabel.className = "survey-question-count";
    countLabel.textContent = formatVoteCount(count);

    row.append(number, copy, countLabel);
    surveyQuestionList.append(row);
  });
}

function showEnded() {
  hideWheel();
  endSessionButton.hidden = true;
  const qrSrc = qrImageUrl(GITHUB_URL);
  if (githubQr.getAttribute("src") !== qrSrc) githubQr.src = qrSrc;
  setView("ended");
}

function applyState(state) {
  if (!document.body.classList.contains("customizer-open")) applyTheme(state?.theme);
  const incomingNow = Number(state?.now) || 0;
  if (incomingNow && incomingNow < lastStateNow) return;
  lastStateNow = Math.max(lastStateNow, incomingNow);
  if (connection) connection.syncServerTime(state);

  if (state.survey) {
    hideWheel();
    roundState = state;
    endSessionButton.hidden = state.survey.status !== "open";
    showSurvey(state.survey);
    return;
  }

  const round = state.round;
  const previousStatus = roundState?.round?.status || null;
  const previousTieStatus = roundState?.round?.tieBreak?.status || null;
  const previousSession = roundState?.session || lastSession;
  if (state.session) lastSession = state.session;

  if (!round) {
    const hadRound = Boolean(roundState?.round);
    const wasMultiSession = (previousSession?.total || 0) > 1;
    roundState = state;

    if (state.closed) {
      showEnded();
      return;
    }

    hideWheel();
    endSessionButton.hidden = false;

    if (
      currentView === "boot" ||
      currentView === "ended" ||
      currentView === "survey" ||
      hadRound
    ) {
      if (wasMultiSession) {
        populateSetup();
      } else if (lastRound) {
        populateSetupFromRound(lastRound);
      } else {
        populateSetup();
      }
      setView("setup");
    }
    return;
  }

  endSessionButton.hidden = false;

  if (round.mode === "hands") {
    hideWheel();
    roundState = state;
    lastRound = round;
    showStage(round);
    return;
  }

  const isNewReveal = round.status === "revealed" && previousStatus === "open";

  if (round.status === "open") {
    hideWheel();
    roundState = state;
    lastRound = round;
    showStage(round);
    return;
  }

  roundState = state;
  lastRound = round;
  showResults(round);

  const justResolvedTie = round.tieBreak?.status === "done" && previousTieStatus && previousTieStatus !== "done";
  const canCelebrate = isNewReveal
    ? !round.tieBreak || round.tieBreak.status === "done"
    : justResolvedTie;

  if (canCelebrate && celebratedRoundId !== round.id) {
    celebratedRoundId = round.id;
    launchConfetti(confettiCanvas);
  }
}

function startClock() {
  stopClock();
  clockTimer = setInterval(() => {
    if (roundState?.survey) {
      updateSurveyTimer(roundState.survey);
      return;
    }
    if (roundState?.round?.status === "open" && roundState?.round?.mode !== "hands") {
      updateTimer(roundState.round);
    }
  }, 250);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
}

function updateTimer(round) {
  if (!round || round.mode === "hands" || round.status !== "open") return;
  timerDial.hidden = false;

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

async function closeHands() {
  if (actionInFlight || roundState?.round?.mode !== "hands" || roundState?.round?.status !== "open") return;
  actionInFlight = true;
  setActionBusy(revealButton, true, "Closing…");
  try {
    const result = await api("/api/host/hands/close", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(revealButton, false);
  }
}

async function revealResults() {
  if (roundState?.round?.mode === "hands") {
    await closeHands();
    return;
  }
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

function prepareQuestionForStart(index) {
  const question = draftQuestions[index];
  const prompt = question?.question?.trim() || "";
  const labels = (question?.options || []).map((label) => label.trim()).filter(Boolean);

  if (!prompt) {
    switchQuestion(index);
    showToast(toast, `Question ${index + 1} needs a prompt.`, 3500);
    questionInput.focus();
    return null;
  }

  if (labels.length < 2) {
    switchQuestion(index);
    showToast(toast, `Question ${index + 1} needs at least two answers.`, 3500);
    return null;
  }

  const unique = new Set(labels.map((label) => label.toLocaleLowerCase()));
  if (unique.size !== labels.length) {
    switchQuestion(index);
    showToast(toast, `Question ${index + 1}: each answer needs to be different.`, 3500);
    return null;
  }

  return {
    question: prompt,
    options: labels,
    durationSec: Number(question.durationSec) || 0,
    spinOnTie: question.spinOnTie !== false,
  };
}

async function startRound(event) {
  event.preventDefault();
  if (actionInFlight) return;

  captureActiveQuestion();
  const mode = readMode();
  const multi = mode === "poll" && multiQuestionToggle.checked;
  const prepared = [];

  if (mode === "poll") {
    const indexes = multi
      ? draftQuestions.map((_, index) => index)
      : [activeQuestionIndex];
    for (const index of indexes) {
      const question = prepareQuestionForStart(index);
      if (!question) return;
      prepared.push(question);
    }
  } else if (!questionInput.value.trim()) {
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
  setActionBusy(button, true, mode === "poll" && multi ? "Starting…" : "Opening…");

  try {
    const title = titleInput.value.trim();
    const result =
      mode === "poll" && multi
        ? await api("/api/host/survey/start", {
            method: "POST",
            body: { title, questions: prepared, durationSec: readSurveyDuration() },
          })
        : await api("/api/host/open", {
            method: "POST",
            body:
              mode === "poll"
                ? {
                    mode: "poll",
                    title,
                    ...prepared[0],
                  }
                : {
                    mode: "hands",
                    title,
                    question: questionInput.value.trim(),
                    options: [],
                    durationSec: 0,
                    spinOnTie: false,
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
  const hands = roundState?.round?.mode === "hands";
  const multi = (roundState?.session?.total || 0) > 1;
  const message = hands
    ? "Close the live-hands round and start over? The raised-hand count will be discarded."
    : multi
      ? "Close this multi-question session and start over? The current question’s votes will be discarded."
      : "Close this round and start over? Any votes in this round will be discarded.";
  if (!window.confirm(message)) return;
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
        spinOnTie: lastRound.spinOnTie !== false,
        mode: "poll",
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

async function finishSurvey() {
  if (actionInFlight || !roundState?.survey || roundState.survey.status !== "open") return;
  if (!window.confirm("Finish the survey? The audience will see the thank-you screen.")) return;
  actionInFlight = true;
  setActionBusy(surveyFinishButton, true, "Finishing…");
  try {
    const result = await api("/api/host/end", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(surveyFinishButton, false);
  }
}

async function surveyBackToSetup() {
  if (actionInFlight) return;
  if (
    roundState?.survey?.status === "open" &&
    !window.confirm("Close this survey and discard the responses?")
  ) {
    return;
  }
  await resetToSetup();
}

async function nextSessionQuestion() {
  if (actionInFlight) return;
  const session = roundState?.session;
  if (!session || session.total < 2) return;

  const last = session.index >= session.total;
  if (last) {
    if (
      !window.confirm(
        "Finish the session? The audience will see the thank-you screen with the GitHub link.",
      )
    ) {
      return;
    }
  }

  actionInFlight = true;
  setActionBusy(nextQuestionButton, true, last ? "Finishing…" : "Opening…");
  try {
    const result = last
      ? await api("/api/host/end", { method: "POST", body: {} })
      : await api("/api/host/session/next", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    actionInFlight = false;
    setActionBusy(nextQuestionButton, false);
    if (roundState?.round) updateSessionControls(roundState.round);
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
  loadUpdateNotice();
  startClock();
  if (currentView === "setup") questionInput.focus();
}

async function loadUpdateNotice() {
  if (!updateNotice || !updateNoticeTitle || !updateNoticeCopy) return;
  try {
    const payload = await api("/api/update");
    const update = payload?.update;
    if (!update?.updateAvailable || !update.latestVersion) {
      updateNotice.hidden = true;
      return;
    }
    if (localStorage.getItem(UPDATE_DISMISSED_KEY) === update.latestVersion) {
      updateNotice.hidden = true;
      return;
    }
    updateNotice.dataset.version = update.latestVersion;
    updateNoticeTitle.textContent = `Room Check ${update.latestVersion} is available.`;
    updateNoticeCopy.textContent =
      "A newer release is ready. Review the update instructions before changing this install.";
    updateNotice.hidden = false;
  } catch {
    updateNotice.hidden = true;
  }
}

async function init() {
  await loadTheme();
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

initCustomizer();

updateDismiss?.addEventListener("click", () => {
  if (updateNotice?.dataset.version) {
    localStorage.setItem(UPDATE_DISMISSED_KEY, updateNotice.dataset.version);
  }
  if (updateNotice) updateNotice.hidden = true;
});

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
  if (draftQuestions[activeQuestionIndex]) {
    draftQuestions[activeQuestionIndex].question = questionInput.value;
  }
  updateQuestionBuilder();
  debounceSaveDraft();
});
titleInput.addEventListener("input", debounceSaveDraft);
spinOnTieInput.addEventListener("change", () => {
  if (draftQuestions[activeQuestionIndex]) {
    draftQuestions[activeQuestionIndex].spinOnTie = spinOnTieInput.checked;
  }
  debounceSaveDraft();
});

$("#timer-choices").addEventListener("change", () => {
  if (draftQuestions[activeQuestionIndex]) {
    draftQuestions[activeQuestionIndex].durationSec = readDuration();
  }
  updateQuestionBuilder();
  debounceSaveDraft();
});

surveyTimerChoices.addEventListener("change", () => {
  debounceSaveDraft();
});

modeChoices.addEventListener("change", () => {
  syncModeUI();
  debounceSaveDraft();
});

multiQuestionToggle.addEventListener("change", () => {
  if (!multiQuestionToggle.checked) {
    captureActiveQuestion();
    if (activeQuestionIndex !== 0) {
      activeQuestionIndex = 0;
      loadActiveQuestion();
    }
  }
  updateQuestionBuilder();
  saveDraft();
});

importQuestionsInput.addEventListener("change", () => {
  importQuestionsFile(importQuestionsInput.files?.[0]);
});

addOptionButton.addEventListener("click", () => {
  if (options.length >= MAX_OPTIONS) return;
  options.push({ label: "" });
  renderOptionEditor(options.length - 1);
  if (draftQuestions[activeQuestionIndex]) {
    draftQuestions[activeQuestionIndex].options = options.map((option) => option.label);
  }
  updateQuestionBuilder();
  debounceSaveDraft();
});

addQuestionButton.addEventListener("click", addQuestion);
removeQuestionButton.addEventListener("click", removeActiveQuestion);

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
wheelSpinButton.addEventListener("click", spinWheel);
$("#cancel-round-button").addEventListener("click", askReset);
againButton.addEventListener("click", playAgain);
newQuestionButton.addEventListener("click", newQuestion);
nextQuestionButton.addEventListener("click", nextSessionQuestion);
surveyFinishButton.addEventListener("click", finishSurvey);
surveyBackButton.addEventListener("click", surveyBackToSetup);
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

endSessionButton.addEventListener("click", async () => {
  if (
    !window.confirm(
      "End the session? The audience will see a thank-you screen with the GitHub link.",
    )
  ) {
    return;
  }
  endSessionButton.disabled = true;
  try {
    const result = await api("/api/host/end", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    endSessionButton.disabled = false;
  }
});

endedBackButton.addEventListener("click", async () => {
  endedBackButton.disabled = true;
  try {
    const result = await api("/api/host/reset", { method: "POST", body: {} });
    applyState(result.state);
  } catch (error) {
    handleActionError(error);
  } finally {
    endedBackButton.disabled = false;
  }
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
    if (roundState?.round?.mode === "poll") {
      event.preventDefault();
      revealResults();
    }
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
