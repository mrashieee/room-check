/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import {
  $,
  $$,
  LiveConnection,
  api,
  formatClock,
  formatList,
  formatVoteCount,
  getPlayerId,
  pluralize,
  renderConnection,
} from "./common.js";
import { applyTheme, loadTheme } from "./theme.js";
import { contrastRatio } from "./theme-config.js";

const playerId = getPlayerId();
const screens = {
  connecting: $("#screen-connecting"),
  waiting: $("#screen-waiting"),
  vote: $("#screen-vote"),
  hands: $("#screen-hands"),
  voted: $("#screen-voted"),
  survey: $("#screen-survey"),
  surveyDone: $("#screen-survey-done"),
  surveyResults: $("#screen-survey-results"),
  results: $("#screen-results"),
  thanks: $("#screen-thanks"),
  error: $("#screen-error"),
};

const connectionPill = $("#connection-pill");
const connectionLabel = $("#connection-label");
const voteForm = $("#vote-form");
const voteOptions = $("#vote-options");
const voteSubmit = $("#vote-submit");
const voteHelp = $("#vote-help");
const voteClock = $("#vote-clock");
const voteClockValue = $("#vote-clock-value");
const voteClockLabel = $(".vote-clock-label");
const voteProgress = $("#vote-progress");
const votedProgress = $("#voted-session-progress");
const surveyEyebrow = $("#survey-eyebrow");
const surveyProgress = $("#survey-progress");
const surveyClock = $("#survey-clock");
const surveyClockLabel = $(".vote-clock-label", surveyClock);
const surveyClockValue = $("#survey-clock-value");
const surveyQuestion = $("#survey-question");
const surveyOptions = $("#survey-options");
const surveyBack = $("#survey-back");
const surveyNext = $("#survey-next");
const surveySaveStatus = $("#survey-save-status");
const surveyDoneProgress = $("#survey-done-progress");
const surveyReview = $("#survey-review");
const surveyResultsTitle = $("#survey-results-title");
const surveyResultsList = $("#survey-results-list");
const votedOption = $("#voted-option");
const votedCount = $("#voted-count");
const votedCountLabel = $("#voted-count-label");
const votedWaiting = $("#voted-waiting");
const changeVoteButton = $("#change-vote-button");
const changeVoteNote = $("#change-vote-note");
const resultsTitle = $("#results-title");
const resultsEyebrow = $("#results-eyebrow");
const resultsWinner = $("#results-winner");
const resultsTotal = $("#results-total");
const resultsBars = $("#results-bars");
const personalResult = $("#personal-result-text");
const outcomeBanner = $("#results-outcome");
const announcer = $("#live-announcer");
const handsQuestion = $("#hands-question");
const handsLiveChip = $("#hands-live-chip");
const handsLiveLabel = $("#hands-live-label");
const handsInstruction = $("#hands-instruction");
const handsToggle = $("#hands-toggle");
const handsToggleLabel = $("#hands-toggle-label");
const handsToggleHint = $("#hands-toggle-hint");
const handsFinal = $("#hands-final");
const handsFootnote = $("#hands-footnote");

let currentScreen = "connecting";
let currentState = null;
let currentRoundId = null;
let currentSurveyId = null;
let surveyIndex = 0;
let surveyAnswers = {};
let surveyBusy = false;
let surveyReturnToReview = false;
let renderedRoundId = null;
let renderedResultsKey = null;
let myVote = null;
let myHandRaised = false;
let handsBusy = false;
let selectedOption = null;
let changingVote = false;
let voteWasUpdated = false;
let submitting = false;
let clockTimer = null;
let offlineTimer = null;
let pollTimer = null;
let pollBusy = false;
let lastStateNow = 0;
let connection = null;

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function showScreen(name) {
  if (currentScreen === name) return false;
  for (const [key, element] of Object.entries(screens)) {
    if (element) element.hidden = key !== name;
  }
  currentScreen = name;
  document.body.dataset.screen = name;
  return true;
}

function announce(message) {
  if (!announcer || !message) return;
  announcer.textContent = message;
}

function optionById(optionId) {
  return currentState?.round?.options?.find((option) => option.id === optionId) || null;
}

function sessionProgressText(session) {
  return session && session.total > 1 ? `Question ${session.index} of ${session.total}` : "";
}

