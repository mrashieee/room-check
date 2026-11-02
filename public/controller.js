/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { loadTheme } from "./theme.js";

const title = document.querySelector("#controller-title");
const stateLabel = document.querySelector("#controller-state");
const note = document.querySelector("#controller-note");
const tabs = document.querySelector("#controller-tabs");
const pollForm = document.querySelector("#controller-poll-form");
const pollQuestion = document.querySelector("#controller-poll-question");
const pollOptions = document.querySelector("#controller-poll-options");
const pollAddOption = document.querySelector("#controller-add-option");
const pollDuration = document.querySelector("#controller-poll-duration");
const spinOnTie = document.querySelector("#controller-spin-on-tie");
const pollStart = document.querySelector("#controller-poll-start");
const handsForm = document.querySelector("#controller-hands-form");
const handsQuestion = document.querySelector("#controller-hands-question");
const handsStart = document.querySelector("#controller-hands-start");
const interaction = document.querySelector("#controller-interaction");
const interactionKind = document.querySelector("#controller-interaction-kind");
const interactionQuestion = document.querySelector("#controller-interaction-question");
const interactionCount = document.querySelector("#controller-interaction-count");
const interactionResults = document.querySelector("#controller-results");
const interactionAction = document.querySelector("#controller-interaction-action");
const interactionTiebreak = document.querySelector("#controller-interaction-tiebreak");
const interactionTimer = document.querySelector("#controller-interaction-timer");
const interactionBack = document.querySelector("#controller-interaction-back");
const loginPanel = document.querySelector("#controller-login");
const passwordInput = document.querySelector("#controller-password");
const loginButton = document.querySelector("#controller-login-submit");
const loginError = document.querySelector("#controller-login-error");
const livePanel = document.querySelector("#controller-live");
const slidePanel = document.querySelector("#controller-slide-panel");
const slideImage = document.querySelector("#controller-slide-image");
const counter = document.querySelector("#controller-counter");
const fitWidthButton = document.querySelector("#controller-fit-width");
const fitPageButton = document.querySelector("#controller-fit-page");
const prevButton = document.querySelector("#controller-prev");
const nextButton = document.querySelector("#controller-next");
const rotateButton = document.querySelector("#controller-rotate");
const endSessionButton = document.querySelector("#controller-end-session");
const slideList = document.querySelector("#controller-list");

const token = new URLSearchParams(location.search).get("token") || "";
let presentation = null;
let round = null;
let survey = null;
let activeTab = "slides";
let pollTimer = null;
let roundTimer = null;
let scrollTimer = null;
let scrollInFlight = false;
let pendingScroll = null;
let lastScrollRatio = 0;
let renderedScrollSlideKey = "";
let controlBusy = false;

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Controller-Token": token } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // No body.
  }
  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function pollOptionValues() {
  return Array.from(pollOptions.querySelectorAll("input")).map((input) => input.value);
}

