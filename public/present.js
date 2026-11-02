/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { formatVoteCount, pluralize } from "./common.js";
import { loadTheme } from "./theme.js";

const authView = document.querySelector("#present-auth");
const setupView = document.querySelector("#present-setup");
const displayView = document.querySelector("#present-display");
const titleInput = document.querySelector("#present-title");
const fileInput = document.querySelector("#present-files");
const pickButton = document.querySelector("#present-pick");
const statusLine = document.querySelector("#present-status");
const slideList = document.querySelector("#slide-list");
const startButton = document.querySelector("#present-start");
const resumeButton = document.querySelector("#present-resume");
const discardButton = document.querySelector("#present-discard");
const qrPanel = document.querySelector("#present-qr-panel");
const qrImage = document.querySelector("#present-qr");
const qrUrl = document.querySelector("#present-qr-url");
const copyController = document.querySelector("#present-copy");
const slideWrap = document.querySelector(".present-slide-wrap");
const displaySlide = document.querySelector("#present-slide");
const displayLabel = document.querySelector("#present-display-label");
const interactionView = document.querySelector("#present-interaction");
const interactionChip = document.querySelector("#present-interaction-chip");
const interactionState = document.querySelector("#present-interaction-state");
const interactionMeta = document.querySelector("#present-interaction-meta");
const interactionQuestion = document.querySelector("#present-interaction-question");
const interactionLede = document.querySelector("#present-interaction-lede");
const interactionCount = document.querySelector("#present-interaction-count");
const interactionCountLabel = document.querySelector("#present-interaction-count-label");
const interactionDetail = document.querySelector("#present-interaction-detail");
const interactionTimer = document.querySelector("#present-interaction-timer");
const interactionOptions = document.querySelector("#present-interaction-options");
const interactionResults = document.querySelector("#present-interaction-results");
const interactionCustom = document.querySelector("#present-interaction-custom");
const prevButton = document.querySelector("#present-prev");
const nextButton = document.querySelector("#present-next");
const rotateButton = document.querySelector("#present-rotate");
const fitButton = document.querySelector("#present-fit");
const backButton = document.querySelector("#present-back");
const fullscreenButton = document.querySelector("#present-fullscreen");
const headerFullscreenButton = document.querySelector("#present-header-fullscreen");
const endSessionButton = document.querySelector("#present-end-session");
const lockButton = document.querySelector("#present-lock");
const stopButton = document.querySelector("#present-stop");

let presentation = null;
let round = null;
let survey = null;
let controllerToken = "";
let controllerBase = location.origin;
let stateTimer = null;
let uploading = false;
let displayDismissed = false;
let fitMode = "width";

function setStatus(message, { error = false } = {}) {
  statusLine.textContent = message;
  statusLine.dataset.state = error ? "error" : "info";
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some endpoints return no body.
  }
  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function applyPresentation(next) {
  presentation = next;
  if (!presentation) {
    setStatus("Add images or a PDF to build the deck.");
    titleInput.value = "Presentation";
    slideList.replaceChildren();
    startButton.disabled = true;
    qrPanel.hidden = true;
    return;
  }
  titleInput.value = presentation.title || "Presentation";
  fitMode = presentation.fitMode === "page" ? "page" : "width";
  applyFitMode();
  renderSlides();
  if (!presentation.slides.length) {
    setStatus("No slides yet. Add images or a PDF above.");
  }
  startButton.disabled = presentation.slides.length === 0 || presentation.status === "live";
  resumeButton.hidden = !(presentation.status === "live" && displayView.hidden);
  qrPanel.hidden = !controllerToken;
  if (controllerToken) {
    const url = `${controllerBase}/controller?token=${encodeURIComponent(controllerToken)}`;
    qrUrl.textContent = url.replace(/^https?:\/\//, "");
    qrUrl.dataset.url = url;
    qrImage.src = `/api/qr?data=${encodeURIComponent(url)}`;
  }
}

function renderSlides() {
  slideList.replaceChildren();
  if (!presentation?.slides?.length) {
    const empty = document.createElement("p");
    empty.className = "slide-empty";
    empty.textContent = "No slides yet. Add images or a PDF above.";
    slideList.append(empty);
    return;
  }
  for (const [index, slide] of (presentation?.slides || []).entries()) {
    const row = document.createElement("div");
    row.className = "slide-row";
    const image = document.createElement("img");
    image.src = slide.src;
    image.alt = "";
    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${slide.name}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${slide.name}`);
    remove.addEventListener("click", () => removeSlide(slide.id));
    row.append(image, name, remove);
    slideList.append(row);
  }
}

async function refreshPresentation() {
  const payload = await request("/api/host/presentation/state");
  controllerToken = payload.token || "";
  applyPresentation(payload.presentation);
  if (presentation?.status === "live") {
    showDisplay();
  }
}

async function createOrRefreshPresentation({ forStart = false } = {}) {
  if (presentation?.status === "closed" && forStart) return;
  if (!presentation) {
    const payload = await request("/api/host/presentation/create", {
      method: "POST",
      body: JSON.stringify({ title: titleInput.value.trim() || "Presentation" }),
    });
    controllerToken = payload.token || "";
    presentation = payload.presentation;
  } else if (presentation.status === "closed") {
    const reopened = await request("/api/host/presentation/reopen", { method: "POST" });
    controllerToken = reopened.token || controllerToken;
    presentation = reopened.presentation;
  }
  if (presentation.status === "ready") {
    const payload = await request("/api/host/presentation/title", {
      method: "POST",
      body: JSON.stringify({ title: titleInput.value.trim() || "Presentation" }),
    });
    controllerToken = payload.token || controllerToken;
    presentation = payload.presentation;
  }
  applyPresentation(presentation);
}

async function uploadSlide(blob, name) {
  const response = await fetch("/api/host/presentation/slides", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": blob.type || "image/png",
      "X-Slide-Name": encodeURIComponent(name),
    },
    body: blob,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // No body.
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Upload failed with server status ${response.status}.`);
  }
  presentation = payload.presentation;
  controllerToken = payload.token || controllerToken;
  applyPresentation(presentation);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function looksLikeImage(file) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
}