function updateSubmitState() {
  if (!voteSubmit) return;
  const round = currentState?.round;
  const roundOpen = round?.status === "open";
  const timeUp =
    roundOpen && round.endsAt && round.endsAt <= (connection?.serverNow() ?? Date.now());
  voteSubmit.disabled = !roundOpen || !selectedOption || submitting || Boolean(timeUp);
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
  for (const option of voteOptions.querySelectorAll(".vote-option")) {
    applyChoiceInk(option, option.dataset.color || "lime");
  }
}

document.addEventListener("roomcheck:theme", refreshChoiceInks);

function buildVoteOptions(round) {
  voteOptions.replaceChildren();

  round.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "vote-option";
    label.dataset.color = option.color || "lime";
    label.style.setProperty("--i", String(index));
    applyChoiceInk(label, label.dataset.color);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option.id;

    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = LETTERS[index] || String(index + 1);

    const text = document.createElement("span");
    text.className = "option-text";
    text.textContent = option.label;

    const check = document.createElement("span");
    check.className = "option-check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML =
      '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

    label.append(input, letter, text, check);
    voteOptions.append(label);
  });
}

function renderVoteScreen(round, { force = false, selected = null } = {}) {
  const roundChanged = renderedRoundId !== round.id;
  if (roundChanged || force) {
    renderedRoundId = round.id;
    selectedOption = selected;
    $("#vote-question").textContent = round.question;
    $("#vote-eyebrow").textContent =
      round.title && round.title.trim().toLowerCase() !== "room check"
        ? round.title
        : "Live question";
    buildVoteOptions(round);
    if (selectedOption) {
      const input = Array.from(voteOptions.querySelectorAll('input[name="answer"]')).find(
        (candidate) => candidate.value === selectedOption,
      );
      if (input) {
        input.checked = true;
        input.closest(".vote-option")?.classList.add("is-selected");
      } else {
        selectedOption = null;
      }
    }
    voteSubmit.querySelector("span").textContent = changingVote
      ? "Update my answer"
      : "Lock in my answer";
    voteHelp.textContent = changingVote
      ? "Choose a new answer. Your current vote stays until you update it."
      : "Choose one. You can change it until voting closes.";
    voteSubmit.disabled = !selectedOption;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  const progress = sessionProgressText(currentState?.session);
  voteProgress.hidden = !progress;
  voteProgress.textContent = progress;
  const changed = showScreen("vote");
  if (changed) announce(`Voting is open. ${round.question}`);
  updateClock();
}

function updateChangeVoteState() {
  if (!changeVoteButton || !changeVoteNote) return;
  const round = currentState?.round;
  const open = round?.status === "open" && currentScreen === "voted";
  const remaining =
    open && round.endsAt ? round.endsAt - (connection?.serverNow() ?? Date.now()) : null;
  const canChange = Boolean(open && (remaining === null || remaining > 0));
  changeVoteButton.hidden = !canChange;
  changeVoteNote.textContent = canChange
    ? "You can change this until voting closes."
    : "Voting has closed. Your previous answer stands.";
}

function renderVotedScreen(round) {
  const chosen = optionById(myVote);
  if (!chosen) {
    myVote = null;
    renderScreen();
    return;
  }

  const progress = sessionProgressText(currentState?.session);
  votedProgress.hidden = !progress;
  votedProgress.textContent = progress;
  votedOption.textContent = chosen.label;
  votedCount.textContent = formatVoteCount(round.totalVotes);
  votedCountLabel.textContent = `${pluralize(round.totalVotes, "vote")} in`;
  if (round.totalVotes === 0) {
    votedWaiting.textContent = "Waiting for the room…";
  } else if (round.totalVotes === 1) {
    votedWaiting.textContent = "You’re first in. Nicely done.";
  } else {
    votedWaiting.textContent = "The room is weighing in…";
  }
  const changed = showScreen("voted");
  if (changed) {
    announce(
      voteWasUpdated
        ? `Vote updated. You picked ${chosen.label}. Waiting for the reveal.`
        : `Vote saved. You picked ${chosen.label}. Waiting for the reveal.`,
    );
  }
  voteWasUpdated = false;
  updateChangeVoteState();
}

function surveyFirstUnanswered(survey) {
  const index = survey.questions.findIndex((question) => !surveyAnswers[question.id]);
  return index === -1 ? survey.questions.length : index;
}

function buildSurveyOptions(question) {
  surveyOptions.replaceChildren();
  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "vote-option";
    label.dataset.color = option.color || "lime";
    label.style.setProperty("--i", String(index));
    applyChoiceInk(label, label.dataset.color);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "survey-answer";
    input.value = option.id;
    input.checked = surveyAnswers[question.id] === option.id;
    label.classList.toggle("is-selected", input.checked);

    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = LETTERS[index] || String(index + 1);

    const text = document.createElement("span");
    text.className = "option-text";
    text.textContent = option.label;

    const check = document.createElement("span");
    check.className = "option-check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML =
      '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

    label.append(input, letter, text, check);
    surveyOptions.append(label);
  });
}