function renderPollOptionInputs(values = null) {
  const current = values || pollOptionValues();
  const next = current.length >= 2 ? current : ["", ""];
  pollOptions.replaceChildren();
  next.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "controller-option-row";
    const input = document.createElement("input");
    input.className = "text-input";
    input.type = "text";
    input.maxLength = 52;
    input.placeholder = `Answer ${index + 1}`;
    input.value = value;
    input.autocomplete = "off";
    row.append(input);
    if (next.length > 2) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "controller-option-remove";
      remove.setAttribute("aria-label", `Remove answer ${index + 1}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        renderPollOptionInputs(pollOptionValues().filter((_, itemIndex) => itemIndex !== index));
      });
      row.append(remove);
    }
    pollOptions.append(row);
  });
  pollAddOption.disabled = next.length >= 10;
}

function clearRoundTimer() {
  if (roundTimer) clearInterval(roundTimer);
  roundTimer = null;
  interactionTimer.hidden = true;
  interactionTimer.textContent = "";
}

function updateRoundTimer(round) {
  if (!round?.endsAt) {
    clearRoundTimer();
    return;
  }
  const remaining = Math.max(0, round.endsAt - Date.now());
  if (!remaining) {
    clearRoundTimer();
    return;
  }
  const total = Math.ceil(remaining / 1000);
  interactionTimer.hidden = false;
  interactionTimer.textContent = `Closes in ${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function startRoundTimer(round) {
  clearRoundTimer();
  if (!round?.endsAt) return;
  updateRoundTimer(round);
  roundTimer = setInterval(() => updateRoundTimer(round), 500);
}

function setState(label) {
  stateLabel.textContent = label;
}

function setTab(tab) {
  activeTab = tab;
  render();
}

function renderTabs() {
  const live = presentation?.status === "live";
  const currentTab = round?.mode === "poll" || round?.mode === "hands" ? round.mode : activeTab;
  tabs.hidden = !live;
  tabs.querySelectorAll("[data-tab]").forEach((button) => {
    const isActive = button.dataset.tab === currentTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function render() {
  renderTabs();
  pollForm.hidden = true;
  handsForm.hidden = true;
  interaction.hidden = true;
  livePanel.hidden = true;
  endSessionButton.hidden = !presentation || presentation.status !== "live";

  if (!presentation) {
    title.textContent = "Controller";
    setState("Waiting");
    note.textContent = "Waiting for the projector to open a presentation.";
    return;
  }

  title.textContent = presentation.title || "Controller";
  if (presentation.status === "ready") {
    setState("Ready");
    note.textContent = "The deck is ready. Start it from the projector screen.";
    return;
  }
  if (presentation.status === "closed") {
    setState("Ended");
    note.textContent = "This presentation has ended.";
    return;
  }

  setState("Live");
  if (survey) {
    clearRoundTimer();
    renderSurveyInteraction();
    return;
  }
  if (round) {
    renderInteraction();
    return;
  }
  clearRoundTimer();

  note.textContent =
    activeTab === "slides"
      ? "You are controlling the projector."
      : "Prepare a quick interaction.";
  if (activeTab === "poll") {
    pollForm.hidden = false;
  } else if (activeTab === "hands") {
    handsForm.hidden = false;
  } else {
    livePanel.hidden = false;
    renderSlides();
  }
}

function renderSlides() {
  const index = Math.min(
    Math.max(Number(presentation.currentIndex) || 0, 0),
    Math.max(0, presentation.slides.length - 1),
  );
  const slide = presentation.slides[index];
  if (slide) {
    if (slideImage.getAttribute("src") !== slide.src) slideImage.src = slide.src;
    slideImage.alt = slide.name || `Slide ${index + 1}`;
    slideImage.style.transform = `rotate(${Number(slide.rotation) || 0}deg)`;
    slidePanel.dataset.fit = presentation.fitMode === "page" ? "page" : "width";
    counter.textContent = `${index + 1} / ${presentation.slides.length}`;
    const scrollKey = `${slide.id}:${presentation.fitMode}:${slide.rotation || 0}`;
    if (renderedScrollSlideKey !== scrollKey) {
      renderedScrollSlideKey = scrollKey;
      clearTimeout(scrollTimer);
      pendingScroll = null;
      requestAnimationFrame(applyControllerScroll);
    }
  }
  fitWidthButton.classList.toggle("is-active", presentation.fitMode !== "page");
  fitPageButton.classList.toggle("is-active", presentation.fitMode === "page");
  fitWidthButton.setAttribute("aria-pressed", presentation.fitMode !== "page" ? "true" : "false");
  fitPageButton.setAttribute("aria-pressed", presentation.fitMode === "page" ? "true" : "false");
  prevButton.disabled = index === 0 || controlBusy;
  nextButton.disabled = index >= presentation.slides.length - 1 || controlBusy;
  renderSlideList(index);
}

function applyControllerScroll() {
  if (!presentation) return;
  const max = slidePanel.scrollHeight - slidePanel.clientHeight;
  if (presentation.fitMode === "page" || max <= 0) {
    slidePanel.scrollTop = 0;
    lastScrollRatio = 0;
    return;
  }
  const ratio = Math.min(1, Math.max(0, Number(presentation.scroll) || 0));
  slidePanel.scrollTop = Math.round(ratio * max);
  lastScrollRatio = ratio;
}

async function sendScroll(ratio) {
  if (scrollInFlight) {
    pendingScroll = ratio;
    return;
  }
  scrollInFlight = true;
  try {
    const payload = await request("/api/presentation/control", {
      method: "POST",
      body: JSON.stringify({
        action: "scroll",
        scroll: ratio,
        index: presentation?.currentIndex ?? 0,
      }),
    });
    presentation = payload.presentation;
  } catch {
    // A dropped scroll frame is not worth interrupting the controller.
  } finally {
    scrollInFlight = false;
    if (pendingScroll !== null) {
      const next = pendingScroll;
      pendingScroll = null;
      sendScroll(next);
    }
  }
}

function queueScroll() {
  if (!presentation || presentation.status !== "live" || presentation.fitMode === "page") return;
  const max = slidePanel.scrollHeight - slidePanel.clientHeight;
  if (max <= 0) return;
  const ratio = Math.min(1, Math.max(0, slidePanel.scrollTop / max));
  if (Math.abs(ratio - lastScrollRatio) < 0.004) return;
  lastScrollRatio = ratio;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => sendScroll(ratio), 70);
}

function renderSlideList(currentIndex) {
  if (slideList.childElementCount !== (presentation?.slides?.length || 0)) {
    slideList.replaceChildren();
    for (const [index, slide] of presentation.slides.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "controller-slide-button";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `Open slide ${index + 1}: ${slide.name}`);
      const image = document.createElement("img");
      image.src = slide.src;
      image.alt = "";
      button.append(image);
      button.addEventListener("click", () => control("goto", index));
      slideList.append(button);
    }
  }
  slideList.querySelectorAll(".controller-slide-button").forEach((button) => {
    button.classList.toggle("is-current", Number(button.dataset.index) === currentIndex);
  });
}

function renderSurveyInteraction() {
  interaction.hidden = false;
  interactionKind.textContent = survey.status === "closed" ? "Survey closed" : "Survey live";
  interactionQuestion.textContent = survey.title || "Survey";
  interactionCount.textContent = `${survey.questions?.length || 0} ${(survey.questions?.length || 0) === 1 ? "question" : "questions"}`;
  interactionResults.replaceChildren();
  interactionAction.hidden = true;
  interactionBack.hidden = false;
  interactionBack.textContent = "Back to slides";
}

function renderInteraction() {
  interaction.hidden = false;
  interactionQuestion.textContent = round.question;
  interactionResults.replaceChildren();
  interactionAction.hidden = false;
  interactionBack.hidden = false;

  if (round.mode === "hands") {
    clearRoundTimer();
    interactionTiebreak.hidden = true;
    const closed = round.status === "closed";
    interactionKind.textContent = closed ? "Hands closed" : "Hands live";
    interactionCount.textContent = `${round.raisedCount || 0} hands ${closed ? "raised" : "up"}`;
    interactionAction.textContent = "Close hands";
    interactionAction.hidden = closed;
    interactionBack.textContent = "Back to slides";
    return;
  }

  const revealed = round.status === "revealed";
  interactionKind.textContent =
    round.tieBreak?.status === "spinning" ? "Tie-breaker spinning" : revealed ? "Poll results" : "Poll live";
  interactionCount.textContent = `${round.totalVotes || 0} votes in`;
  interactionAction.textContent = "Reveal results";
  interactionAction.hidden = revealed;
  interactionBack.textContent = "Back to slides";
  if (!revealed) {
    startRoundTimer(round);
    interactionTiebreak.hidden = true;
    return;
  }

  clearRoundTimer();
  const tieReady =
    round.spinOnTie &&
    (round.results?.winners?.length || 0) > 1 &&
    round.tieBreak?.status !== "done" &&
    round.tieBreak?.status !== "spinning";
  interactionTiebreak.hidden = !tieReady;
  interactionTiebreak.disabled = round.tieBreak?.status === "spinning";
  const tieWinner = round.tieBreak?.status === "done" ? round.tieBreak.winnerOptionId : null;
  const ordered = [...(round.results?.options || [])].sort((a, b) => b.count - a.count);
  for (const option of ordered) {
    const row = document.createElement("div");
    row.className = "controller-result-row";
    row.dataset.color = option.color || "lime";
    row.classList.toggle("is-winner", option.optionId === tieWinner);
    const label = document.createElement("span");
    label.textContent = option.label;
    const value = document.createElement("strong");
    value.textContent = `${option.count} · ${option.percent}%`;
    const track = document.createElement("div");
    track.className = "controller-result-track";
    const fill = document.createElement("span");
    fill.style.width = `${option.percent}%`;
    track.append(fill);
    row.append(label, value, track);
    interactionResults.append(row);
  }
}

async function refresh() {
  try {
    const payload = await request("/api/controller/state");
    presentation = payload.state?.presentation || null;
    round = payload.state?.round || null;
    survey = payload.state?.survey || null;
    render();
  } catch {
    note.textContent = "Could not reach the projector. Keep this page open.";
  }
}

async function control(action, index, fitMode) {
  if (controlBusy) return;
  controlBusy = true;
  prevButton.disabled = true;
  nextButton.disabled = true;
  try {
    const payload = await request("/api/presentation/control", {
      method: "POST",
      body: JSON.stringify({ action, index, fitMode }),
    });
    presentation = payload.presentation;
    render();
  } catch (error) {
    if (error.status === 401) {
      note.textContent = token
        ? "This controller pairing expired. Scan the projector QR again."
        : "Enter the host password to pair this controller.";
      if (!token) loginPanel.hidden = false;
    } else {
      note.textContent = error?.message || "Could not control the presentation.";
    }
  } finally {
    controlBusy = false;
    render();
  }
}

async function startPoll() {
  const question = pollQuestion.value.trim();
  const options = Array.from(pollOptions.querySelectorAll("input"))
    .map((input) => input.value.trim())
    .filter(Boolean);
  if (!question) {
    note.textContent = "Write a poll question.";
    return;
  }
  if (options.length < 2) {
    note.textContent = "Add at least two answers.";
    return;
  }
  pollStart.disabled = true;
  try {
    await request("/api/presentation/interaction", {
      method: "POST",
      body: JSON.stringify({
        mode: "poll",
        title: presentation.title,
        question,
        options,
        durationSec: Number(pollDuration.value) || 0,
        spinOnTie: spinOnTie.checked,
      }),
    });
    await refresh();
  } catch (error) {
    note.textContent = error?.message || "Could not open the poll.";
  } finally {
    pollStart.disabled = false;
  }
}

async function startHands() {
  const question = handsQuestion.value.trim();
  if (!question) {
    note.textContent = "Write a question for Live Hands.";
    return;
  }
  handsStart.disabled = true;
  try {
    await request("/api/presentation/interaction", {
      method: "POST",
      body: JSON.stringify({ mode: "hands", title: presentation.title, question }),
    });
    await refresh();
  } catch (error) {
    note.textContent = error?.message || "Could not open Live Hands.";
  } finally {
    handsStart.disabled = false;
  }
}

async function spinTiebreak() {
  if (controlBusy) return;
  controlBusy = true;
  interactionTiebreak.disabled = true;
  try {
    await request("/api/presentation/interaction/tiebreak", { method: "POST" });
    await refresh();
  } catch (error) {
    note.textContent = error?.message || "Could not spin the tie-breaker.";
  } finally {
    controlBusy = false;
    render();
  }
}

async function handleInteractionAction() {
  if (!round || controlBusy) return;
  controlBusy = true;
  try {
    if (round.mode === "hands") {
      await request("/api/presentation/interaction/close-hands", { method: "POST" });
    } else {
      await request("/api/presentation/interaction/reveal", { method: "POST" });
    }
    await refresh();
  } catch (error) {
    note.textContent = error?.message || "Could not update the interaction.";
  } finally {
    controlBusy = false;
    render();
  }
}

async function endInteraction() {
  if (controlBusy) return;
  controlBusy = true;
  try {
    await request("/api/presentation/interaction/end", { method: "POST" });
    activeTab = "slides";
    clearRoundTimer();
    await refresh();
  } catch (error) {
    note.textContent = error?.message || "Could not return to slides.";
  } finally {
    controlBusy = false;
    render();
  }
}

async function endPresentationSession() {
  if (!presentation || presentation.status !== "live" || controlBusy) return;
  if (!window.confirm("End the presentation for everyone?")) return;
  controlBusy = true;
  endSessionButton.disabled = true;
  try {
    const payload = await request("/api/presentation/end", { method: "POST" });
    presentation = payload.presentation || (presentation ? { ...presentation, status: "closed" } : null);
    round = null;
    survey = null;
    clearRoundTimer();
    location.href = "/thanks-host";
    return;
  } catch (error) {
    note.textContent = error?.message || "Could not end the session.";
  } finally {
    controlBusy = false;
    endSessionButton.disabled = false;
    render();
  }
}

async function login() {
  loginError.hidden = true;
  loginButton.disabled = true;
  const original = loginButton.textContent;
  loginButton.textContent = "Checking…";
  try {
    await request("/api/host/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value }),
    });
    loginPanel.hidden = true;
    await refresh();
  } catch (error) {
    loginError.textContent = error?.message || "That password is not right.";
    loginError.hidden = false;
    passwordInput.select();
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = original;
  }
}

prevButton.addEventListener("click", () => control("prev"));
nextButton.addEventListener("click", () => control("next"));
rotateButton.addEventListener("click", () => control("rotate"));
fitWidthButton.addEventListener("click", () => control("fit", undefined, "width"));
fitPageButton.addEventListener("click", () => control("fit", undefined, "page"));
slidePanel.addEventListener("scroll", queueScroll, { passive: true });
slideImage.addEventListener("load", () => requestAnimationFrame(applyControllerScroll));
pollAddOption.addEventListener("click", () => {
  const values = pollOptionValues();
  if (values.length < 10) renderPollOptionInputs([...values, ""]);
});
pollStart.addEventListener("click", startPoll);
handsStart.addEventListener("click", startHands);
interactionAction.addEventListener("click", handleInteractionAction);
interactionTiebreak.addEventListener("click", spinTiebreak);
interactionBack.addEventListener("click", endInteraction);
endSessionButton.addEventListener("click", endPresentationSession);
tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button || round) return;
  setTab(button.dataset.tab);
});
loginButton.addEventListener("click", login);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  location.href = "/present";
});

async function init() {
  await loadTheme();
  renderPollOptionInputs(["", ""]);
  if (!token) {
    try {
      const auth = await request("/api/host/me");
      if (!auth.authed) loginPanel.hidden = false;
    } catch {
      loginPanel.hidden = false;
    }
  }
  await refresh();
  pollTimer = setInterval(refresh, 1000);
}

window.addEventListener("beforeunload", () => clearInterval(pollTimer));
init();
