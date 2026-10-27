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
  formatVoteCount,
  getPlayerId,
  pluralize,
  renderConnection,
} from "./common.js";

const playerId = getPlayerId();
const screens = {
  connecting: $("#screen-connecting"),
  waiting: $("#screen-waiting"),
  vote: $("#screen-vote"),
  voted: $("#screen-voted"),
  results: $("#screen-results"),
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
const votedOption = $("#voted-option");
const votedCount = $("#voted-count");
const votedCountLabel = $("#voted-count-label");
const votedWaiting = $("#voted-waiting");
const resultsTitle = $("#results-title");
const resultsEyebrow = $("#results-eyebrow");
const resultsWinner = $("#results-winner");
const resultsTotal = $("#results-total");
const resultsBars = $("#results-bars");
const personalResult = $("#personal-result-text");
const outcomeBanner = $("#results-outcome");
const announcer = $("#live-announcer");

let currentScreen = "connecting";
let currentState = null;
let currentRoundId = null;
let renderedRoundId = null;
let renderedResultsKey = null;
let myVote = null;
let selectedOption = null;
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

function updateSubmitState() {
  if (!voteSubmit) return;
  const roundOpen = currentState?.round?.status === "open";
  voteSubmit.disabled = !roundOpen || !selectedOption || submitting;
}

function buildVoteOptions(round) {
  voteOptions.replaceChildren();

  round.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "vote-option";
    label.dataset.color = option.color || "lime";
    label.style.setProperty("--i", String(index));

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

function renderVoteScreen(round, { force = false } = {}) {
  const roundChanged = renderedRoundId !== round.id;
  if (roundChanged || force) {
    renderedRoundId = round.id;
    selectedOption = null;
    $("#vote-question").textContent = round.question;
    $("#vote-eyebrow").textContent =
      round.title && round.title.trim().toLowerCase() !== "room check"
        ? round.title
        : "Live question";
    buildVoteOptions(round);
    voteSubmit.querySelector("span").textContent = "Lock in my answer";
    voteHelp.textContent = "Choose one. You can’t change it after you lock it in.";
    voteSubmit.disabled = true;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  const changed = showScreen("vote");
  if (changed) announce(`Voting is open. ${round.question}`);
  updateClock();
}

function renderVotedScreen(round) {
  const chosen = optionById(myVote);
  if (!chosen) {
    myVote = null;
    renderScreen();
    return;
  }

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
  if (changed) announce(`Vote locked in. You picked ${chosen.label}. Waiting for the reveal.`);
}

function resultKey(round) {
  if (!round?.results) return "";
  return (
    round.id +
    ":" +
    round.revealedAt +
    ":" +
    round.results.options.map((option) => `${option.optionId}-${option.count}`).join(",")
  );
}

function renderResults(round) {
  const total = round.results?.total || 0;
  const winners = round.results?.winners || [];
  const key = resultKey(round);

  resultsEyebrow.textContent =
    round.revealReason === "timer" ? "Time’s up · the room has spoken" : "The room has spoken";
  resultsTitle.textContent = round.question;

  if (total === 0) {
    resultsWinner.textContent = "No votes";
    resultsTotal.textContent = "The room stayed quiet";
    outcomeBanner.querySelector(".outcome-kicker").textContent = "Well then";
  } else {
    const winnerLabels = winners.map((id) => optionById(id)?.label).filter(Boolean);
    if (winners.length === 1) {
      outcomeBanner.querySelector(".outcome-kicker").textContent = "The room picked";
      resultsWinner.textContent = winnerLabels[0] || "";
    } else {
      outcomeBanner.querySelector(".outcome-kicker").textContent = `${winners.length}-way tie`;
      resultsWinner.textContent = winnerLabels.join(" · ");
    }
    resultsTotal.textContent = `${formatVoteCount(total)} ${pluralize(total, "vote")}`;
  }

  if (key !== renderedResultsKey) {
    renderedResultsKey = key;
    resultsBars.replaceChildren();

    const ordered = [...(round.results?.options || [])].sort((a, b) => b.count - a.count);
    for (const option of ordered) {
      const bar = document.createElement("div");
      bar.className = "result-bar";
      bar.dataset.color = option.color || "lime";
      if (winners.includes(option.optionId)) bar.classList.add("is-winner");

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
  } else if (!myVote) {
    personalResult.textContent = "You didn’t vote this round — the room went on without you.";
  } else {
    const chosen = optionById(myVote);
    if (winners.includes(myVote)) {
      personalResult.textContent =
        winners.length > 1
          ? `You backed the room’s favorite: ${chosen?.label || "your pick"}.`
          : "You called it. The room agreed with your pick.";
    } else {
      personalResult.textContent = `The room went another way. Your pick was ${chosen?.label || "a brave choice"}.`;
    }
  }

  const changedScreen = currentScreen !== "results";
  showScreen("results");
  if (changedScreen) {
    const summary =
      total === 0
        ? "No votes were cast."
        : `${resultsWinner.textContent || "The room has decided"}. ${formatVoteCount(total)} ${pluralize(total, "vote")}.`;
    announce(`Results are in. ${summary}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function renderWaiting() {
  const changed = showScreen("waiting");
  if (changed) announce("Waiting for the host to start the poll.");
}

function renderScreen() {
  const round = currentState?.round;
  if (!round) {
    renderWaiting();
    return;
  }

  if (round.status === "revealed") {
    renderResults(round);
    return;
  }

  if (myVote) {
    renderVotedScreen(round);
  } else {
    renderVoteScreen(round);
  }
}

function handleState(state, you) {
  const incomingNow = Number(state?.now) || 0;
  if (incomingNow && incomingNow < lastStateNow) return;
  lastStateNow = Math.max(lastStateNow, incomingNow);
  if (connection) connection.syncServerTime(state);

  const previousRoundId = currentRoundId;
  currentState = state;
  currentRoundId = state.round?.id || null;

  if (previousRoundId !== currentRoundId) {
    myVote = you && you.roundId === currentRoundId ? you.optionId || null : null;
    selectedOption = null;
    renderedRoundId = null;
    renderedResultsKey = null;
    if (state.round) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  } else if (you !== undefined) {
    if (you && you.roundId === currentRoundId) {
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
      voteSubmit.disabled = !selectedOption || submitting;
    } else {
      const remaining = round.endsAt - connection.serverNow();
      voteClock.classList.toggle("is-urgent", remaining <= 10_000);
      voteClockLabel.textContent = remaining <= 0 ? "Time" : "Closes in";
      voteClockValue.textContent = remaining <= 0 ? "Up" : formatClock(remaining);
      if (remaining <= 0) {
        voteSubmit.disabled = true;
        voteHelp.textContent = "Time’s up — the results are coming.";
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
  label.textContent = "Locking it in…";

  try {
    const result = await api("/api/vote", {
      method: "POST",
      body: { playerId, optionId: selectedOption },
    });
    submitting = false;
    label.textContent = original;
    if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    handleState(result.state, result.you);
  } catch (error) {
    submitting = false;
    label.textContent = original;

    if (error.code === "already_voted" && error.payload?.you) {
      if (error.payload.state) handleState(error.payload.state, error.payload.you);
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