function updateSurveyNextState() {
  const survey = currentState?.survey;
  const question = survey?.questions?.[surveyIndex];
  if (!survey || !question) return;
  const hasAnswer = Boolean(surveyAnswers[question.id]);
  surveyNext.disabled = !hasAnswer || surveyBusy;
  const last = surveyIndex >= survey.questions.length - 1;
  const label = surveyNext.querySelector("span");
  if (label) {
    label.textContent = surveyReturnToReview
      ? "Save answer"
      : last
        ? "Finish"
        : "Next question";
  }
}

function renderSurveyQuestion(statusMessage = "") {
  const survey = currentState?.survey;
  if (!survey || surveyIndex >= survey.questions.length) {
    renderSurveyDone();
    return;
  }
  const question = survey.questions[surveyIndex];
  surveyEyebrow.textContent = survey.title || "Room Check survey";
  surveyQuestion.textContent = question.question;
  surveyProgress.hidden = false;
  surveyProgress.textContent = `Question ${surveyIndex + 1} of ${survey.questions.length}`;
  surveyBack.disabled = surveyIndex === 0 || surveyBusy;
  surveySaveStatus.textContent = statusMessage || "Choose one answer, then continue.";
  buildSurveyOptions(question);
  updateSurveyNextState();
  const changed = showScreen("survey");
  if (changed) {
    announce(
      `Question ${surveyIndex + 1} of ${survey.questions.length}. ${question.question}`,
    );
  }
  updateClock();
}

function renderSurveyDone() {
  const survey = currentState?.survey;
  if (!survey) {
    renderScreen();
    return;
  }
  surveyDoneProgress.hidden = false;
  surveyDoneProgress.textContent = `${survey.questions.length} ${pluralize(survey.questions.length, "question")} answered`;
  surveyReview.replaceChildren();

  survey.questions.forEach((question, index) => {
    const answerId = surveyAnswers[question.id];
    const answer = question.options.find((option) => option.id === answerId);
    const row = document.createElement("div");
    row.className = "survey-review-row";

    const copy = document.createElement("div");
    copy.className = "survey-review-copy";
    const questionLabel = document.createElement("strong");
    questionLabel.textContent = `${index + 1}. ${question.question}`;
    const answerLabel = document.createElement("span");
    answerLabel.textContent = answer?.label || "Not answered";
    copy.append(questionLabel, answerLabel);

    const change = document.createElement("button");
    change.className = "text-button";
    change.type = "button";
    change.textContent = "Change";
    change.addEventListener("click", () => {
      if (surveyBusy) return;
      surveyIndex = index;
      surveyReturnToReview = true;
      renderSurveyQuestion();
    });

    row.append(copy, change);
    surveyReview.append(row);
  });

  const changed = showScreen("surveyDone");
  if (changed) announce("Survey complete. You can change any answer until the survey closes.");
  updateClock();
}

async function saveSurveyAnswer(questionId, optionId) {
  const survey = currentState?.survey;
  if (!survey || survey.status !== "open" || surveyBusy) return;
  surveyBusy = true;
  surveyBack.disabled = true;
  surveyNext.disabled = true;
  surveySaveStatus.textContent = "Saving…";
  surveyOptions.querySelectorAll("input").forEach((input) => {
    input.disabled = true;
  });

  try {
    const result = await api("/api/survey/answer", {
      method: "POST",
      body: { playerId, questionId, optionId },
    });
    surveyAnswers = { ...(result.you?.answers || {}) };
    if (surveyReturnToReview) {
      surveyIndex = survey.questions.length;
      surveyReturnToReview = false;
    } else if (surveyIndex >= survey.questions.length - 1) {
      surveyIndex = survey.questions.length;
    } else {
      surveyIndex += 1;
    }
    surveyBusy = false;
    handleState(result.state, result.you);
    surveySaveStatus.textContent = "Saved.";
  } catch (error) {
    surveyBusy = false;
    const message =
      error.status === 409
        ? "The survey is closed."
        : error?.message || "Could not save that answer.";
    if (currentState?.survey?.status === "open") renderSurveyQuestion(message);
  }
}