async function prepareImage(file) {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (allowed.includes(file.type) && file.size <= 25 * 1024 * 1024) return file;
  if (!looksLikeImage(file)) {
    throw new Error(`${file.name} is not a supported image. Use JPG, PNG or WebP.`);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Could not prepare that photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    throw new Error(
      `${file.name} could not be read. Use JPG, PNG or WebP; HEIC photos may need exporting first.`,
    );
  }
}

async function uploadImage(file) {
  const prepared = await prepareImage(file);
  await uploadSlide(prepared, prepared.name.replace(/\.[^.]+$/, ""));
}

async function uploadPdf(file) {
  const pdfjs = await import("/vendor/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const available = Math.max(0, 80 - (presentation?.slides.length || 0));
  const pages = Math.min(pdf.numPages, available);
  if (pages === 0) throw new Error("The deck already has the maximum number of slides.");
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    setStatus(`Converting PDF page ${pageNumber} of ${pages}…`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render a PDF page.");
    await uploadSlide(blob, `${file.name.replace(/\.pdf$/i, "")} — ${pageNumber}`);
  }
  if (pdf.numPages > pages) {
    setStatus(`Added ${pages} pages. The deck limit is 80 slides.`);
  }
}

async function handleFiles(files) {
  if (uploading || !files?.length) return;
  uploading = true;
  fileInput.disabled = true;
  try {
    await createOrRefreshPresentation();
    for (const file of files) {
      setStatus(`Adding ${file.name} (${file.type || "unknown type"}, ${formatBytes(file.size)})…`);
      if (file.type === "application/pdf") {
        await uploadPdf(file);
      } else if (looksLikeImage(file)) {
        await uploadImage(file);
      } else {
        throw new Error(`${file.name} is not a supported image or PDF. Use JPG, PNG, WebP or PDF.`);
      }
    }
    setStatus(`Ready. ${presentation.slides.length} slide${presentation.slides.length === 1 ? "" : "s"} in the deck.`);
  } catch (error) {
    setStatus(error?.message || "Could not add that file.", { error: true });
  } finally {
    uploading = false;
    fileInput.disabled = false;
    fileInput.value = "";
  }
}

async function removeSlide(slideId) {
  try {
    const payload = await request(`/api/host/presentation/slides/${encodeURIComponent(slideId)}`, {
      method: "DELETE",
    });
    presentation = payload.presentation;
    controllerToken = payload.token || controllerToken;
    applyPresentation(presentation);
  } catch (error) {
    setStatus(error?.message || "Could not remove that slide.", { error: true });
  }
}

function applyFitMode() {
  displayView.dataset.fit = fitMode;
  fitButton.textContent = fitMode === "page" ? "Fit width" : "Fit page";
  if (fitMode === "page") displayView.scrollTop = 0;
}

function applyRemoteScroll() {
  if (displayView.hidden) return;
  if (fitMode !== "width") {
    displayView.scrollTop = 0;
    return;
  }
  const max = displayView.scrollHeight - displayView.clientHeight;
  if (max <= 0) return;
  const ratio = Math.min(1, Math.max(0, Number(presentation?.scroll) || 0));
  const target = Math.round(ratio * max);
  if (Math.abs(displayView.scrollTop - target) > 2) {
    displayView.scrollTop = target;
  }
}

function showDisplay() {
  displayDismissed = false;
  setupView.hidden = true;
  authView.hidden = true;
  displayView.hidden = false;
  applyFitMode();
  renderDisplay();
  refreshDisplayState();
  if (!stateTimer) {
    stateTimer = setInterval(refreshDisplayState, 350);
  }
}

function hideDisplayLocally() {
  if (displayView.hidden) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  displayDismissed = true;
  stopDisplayPolling();
  displayView.hidden = true;
  setupView.hidden = false;
  applyPresentation(presentation);
  setStatus("Presentation is live. Press Show presentation to return.");
}

async function refreshDisplayState() {
  try {
    const payload = await request("/api/state");
    presentation = payload.state?.presentation || null;
    round = payload.state?.round || null;
    survey = payload.state?.survey || null;
    if (presentation) {
      fitMode = presentation.fitMode === "page" ? "page" : "width";
      applyFitMode();
    }
    if (!presentation || presentation.status !== "live") {
      stopDisplayPolling();
      displayView.hidden = true;
      setupView.hidden = false;
      displayDismissed = false;
      round = null;
      survey = null;
      applyPresentation(presentation);
      return;
    }
    renderDisplay();
  } catch {
    // Keep the last slide visible if the network blips.
  }
}

function setDisplayBarMode(mode) {
  const interaction = mode !== "slides";
  displayView.classList.toggle("is-interaction", interaction);
  displayView.dataset.mode = mode;
  prevButton.hidden = interaction;
  nextButton.hidden = interaction;
  rotateButton.hidden = interaction;
  fitButton.hidden = interaction;
  if (interaction) {
    displayLabel.textContent =
      mode === "hands"
        ? `${presentation?.title || "Presentation"} · Live hands`
        : mode === "survey"
          ? `${presentation?.title || "Presentation"} · Survey`
          : `${presentation?.title || "Presentation"} · Poll`;
  }
}

function renderPollOptions(activeRound) {
  interactionOptions.replaceChildren();
  for (const [index, option] of (activeRound.options || []).entries()) {
    const item = document.createElement("div");
    item.className = "present-option";
    item.dataset.color = option.color || "lime";
    item.style.setProperty("--i", String(index));
    const key = document.createElement("span");
    key.className = "present-option-key";
    key.textContent = String.fromCharCode(65 + index);
    const label = document.createElement("span");
    label.className = "present-option-label";
    label.textContent = option.label;
    item.append(key, label);
    interactionOptions.append(item);
  }
}

function renderPollResults(activeRound) {
  interactionResults.replaceChildren();
  const results = activeRound.results;
  if (!results) return;
  const tieWinner = activeRound.tieBreak?.status === "done" ? activeRound.tieBreak.winnerOptionId : null;
  const winners = new Set(tieWinner ? [tieWinner] : results.winners || []);
  const ordered = [...(results.options || [])].sort((a, b) => b.count - a.count);
  interactionResults.classList.toggle("is-many", ordered.length > 2);
  for (const [index, option] of ordered.entries()) {
    const row = document.createElement("div");
    row.className = "present-result";
    row.dataset.color = option.color || "lime";
    row.classList.toggle("is-winner", winners.has(option.optionId));
    const top = document.createElement("div");
    top.className = "present-result-top";
    const rank = document.createElement("span");
    rank.className = "present-result-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.className = "present-result-label";
    label.textContent = option.label;
    const percent = document.createElement("span");
    percent.className = "present-result-percent";
    percent.textContent = `${option.percent}%`;
    const count = document.createElement("span");
    count.className = "present-result-count";
    count.textContent = `${formatVoteCount(option.count)} ${pluralize(option.count, "vote")}`;
    top.append(rank, label, percent, count);
    const track = document.createElement("div");
    track.className = "present-result-track";
    const fill = document.createElement("span");
    fill.style.width = `${option.percent}%`;
    track.append(fill);
    row.append(top, track);
    interactionResults.append(row);
  }
}

function renderRound(activeRound) {
  const isHands = activeRound.mode === "hands";
  const closed = activeRound.status === "closed";
  const revealed = activeRound.status === "revealed";
  interactionChip.classList.toggle("live-chip--warm", closed);
  interactionState.textContent = isHands
    ? closed
      ? "Hands closed"
      : "Hands live"
    : revealed
      ? "Results"
      : "Voting live";
  interactionMeta.textContent = activeRound.title || presentation?.title || "Room Check";
  interactionQuestion.textContent = activeRound.question || "";
  interactionQuestion.classList.toggle("is-long", (activeRound.question || "").length > 68);
  interactionCount.textContent = formatVoteCount(
    isHands ? activeRound.raisedCount || 0 : activeRound.totalVotes || 0,
  );
  interactionCountLabel.textContent = isHands
    ? closed
      ? "hands raised"
      : "hands up"
    : "votes in";
  interactionDetail.textContent = isHands
    ? closed
      ? "round closed"
      : "updates instantly"
    : `${activeRound.options?.length || 0} ${pluralize(activeRound.options?.length || 0, "answer")}`;
  interactionLede.textContent = isHands
    ? closed
      ? "Hands are down. This is the final count."
      : "Raise a hand on your phone. Put it down anytime."
    : revealed
      ? "The room has spoken."
      : "Vote on your phone. Results appear here when the host reveals them.";
  interactionOptions.hidden = isHands || revealed;
  interactionResults.hidden = isHands || !revealed;
  interactionCustom.hidden = true;
  if (!isHands && !revealed && activeRound.endsAt) {
    const remaining = Math.max(0, activeRound.endsAt - Date.now());
    const total = Math.ceil(remaining / 1000);
    interactionTimer.hidden = false;
    interactionTimer.textContent = remaining
      ? `Closes in ${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
      : "Time is up";
  } else {
    interactionTimer.hidden = true;
    interactionTimer.textContent = "";
  }
  if (!isHands && !revealed) renderPollOptions(activeRound);
  if (!isHands && revealed) renderPollResults(activeRound);
}

function renderSurvey(activeSurvey) {
  const closed = activeSurvey.status === "closed";
  interactionChip.classList.toggle("live-chip--warm", closed);
  interactionState.textContent = closed ? "Survey closed" : "Survey live";
  interactionMeta.textContent = activeSurvey.title || presentation?.title || "Room Check";
  interactionQuestion.textContent = activeSurvey.title || "Survey";
  interactionLede.textContent = closed
    ? "The survey is closed. Results are on the host screen."
    : "Answer on your phone. The host will close the survey.";
  interactionCount.textContent = String(activeSurvey.questions?.length || 0);
  interactionCountLabel.textContent = "questions";
  interactionDetail.textContent = closed ? "finished" : "in progress";
  interactionOptions.hidden = true;
  interactionResults.hidden = true;
  interactionCustom.hidden = true;
}

function renderDisplay() {
  if (!presentation) return;
  applyFitMode();
  const activeRound = round;
  const activeSurvey = survey;
  if (activeRound) {
    slideWrap.hidden = true;
    interactionView.hidden = false;
    setDisplayBarMode(activeRound.mode === "hands" ? "hands" : "poll");
    renderRound(activeRound);
    return;
  }
  if (activeSurvey) {
    slideWrap.hidden = true;
    interactionView.hidden = false;
    setDisplayBarMode("survey");
    renderSurvey(activeSurvey);
    return;
  }

  interactionView.hidden = true;
  slideWrap.hidden = false;
  setDisplayBarMode("slides");
  if (!presentation.slides?.length) return;
  const index = Math.min(
    Math.max(Number(presentation.currentIndex) || 0, 0),
    presentation.slides.length - 1,
  );
  const slide = presentation.slides[index];
  if (displaySlide.getAttribute("src") !== slide.src) displaySlide.src = slide.src;
  displaySlide.alt = slide.name || `Slide ${index + 1}`;
  displaySlide.style.transform = `rotate(${Number(slide.rotation) || 0}deg)`;
  displayLabel.textContent = `${presentation.title || "Presentation"} · ${index + 1} / ${presentation.slides.length}`;
  prevButton.disabled = index === 0;
  nextButton.disabled = index >= presentation.slides.length - 1;
  requestAnimationFrame(applyRemoteScroll);
}

function stopDisplayPolling() {
  clearInterval(stateTimer);
  stateTimer = null;
}

async function control(action, index, nextFitMode) {
  try {
    const payload = await request("/api/presentation/control", {
      method: "POST",
      body: JSON.stringify({ action, index, fitMode: nextFitMode }),
    });
    presentation = payload.presentation;
    if (presentation?.fitMode) {
      fitMode = presentation.fitMode === "page" ? "page" : "width";
      applyFitMode();
    }
    renderDisplay();
  } catch (error) {
    setStatus(error?.message || "Could not control the presentation.");
  }
}

async function startPresentation() {
  try {
    displayDismissed = false;
    await createOrRefreshPresentation({ forStart: true });
    const payload = await request("/api/host/presentation/start", { method: "POST" });
    presentation = payload.presentation;
    controllerToken = payload.token || controllerToken;
    applyPresentation(presentation);
    showDisplay();
  } catch (error) {
    setStatus(error?.message || "Could not start the presentation.", { error: true });
  }
}

async function endPresentationSession() {
  if (presentation?.status === "live") {
    if (!window.confirm("End the presentation and return to the host console?")) return;
    try {
      await request("/api/host/presentation/close", { method: "POST" });
    } catch (error) {
      setStatus(error?.message || "Could not end the presentation.", { error: true });
      return;
    }
  }
  location.href = "/host";
}

async function stopPresentation() {
  try {
    await request("/api/host/presentation/close", { method: "POST" });
    stopDisplayPolling();
    displayView.hidden = true;
    setupView.hidden = false;
    displayDismissed = false;
    await refreshPresentation();
  } catch (error) {
    setStatus(error?.message || "Could not close the presentation.", { error: true });
  }
}

async function discardPresentation() {
  if (!window.confirm("Discard this deck? The slides will be deleted.")) return;
  try {
    await request("/api/host/presentation", { method: "DELETE" });
    presentation = null;
    controllerToken = "";
    applyPresentation(null);
    setStatus("Deck discarded. Add images or a PDF to build a new deck.");
  } catch (error) {
    setStatus(error?.message || "Could not discard the deck.", { error: true });
  }
}

pickButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFiles(Array.from(fileInput.files || [])));
copyController.addEventListener("click", async () => {
  const url = qrUrl.dataset.url || "";
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyController.setAttribute("aria-label", "Controller link copied");
  } catch {
    setStatus("Could not copy the controller link.");
  }
});
startButton.addEventListener("click", startPresentation);
resumeButton.addEventListener("click", showDisplay);
discardButton.addEventListener("click", discardPresentation);
prevButton.addEventListener("click", () => control("prev"));
nextButton.addEventListener("click", () => control("next"));
rotateButton.addEventListener("click", () => control("rotate"));
fitButton.addEventListener("click", () => {
  const next = fitMode === "page" ? "width" : "page";
  control("fit", undefined, next);
});
displaySlide.addEventListener("load", () => requestAnimationFrame(applyRemoteScroll));
backButton.addEventListener("click", hideDisplayLocally);
stopButton.addEventListener("click", endPresentationSession);
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
fullscreenButton.addEventListener("click", toggleFullscreen);
headerFullscreenButton.addEventListener("click", toggleFullscreen);
endSessionButton.addEventListener("click", endPresentationSession);
lockButton.addEventListener("click", async () => {
  try {
    await request("/api/host/logout", { method: "POST" });
  } catch {
    // Lock the UI regardless.
  }
  location.href = "/host";
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !displayView.hidden) {
    event.preventDefault();
    hideDisplayLocally();
    return;
  }
  if (displayView.hidden) return;
  if (event.key === "ArrowLeft") control("prev");
  if (event.key === "ArrowRight") control("next");
});

window.addEventListener("beforeunload", stopDisplayPolling);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !displayView.hidden) refreshDisplayState();
});

async function init() {
  await loadTheme();
  applyFitMode();
  try {
    const config = await request("/api/config");
    if (config?.joinUrl) controllerBase = new URL(config.joinUrl).origin;
  } catch {
    // Fall back to the current origin.
  }
  try {
    const auth = await request("/api/host/me");
    if (!auth.authed) {
      authView.hidden = false;
      return;
    }
    setupView.hidden = false;
    await refreshPresentation();
  } catch {
    authView.hidden = false;
  }
}

init();