function renderSurveyResults() {
  const survey = currentState?.survey;
  const results = survey?.results;
  if (!survey || !results?.length) {
    renderThanks();
    return;
  }

  surveyResultsTitle.textContent = survey.title || "The room has spoken.";
  surveyResultsList.replaceChildren();
  results.forEach((result, questionIndex) => {
    const card = document.createElement("article");
    card.className = "survey-result-card";

    const heading = document.createElement("h2");
    heading.textContent = `${questionIndex + 1}. ${result.question}`;
    const total = document.createElement("p");
    total.className = "survey-result-total";
    total.textContent = `${formatVoteCount(result.total)} ${pluralize(result.total, "answer")}`;
    const bars = document.createElement("div");
    bars.className = "result-bars";
    bars.setAttribute("aria-label", `Results for ${result.question}`);

    const ordered = [...result.options].sort((a, b) => b.count - a.count);
    ordered.forEach((option) => {
      const bar = document.createElement("div");
      bar.className = "result-bar";
      bar.dataset.color = option.color || "lime";

      const top = document.createElement("div");
      top.className = "result-bar-top";
      const dot = document.createElement("span");
      dot.className = "result-bar-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "result-bar-label";
      label.textContent = option.label;
      const percent = document.createElement("span");
      percent.className = "result-bar-percent";
      percent.textContent = `${option.percent}%`;
      const track = document.createElement("div");
      track.className = "result-bar-track";
      const fill = document.createElement("span");
      track.append(fill);
      top.append(dot, label, percent);
      bar.append(top, track);
      bars.append(bar);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.setProperty("--bar-width", `${option.percent}%`);
        });
      });
    });

    card.append(heading, total, bars);
    surveyResultsList.append(card);
  });

  const changed = showScreen("surveyResults");
  if (changed) announce("Survey results are ready.");
  updateClock();
}

function resultKey(round) {
  if (!round?.results) return "";
  const tieBreak = round.tieBreak;
  return (
    round.id +
    ":" +
    round.revealedAt +
    ":" +
    (tieBreak?.status || "none") +
    ":" +
    (tieBreak?.winnerOptionId || "") +
    ":" +
    round.results.options.map((option) => `${option.optionId}-${option.count}`).join(",")
  );
}

function renderResults(round) {
  const total = round.results?.total || 0;
  const winners = round.results?.winners || [];
  const tieBreak = round.tieBreak;
  const wheelDone = tieBreak?.status === "done" && tieBreak.winnerOptionId;
  const wheelWinnerId = wheelDone ? tieBreak.winnerOptionId : null;
  const wheelPending = Boolean(tieBreak && tieBreak.status !== "done");
  const isTie = total > 0 && winners.length > 1;
  const winnerLabels = winners.map((id) => optionById(id)?.label).filter(Boolean);
  const wheelWinner = wheelWinnerId ? optionById(wheelWinnerId) : null;
  const key = resultKey(round);

  resultsTitle.textContent = round.question;
  const progress = sessionProgressText(currentState?.session);
  resultsEyebrow.textContent =
    (wheelDone
      ? "Tie breaker · the wheel has spoken"
      : wheelPending
        ? tieBreak.status === "spinning"
          ? "Tie breaker · the wheel is spinning"
          : "Tie breaker · the room is tied"
        : round.revealReason === "timer"
          ? "Time’s up · the room has spoken"
          : "The room has spoken") + (progress ? ` · ${progress}` : "");

  if (total === 0) {
    resultsWinner.textContent = "No votes";
    resultsTotal.textContent = "The room stayed quiet";
    outcomeBanner.querySelector(".outcome-kicker").textContent = "Well then";
  } else if (wheelPending) {
    outcomeBanner.querySelector(".outcome-kicker").textContent =
      tieBreak.status === "spinning" ? "The wheel is spinning" : "The room is in a tie";
    resultsWinner.textContent = formatList(winnerLabels);
    resultsTotal.textContent = `${formatVoteCount(total)} ${pluralize(total, "vote")} · watch the big screen`;
  } else if (wheelWinnerId) {
    outcomeBanner.querySelector(".outcome-kicker").textContent = "The wheel picked";
    resultsWinner.textContent = wheelWinner?.label || "";
    resultsTotal.textContent = `${formatVoteCount(total)} ${pluralize(total, "vote")} · tie broken`;
  } else if (winners.length === 1) {
    outcomeBanner.querySelector(".outcome-kicker").textContent = "The room picked";
    resultsWinner.textContent = winnerLabels[0] || "";
    resultsTotal.textContent = `${formatVoteCount(total)} ${pluralize(total, "vote")}`;
  } else {
    outcomeBanner.querySelector(".outcome-kicker").textContent = "The room is in a tie";
    resultsWinner.textContent = formatList(winnerLabels);
    resultsTotal.textContent = `${formatVoteCount(total)} ${pluralize(total, "vote")}`;
  }

  if (key !== renderedResultsKey) {
    renderedResultsKey = key;
    resultsBars.replaceChildren();

    let ordered = [...(round.results?.options || [])].sort((a, b) => b.count - a.count);
    if (wheelWinnerId) {
      ordered = [
        ...ordered.filter((option) => option.optionId === wheelWinnerId),
        ...ordered.filter((option) => option.optionId !== wheelWinnerId),
      ];
    }

    const highlighted = wheelWinnerId ? [wheelWinnerId] : winners;
    for (const option of ordered) {
      const bar = document.createElement("div");
      bar.className = "result-bar";
      bar.dataset.color = option.color || "lime";
      if (highlighted.includes(option.optionId)) bar.classList.add("is-winner");

      const top = document.createElement("div");
      top.className = "result-bar-top";

      const dot = document.createElement("span");
      dot.className = "result-bar-dot";
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "result-bar-label";
      label.textContent = option.label;

      const percent = document.createElement("span");
      percent.className = "result-bar-percent";
      percent.textContent = `${option.percent}%`;

      const track = document.createElement("div");
      track.className = "result-bar-track";
      const fill = document.createElement("span");
      track.append(fill);

      top.append(dot, label, percent);
      bar.append(top, track);
      resultsBars.append(bar);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.setProperty("--bar-width", `${option.percent}%`);
        });
      });
    }
  }

  if (total === 0) {
    personalResult.textContent = "Nobody cast a vote. A moment of silence for the poll.";
  } else if (wheelPending) {
    personalResult.textContent = "Eyes on the big screen — the wheel is picking the winner.";
  } else if (wheelWinnerId) {
    if (myVote === wheelWinnerId) {
      personalResult.textContent = "The wheel picked your answer. You called it.";
    } else if (myVote && winners.includes(myVote)) {
      const chosen = optionById(myVote);
      personalResult.textContent = `Sorry — your choice, ${chosen?.label || "your pick"}, was broken by the tie breaker. ${wheelWinner?.label || "The winner"} wins.`;
    } else if (myVote) {
      const chosen = optionById(myVote);
      personalResult.textContent = `The tie breaker went to ${wheelWinner?.label || "another answer"}. Your pick was ${chosen?.label || "a brave choice"}.`;
    } else {
      personalResult.textContent = `The wheel picked ${wheelWinner?.label || "the winner"} to break the tie.`;
    }
  } else if (!myVote) {
    personalResult.textContent = "You didn’t vote this round — the room went on without you.";
  } else {
    const chosen = optionById(myVote);
    if (winners.includes(myVote)) {
      personalResult.textContent = isTie
        ? `You backed one of the tied answers: ${chosen?.label || "your pick"}.`
        : "You called it. The room agreed with your pick.";
    } else {
      personalResult.textContent = isTie
        ? `The room split; your pick was ${chosen?.label || "a brave choice"}.`
        : `The room went another way. Your pick was ${chosen?.label || "a brave choice"}.`;
    }
  }

  const changedScreen = currentScreen !== "results";
  showScreen("results");
  if (changedScreen) {
    const summary =
      total === 0
        ? "No votes were cast."
        : wheelPending
          ? `The room is tied: ${formatList(winnerLabels)}. The wheel is spinning on the big screen.`
          : wheelWinnerId
            ? `The wheel picked ${wheelWinner?.label || "the winner"} to break the tie. ${formatVoteCount(total)} ${pluralize(total, "vote")}.`
            : isTie
              ? `The room is in a tie: ${formatList(winnerLabels)}. ${formatVoteCount(total)} ${pluralize(total, "vote")}.`
              : `${resultsWinner.textContent || "The room has decided"}. ${formatVoteCount(total)} ${pluralize(total, "vote")}.`;
    announce(`Results are in. ${summary}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function renderWaiting() {
  const changed = showScreen("waiting");
  if (changed) announce("Waiting for the host to start the poll.");
}

function renderThanks() {
  const changed = showScreen("thanks");
  if (changed) announce("Thanks for joining. You can star Room Check on GitHub.");
}

function renderHands(round) {
  const closed = round.status === "closed";
  const changed = currentScreen !== "hands";
  const raised = closed ? myHandRaised : myHandRaised;

  handsQuestion.textContent = round.question;
  handsLiveChip.classList.toggle("is-closed", closed);
  handsLiveChip.dataset.status = closed ? "closed" : "open";
  handsLiveLabel.textContent = closed ? "Live hands: Closed" : "Live hands: Open";
  handsToggle.disabled = closed || handsBusy;
  handsToggle.classList.toggle("is-raised", raised);
  handsToggle.setAttribute("aria-pressed", raised ? "true" : "false");
  handsToggleLabel.textContent = closed
    ? raised
      ? "Hand was raised"
      : "Hands closed"
    : raised
      ? "Put hand down"
      : "Raise hand";
  handsToggleHint.textContent = closed
    ? "The host has the count"
    : raised
      ? "Tap to lower it"
      : "Tap to join the room";
  handsInstruction.textContent = closed
    ? "The room is closed. The presenter has the final count."
    : raised
      ? "Your hand is raised. The presenter can see it."
      : "Tap the hand to raise it. The presenter can see the room’s hands.";
  handsFinal.hidden = !closed;
  handsFinal.textContent = closed
    ? round.raisedCount > 0
      ? `The room finished with ${formatVoteCount(round.raisedCount)} ${pluralize(round.raisedCount, "hand")} raised.`
      : "No hands were raised."
    : "";
  handsFootnote.textContent = closed ? "Thanks for taking part." : "You can put your hand down anytime.";

  showScreen("hands");
  if (changed) {
    announce(
      closed
        ? "The live-hands round is closed. The presenter has the final count."
        : `Live hands: ${round.question}. ${raised ? "Your hand is raised." : "Tap the raise hand button to join."}`,
    );
  }
}

function renderScreen() {
  const survey = currentState?.survey;
  if (survey) {
    if (survey.status !== "open" || currentState.closed) {
      if (survey.results?.length) {
        renderSurveyResults();
      } else {
        renderThanks();
      }
    } else if (surveyIndex >= survey.questions.length) {
      renderSurveyDone();
    } else {
      renderSurveyQuestion();
    }
    return;
  }

  const round = currentState?.round;
  if (!round) {
    if (currentState?.closed) {
      renderThanks();
    } else {
      renderWaiting();
    }
    return;
  }

  if (round.mode === "hands") {
    renderHands(round);
    return;
  }

  if (round.status === "revealed") {
    renderResults(round);
    return;
  }

  if (myVote && !changingVote) {
    renderVotedScreen(round);
  } else {
    renderVoteScreen(round);
  }
}

function handleState(state, you) {
  applyTheme(state?.theme);
  const incomingNow = Number(state?.now) || 0;
  if (incomingNow && incomingNow < lastStateNow) return;
  lastStateNow = Math.max(lastStateNow, incomingNow);
  if (connection) connection.syncServerTime(state);

  const previousRoundId = currentRoundId;
  const previousSurveyId = currentSurveyId;
  currentState = state;
  currentRoundId = state.round?.id || null;
  currentSurveyId = state.survey?.id || null;

  if (currentSurveyId) {
    if (previousSurveyId !== currentSurveyId) {
      surveyAnswers =
        you?.surveyId === currentSurveyId && you.answers ? { ...you.answers } : {};
      surveyIndex = surveyFirstUnanswered(state.survey);
      surveyReturnToReview = false;
      surveyBusy = false;
    } else if (you?.surveyId === currentSurveyId && you.answers) {
      surveyAnswers = { ...you.answers };
    }
  } else {
    surveyAnswers = {};
    surveyIndex = 0;
    surveyBusy = false;
    surveyReturnToReview = false;
  }

  if (state.round?.status !== "open") {
    changingVote = false;
    voteWasUpdated = false;
  }

  if (previousRoundId !== currentRoundId) {
    myHandRaised = false;
    changingVote = false;
    voteWasUpdated = false;
    if (state.round?.mode === "hands") {
      myVote = null;
      myHandRaised = Boolean(you && you.roundId === currentRoundId && you.raised);
    } else {
      myVote = you && you.roundId === currentRoundId ? you.optionId || null : null;
    }
    selectedOption = null;
    renderedRoundId = null;
    renderedResultsKey = null;
    if (state.round) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  } else if (you !== undefined) {
    if (state.round?.mode === "hands") {
      if (you && you.roundId === currentRoundId) myHandRaised = Boolean(you.raised);
      myVote = null;
    } else if (you && you.roundId === currentRoundId) {
      myVote = you.optionId || null;
    } else if (!you && !currentRoundId) {
      myVote = null;
    }
  }

  if (
    state.round?.status === "revealed" &&
    state.round.results &&
    state.round.id !== previousRoundId
  ) {
    renderedResultsKey = null;
  }

  renderScreen();
}

function updateClock() {
  updateChangeVoteState();
  if (currentState?.survey) {
    const survey = currentState.survey;
    if (survey.status !== "open" || currentScreen !== "survey") {
      surveyClock.hidden = true;
      return;
    }
    surveyClock.hidden = false;
    if (!survey.endsAt) {
      surveyClock.classList.remove("is-urgent");
      surveyClockLabel.textContent = "Survey";
      surveyClockValue.textContent = "Open";
    } else {
      const remaining = survey.endsAt - (connection?.serverNow() ?? Date.now());
      surveyClock.classList.toggle("is-urgent", remaining <= 10_000);
      surveyClockLabel.textContent = remaining <= 0 ? "Survey" : "Survey closes in";
      surveyClockValue.textContent = remaining <= 0 ? "Closed" : formatClock(remaining);
    }
    return;
  }
  if (currentState?.round?.mode === "hands") {
    voteClock.hidden = true;
    return;
  }
  if (!currentState?.round || currentState.round.status !== "open") {
    voteClock.hidden = currentScreen !== "vote";
    return;
  }

  const round = currentState.round;
  if (currentScreen === "vote") {
    voteClock.hidden = false;
    if (!round.endsAt) {
      voteClock.classList.remove("is-urgent");
      voteClockLabel.textContent = "Voting";
      voteClockValue.textContent = "Open";
      updateSubmitState();
    } else {
      const remaining = round.endsAt - connection.serverNow();
      voteClock.classList.toggle("is-urgent", remaining <= 10_000);
      voteClockLabel.textContent = remaining <= 0 ? "Time" : "Closes in";
      voteClockValue.textContent = remaining <= 0 ? "Up" : formatClock(remaining);
      if (remaining <= 0) {
        voteSubmit.disabled = true;
        voteHelp.textContent = "Time’s up — the results are coming.";
      } else {
        updateSubmitState();
      }
    }
  }
}

function setLoginError(message) {
  voteHelp.textContent = message;
  voteHelp.setAttribute("role", "alert");
  setTimeout(() => {
    voteHelp.removeAttribute("role");
  }, 1800);
}

handsToggle.addEventListener("click", async () => {
  const round = currentState?.round;
  if (!round || round.mode !== "hands" || round.status !== "open" || handsBusy) return;

  const raised = !myHandRaised;
  handsBusy = true;
  handsToggle.disabled = true;
  handsToggleLabel.textContent = raised ? "Raising hand…" : "Lowering hand…";
  handsToggleHint.textContent = "Updating…";

  try {
    const result = await api("/api/hands", {
      method: "POST",
      body: { playerId, raised },
    });
    myHandRaised = Boolean(result.you?.raised);
    handsBusy = false;
    if (navigator.vibrate) navigator.vibrate(raised ? [12, 30, 16] : 10);
    handleState(result.state, result.you);
  } catch (error) {
    handsBusy = false;
    renderHands(round);
    handsFootnote.textContent = error?.message || "Could not update your hand. Try again.";
  }
});

surveyOptions.addEventListener("change", (event) => {
  const input = event.target.closest('input[name="survey-answer"]');
  const survey = currentState?.survey;
  const question = survey?.questions?.[surveyIndex];
  if (!input || !question || surveyBusy) return;
  surveyAnswers[question.id] = input.value;
  surveyOptions.querySelectorAll(".vote-option").forEach((option) => {
    const optionInput = option.querySelector("input");
    option.classList.toggle("is-selected", optionInput?.checked || false);
  });
  surveySaveStatus.textContent = "Ready when you are.";
  updateSurveyNextState();
});

surveyBack.addEventListener("click", () => {
  if (surveyBusy || surveyIndex <= 0) return;
  surveyIndex -= 1;
  surveyReturnToReview = false;
  renderSurveyQuestion();
});

surveyNext.addEventListener("click", () => {
  const survey = currentState?.survey;
  const question = survey?.questions?.[surveyIndex];
  if (!survey || !question || !surveyAnswers[question.id] || surveyBusy) return;
  saveSurveyAnswer(question.id, surveyAnswers[question.id]);
});

voteOptions.addEventListener("change", (event) => {
  const input = event.target.closest('input[name="answer"]');
  if (!input) return;
  selectedOption = input.value;
  $$(".vote-option", voteOptions).forEach((option) => {
    const optionInput = option.querySelector("input");
    option.classList.toggle("is-selected", optionInput?.checked || false);
  });
  if (navigator.vibrate) navigator.vibrate(8);
  updateClock();
  updateSubmitState();
});

changeVoteButton.addEventListener("click", () => {
  const round = currentState?.round;
  if (!round || round.status !== "open" || !myVote) return;
  if (round.endsAt && round.endsAt <= connection.serverNow()) {
    updateChangeVoteState();
    return;
  }
  changingVote = true;
  voteWasUpdated = false;
  renderVoteScreen(round, { force: true, selected: myVote });
  announce("Choose a new answer. Your current vote stays until you update it.");
});

voteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  if (!selectedOption) {
    setLoginError("Pick an answer first.");
    return;
  }
  if (!currentState?.round || currentState.round.status !== "open") {
    setLoginError("Voting has closed.");
    return;
  }

  submitting = true;
  voteSubmit.disabled = true;
  const label = voteSubmit.querySelector("span");
  const original = label.textContent;
  label.textContent = changingVote ? "Updating…" : "Locking it in…";

  try {
    const result = await api("/api/vote", {
      method: "POST",
      body: { playerId, optionId: selectedOption },
    });
    submitting = false;
    label.textContent = original;
    changingVote = false;
    voteWasUpdated = Boolean(result.updated);
    if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    handleState(result.state, result.you);
    if (currentScreen === "vote") renderScreen();
  } catch (error) {
    submitting = false;
    label.textContent = original;

    if (error.status === 409 && myVote) {
      changingVote = false;
      const round = currentState?.round;
      if (round) {
        renderVotedScreen(round);
        votedWaiting.textContent = "Voting has closed. Your previous answer stands.";
      }
      return;
    }

    if (error.payload?.state?.round) {
      handleState(error.payload.state);
      return;
    }

    setLoginError(error.message || "That didn’t go through. Try again.");
    updateSubmitState();
  }
});

$("#retry-button").addEventListener("click", () => location.reload());

async function pollState() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const payload = await api(`/api/state?playerId=${encodeURIComponent(playerId)}`);
    if (payload?.state) {
      handleState(payload.state, payload.you);
    }
  } catch {
    // WebSocket reconnect remains the primary path.
  } finally {
    pollBusy = false;
  }
}

function startPolling() {
  if (pollTimer) return;
  pollState();
  pollTimer = setInterval(pollState, 3000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

loadTheme();

connection = new LiveConnection({
  role: "player",
  playerId,
  onState: handleState,
  onStatus(status) {
    renderConnection(connectionPill, connectionLabel, status, status === "online" ? "Live" : undefined);
    if (status === "online") {
      stopPolling();
      return;
    }

    startPolling();
    if (status === "offline") {
      if (!currentState) {
        clearTimeout(offlineTimer);
        offlineTimer = setTimeout(() => {
          if (!currentState) {
            showScreen("error");
            announce("Connection lost. We will reconnect automatically.");
          }
        }, 2500);
      }
    } else {
      clearTimeout(offlineTimer);
      if (status === "connecting" && !currentState) showScreen("connecting");
    }
  },
});

clockTimer = setInterval(updateClock, 250);

window.addEventListener("beforeunload", () => {
  connection.close();
  clearInterval(clockTimer);
  stopPolling();
});

document.body.dataset.screen = currentScreen;
