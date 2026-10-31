/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import QRCode from "qrcode";
import { WebSocketServer, WebSocket } from "ws";
import { COLOR_KEYS, DEFAULT_THEME, normalizeHex, normalizeTheme } from "./public/theme-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, ".data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const SESSION_SECRET_FILE = path.join(DATA_DIR, "session-secret");
const PALETTES_FILE = path.join(DATA_DIR, "palettes.json");
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const CURRENT_VERSION = PACKAGE_JSON.version;
const UPDATE_REPO = process.env.UPDATE_REPO || "mrashieee/room-check";
const UPDATE_API_URL =
  process.env.UPDATE_API_URL ||
  `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const UPDATE_CHECK_ENABLED = process.env.UPDATE_CHECK !== "off";
const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;
const UPDATE_ERROR_CACHE_MS = 5 * 60 * 1000;
const UPDATE_FORCE_COOLDOWN_MS = 60 * 1000;

const PORT = Number(process.env.PORT || 3000);
const HOST_BIND = process.env.BIND_ADDRESS || "0.0.0.0";
const SESSION_MAX_AGE_SEC = 60 * 60 * 12;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const SCRYPT = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 64 * 1024 * 1024,
};
const SETUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TIEBREAK_MS = 9000;
const PUBLIC_URL = String(process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
const THEME_LOGO_MAX_BYTES = 256 * 1024;
const THEME_LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const LIMITS = {
  title: 52,
  question: 160,
  option: 52,
  minOptions: 2,
  maxOptions: 10,
  minDuration: 10,
  maxDuration: 600,
  maxSurveyDuration: 3600,
  maxQuestions: 20,
};

const OPTION_COLORS = ["lime", "coral", "blue", "pink", "violet", "sand", "mint", "ice", "peach", "rose"];

function findLanAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  const virtualPattern = /^(docker|veth|br-|virbr|vmnet|tailscale|zt|tun|tap|wg|lo)/i;

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        candidates.push({ ip: entry.address, virtual: virtualPattern.test(name) });
      }
    }
  }

  const physical = candidates.filter((entry) => !entry.virtual);
  const pool = physical.length ? physical : candidates;
  const address =
    pool.find((entry) => entry.ip.startsWith("192.168."))?.ip ||
    pool.find((entry) => entry.ip.startsWith("10."))?.ip ||
    pool.find((entry) => /^172\.(1[6-9]|2\d|3[01])\./.test(entry.ip))?.ip ||
    pool[0]?.ip;
  return address || null;
}

const LAN_URL = "http://" + (findLanAddress() || "localhost") + ":" + PORT;
const JOIN_URL = PUBLIC_URL || LAN_URL;
const IS_PUBLIC = Boolean(PUBLIC_URL);

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
try {
  fs.chmodSync(DATA_DIR, 0o700);
} catch {
  // A mounted volume may manage its own permissions.
}

let SESSION_SECRET = String(process.env.SESSION_SECRET || "").trim() || null;
let authRecord = null;
let setupCode = null;
let setupInFlight = false;

/** @type {{round: null | {id:string,title:string,question:string,options:{id:string,label:string,color:string}[],durationSec:number,status:"open"|"revealed",startedAt:number,endsAt:number|null,revealedAt:number|null,revealReason:string|null,votes:Record<string,{optionId:string,at:number}>}}} */
let state = {
  round: null,
  survey: null,
  session: null,
  sessionClosedAt: null,
  theme: normalizeTheme(DEFAULT_THEME),
};
let customPalettes = [];
let updateCache = null;
let updateCacheAt = 0;
let updateCheckPromise = null;
let updateLastForceAt = 0;
let revealTimer = null;
let tieBreakTimer = null;
let surveyTimer = null;
let saveTimer = null;
let saveChain = Promise.resolve();

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeQuestion(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, LIMITS.question);
}

function validateRoundInput(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid poll details.");
  }

  const mode = body.mode === "hands" ? "hands" : "poll";
  const title = cleanString(body.title, LIMITS.title) || "Room Check";
  const question = normalizeQuestion(body.question);
  if (!question) throw new HttpError(400, "Add a question for the room.");

  if (mode === "hands") {
    return {
      mode,
      title,
      question,
      options: [],
      durationSec: 0,
      spinOnTie: false,
    };
  }

  if (!Array.isArray(body.options)) throw new HttpError(400, "Add at least two answers.");

  const options = [];
  const seen = new Set();
  for (const raw of body.options) {
    const label = cleanString(raw, LIMITS.option);
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) throw new HttpError(400, "Each answer needs to be different.");
    seen.add(key);
    options.push({
      id: "o" + (options.length + 1),
      label,
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    });
  }

  if (options.length < LIMITS.minOptions) throw new HttpError(400, "Add at least two answers.");
  if (options.length > LIMITS.maxOptions) throw new HttpError(400, "Keep it to ten answers or fewer.");

  let durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec)) durationSec = 60;
  durationSec = Math.round(durationSec);
  if (durationSec !== 0 && (durationSec < LIMITS.minDuration || durationSec > LIMITS.maxDuration)) {
    throw new HttpError(400, "Choose a timer between 10 seconds and 10 minutes, or turn it off.");
  }

  return {
    mode,
    title,
    question,
    options,
    durationSec,
    spinOnTie: body.spinOnTie !== false,
  };
}

function validateSessionInput(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid session details.");
  }

  const title = cleanString(body.title, LIMITS.title) || "Room Check";
  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  if (rawQuestions.length === 0) {
    throw new HttpError(400, "Add at least one question to the session.");
  }
  if (rawQuestions.length > LIMITS.maxQuestions) {
    throw new HttpError(400, `Keep the session to ${LIMITS.maxQuestions} questions or fewer.`);
  }

  const questions = rawQuestions.map((raw, index) => {
    try {
      return validateRoundInput({
        mode: "poll",
        title,
        question: raw?.question,
        options: raw?.options,
        durationSec: raw?.durationSec,
        spinOnTie: raw?.spinOnTie,
      });
    } catch (error) {
      throw new HttpError(
        error instanceof HttpError ? error.status : 400,
        `Question ${index + 1}: ${error?.message || "Check the question details."}`,
      );
    }
  });

  return { title, questions };
}

function validateSurveyInput(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid survey details.");
  }

  const title = cleanString(body.title, LIMITS.title) || "Room Check";
  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  if (rawQuestions.length === 0) {
    throw new HttpError(400, "Add at least one question to the survey.");
  }
  if (rawQuestions.length > LIMITS.maxQuestions) {
    throw new HttpError(400, `Keep the survey to ${LIMITS.maxQuestions} questions or fewer.`);
  }

  const questions = rawQuestions.map((raw, index) => {
    try {
      const question = validateRoundInput({
        mode: "poll",
        title,
        question: raw?.question,
        options: raw?.options,
        durationSec: 0,
        spinOnTie: false,
      });
      return {
        id: crypto.randomUUID(),
        question: question.question,
        options: question.options,
      };
    } catch (error) {
      throw new HttpError(
        error instanceof HttpError ? error.status : 400,
        `Question ${index + 1}: ${error?.message || "Check the question details."}`,
      );
    }
  });

  let durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec)) durationSec = 0;
  durationSec = Math.round(durationSec);
  if (
    durationSec !== 0 &&
    (durationSec < 60 || durationSec > LIMITS.maxSurveyDuration)
  ) {
    throw new HttpError(
      400,
      `Choose a survey timer between 1 and ${LIMITS.maxSurveyDuration / 60} minutes, or turn it off.`,
    );
  }

  return { title, questions, durationSec };
}

function createRound(details) {
  const startedAt = Date.now();
  const base = {
    id: crypto.randomUUID(),
    mode: details.mode === "hands" ? "hands" : "poll",
    title: details.title,
    question: details.question,
    status: "open",
    startedAt,
  };

  if (base.mode === "hands") {
    return {
      ...base,
      options: [],
      durationSec: 0,
      endsAt: null,
      revealedAt: null,
      revealReason: null,
      closedAt: null,
      tieBreak: null,
      votes: {},
      hands: {},
    };
  }

  return {
    ...base,
    options: details.options,
    durationSec: details.durationSec,
    spinOnTie: Boolean(details.spinOnTie),
    endsAt: details.durationSec > 0 ? startedAt + details.durationSec * 1000 : null,
    revealedAt: null,
    revealReason: null,
    tieBreak: null,
    votes: {},
  };
}

function voteCount(round) {
  return Object.keys(round.votes || {}).length;
}

function buildResults(round) {
  const total = voteCount(round);
  const counts = round.options.map((option) => ({
    optionId: option.id,
    label: option.label,
    color: option.color,
    count: 0,
  }));

  for (const vote of Object.values(round.votes || {})) {
    const target = counts.find((entry) => entry.optionId === vote.optionId);
    if (target) target.count += 1;
  }

  if (!total) {
    return {
      total: 0,
      winners: [],
      options: counts.map((entry) => ({ ...entry, percent: 0 })),
    };
  }

  const raw = counts.map((entry) => (entry.count / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    floored[order[i].index] += 1;
    remainder -= 1;
  }

  const max = Math.max(...counts.map((entry) => entry.count));
  return {
    total,
    winners: counts.filter((entry) => entry.count === max).map((entry) => entry.optionId),
    options: counts.map((entry, index) => ({ ...entry, percent: floored[index] })),
  };
}

function publicTieBreak(round, result) {
  if (!round.spinOnTie || !result || result.total === 0 || result.winners.length < 2) return null;

  const tieBreak = round.tieBreak;
  if (!tieBreak) {
    return { status: "ready", winnerOptionId: null, endsAt: null };
  }
  return {
    status: tieBreak.status,
    winnerOptionId: tieBreak.status === "done" ? tieBreak.winnerOptionId : null,
    endsAt: tieBreak.endsAt || null,
  };
}

function publicSession() {
  const session = state.session;
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    index: session.index + 1,
    total: session.questions.length,
    startedAt: session.startedAt,
  };
}

function surveyCounts(survey) {
  const questions = {};
  let totalRespondents = 0;
  for (const response of Object.values(survey.responses || {})) {
    let answeredAny = false;
    for (const question of survey.questions) {
      if (response?.answers?.[question.id]) {
        questions[question.id] = (questions[question.id] || 0) + 1;
        answeredAny = true;
      }
    }
    if (answeredAny) totalRespondents += 1;
  }
  return { totalRespondents, questions };
}

function publicSurvey(survey, { includeCounts = false } = {}) {
  return {
    id: survey.id,
    title: survey.title,
    status: survey.status,
    durationSec: survey.durationSec,
    startedAt: survey.startedAt,
    endsAt: survey.endsAt,
    closedAt: survey.closedAt || null,
    questions: survey.questions.map((question) => ({
      id: question.id,
      question: question.question,
      options: question.options.map(({ id, label, color }) => ({ id, label, color })),
    })),
    ...(includeCounts ? { counts: surveyCounts(survey) } : {}),
  };
}

function publicState({ includeCounts = false } = {}) {
  if (state.survey) {
    const survey = state.survey;
    return {
      now: Date.now(),
      round: null,
      session: null,
      survey: publicSurvey(survey, { includeCounts }),
      theme: state.theme,
      closed: survey.status === "closed",
      closedAt: survey.closedAt || null,
    };
  }

  const round = state.round;
  const session = publicSession();
  if (!round) {
    return {
      now: Date.now(),
      round: null,
      session,
      survey: null,
      theme: state.theme,
      closed: Boolean(state.sessionClosedAt),
      closedAt: state.sessionClosedAt || null,
    };
  }

  if (round.mode === "hands") {
    return {
      now: Date.now(),
      session,
      survey: null,
      theme: state.theme,
      closed: false,
      closedAt: null,
      round: {
        id: round.id,
        mode: "hands",
        title: round.title,
        question: round.question,
        status: round.status,
        startedAt: round.startedAt,
        closedAt: round.closedAt || null,
        raisedCount: Object.keys(round.hands || {}).length,
      },
    };
  }

  const result = round.status === "revealed" ? buildResults(round) : null;

  return {
    now: Date.now(),
    session,
    survey: null,
    theme: state.theme,
    closed: false,
    closedAt: null,
    round: {
      id: round.id,
      mode: "poll",
      title: round.title,
      question: round.question,
      options: round.options.map(({ id, label, color }) => ({ id, label, color })),
      status: round.status,
      durationSec: round.durationSec,
      spinOnTie: Boolean(round.spinOnTie),
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      totalVotes: voteCount(round),
      revealedAt: round.revealedAt,
      revealReason: round.revealReason,
      tieBreak: round.status === "revealed" ? publicTieBreak(round, result) : null,
      results: result,
    },
  };
}

function personalState(round, playerId, survey = null) {
  if (survey) {
    const response = playerId && Object.prototype.hasOwnProperty.call(survey.responses, playerId)
      ? survey.responses[playerId]
      : null;
    return {
      surveyId: survey.id,
      answers: response?.answers ? { ...response.answers } : {},
      updatedAt: response?.updatedAt || null,
    };
  }
  if (!round) return null;
  if (round.mode === "hands") {
    return {
      roundId: round.id,
      optionId: null,
      raised: Boolean(playerId && Object.prototype.hasOwnProperty.call(round.hands, playerId)),
    };
  }
  const hasVote =
    playerId && Object.prototype.hasOwnProperty.call(round.votes, playerId)
      ? round.votes[playerId]
      : null;
  return {
    roundId: round.id,
    optionId: hasVote ? hasVote.optionId : null,
    raised: null,
  };
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastState() {
  const playerPayload = publicState();
  const hostPayload = publicState({ includeCounts: true });
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(
      JSON.stringify({
        type: "state",
        state: client.role === "host" ? hostPayload : playerPayload,
        you:
          client.role === "host"
            ? null
            : personalState(state.round, client.playerId, state.survey),
      }),
    );
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistState();
  }, 80);
}

function persistState() {
  const snapshot = JSON.stringify(
    {
      version: 1,
      savedAt: Date.now(),
      round: state.round,
      survey: state.survey,
      session: state.session,
      sessionClosedAt: state.sessionClosedAt || null,
      theme: state.theme,
    },
    null,
    2,
  );
  saveChain = saveChain
    .then(async () => {
      const temp = STATE_FILE + ".tmp";
      await fs.promises.writeFile(temp, snapshot, { encoding: "utf8", mode: 0o600 });
      try {
        await fs.promises.chmod(temp, 0o600);
      } catch {
        // Some filesystems do not support chmod.
      }
      await fs.promises.rename(temp, STATE_FILE);
    })
    .catch((error) => {
      console.error("Could not save poll state:", error.message);
    });
  return saveChain;
}

function persistStateSync() {
  try {
    const temp = STATE_FILE + ".tmp";
    fs.writeFileSync(
      temp,
      JSON.stringify(
        {
          version: 1,
          savedAt: Date.now(),
          round: state.round,
          survey: state.survey,
          session: state.session,
          sessionClosedAt: state.sessionClosedAt || null,
          theme: state.theme,
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      fs.chmodSync(temp, 0o600);
    } catch {
      // Some filesystems do not support chmod.
    }
    fs.renameSync(temp, STATE_FILE);
  } catch (error) {
    console.error("Could not save poll state:", error.message);
  }
}

function normalizeCustomPalette(raw) {
  const name = cleanString(raw?.name, 32);
  if (!name) return null;
  const colors = {};
  for (const key of COLOR_KEYS) {
    const value = normalizeHex(raw?.colors?.[key]);
    if (!value) return null;
    colors[key] = value;
  }
  const id = /^custom-[a-zA-Z0-9-]{1,60}$/.test(raw?.id) ? raw.id : `custom-${crypto.randomUUID()}`;
  return {
    id,
    name,
    colors,
    createdAt: Number(raw?.createdAt) || Date.now(),
  };
}

function loadCustomPalettes() {
  if (!fs.existsSync(PALETTES_FILE)) return;
  try {
    fs.chmodSync(PALETTES_FILE, 0o600);
  } catch {
    // Some filesystems do not support chmod.
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PALETTES_FILE, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.palettes;
    if (!Array.isArray(list)) return;
    const seen = new Set();
    customPalettes = list
      .map((entry) => normalizeCustomPalette(entry))
      .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id))
      .slice(-30);
  } catch (error) {
    console.error("Could not read saved palettes:", error.message);
  }
}

function persistCustomPalettes() {
  try {
    const temp = PALETTES_FILE + ".tmp";
    fs.writeFileSync(
      temp,
      JSON.stringify({ version: 1, palettes: customPalettes }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      fs.chmodSync(temp, 0o600);
    } catch {
      // Some filesystems do not support chmod.
    }
    fs.renameSync(temp, PALETTES_FILE);
  } catch (error) {
    console.error("Could not save custom palettes:", error.message);
  }
}

function normalizeStoredSession(raw, round) {
  if (!raw || typeof raw !== "object" || !round || round.mode !== "poll") return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;
  if (raw.questions.length > LIMITS.maxQuestions) return null;

  const title = cleanString(raw.title, LIMITS.title) || round.title || "Room Check";
  const questions = [];
  for (const question of raw.questions) {
    try {
      questions.push(
        validateRoundInput({
          mode: "poll",
          title,
          question: question?.question,
          options: Array.isArray(question?.options)
            ? question.options.map((option) => (typeof option === "string" ? option : option?.label))
            : [],
          durationSec: question?.durationSec,
          spinOnTie: question?.spinOnTie,
        }),
      );
    } catch {
      return null;
    }
  }

  const index = Number(raw.index);
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title,
    questions,
    index,
    startedAt: Number(raw.startedAt) || Date.now(),
  };
}

function normalizeStoredSurvey(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (raw.status !== "open" && raw.status !== "closed") return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;
  if (raw.questions.length > LIMITS.maxQuestions) return null;

  const title = cleanString(raw.title, LIMITS.title) || "Room Check";
  const questions = [];
  const questionIds = new Set();
  for (const rawQuestion of raw.questions) {
    const questionText = normalizeQuestion(rawQuestion?.question);
    if (!questionText) return null;
    const questionId =
      typeof rawQuestion?.id === "string" && rawQuestion.id
        ? rawQuestion.id
        : crypto.randomUUID();
    if (questionIds.has(questionId)) return null;
    questionIds.add(questionId);

    if (!Array.isArray(rawQuestion.options)) return null;
    const options = [];
    const optionIds = new Set();
    for (const rawOption of rawQuestion.options) {
      const label = cleanString(rawOption?.label, LIMITS.option);
      const optionId =
        typeof rawOption?.id === "string" && rawOption.id
          ? rawOption.id
          : "o" + (options.length + 1);
      if (!label || optionIds.has(optionId)) return null;
      optionIds.add(optionId);
      options.push({
        id: optionId,
        label,
        color: rawOption.color || OPTION_COLORS[options.length % OPTION_COLORS.length],
      });
    }
    if (options.length < LIMITS.minOptions || options.length > LIMITS.maxOptions) return null;
    questions.push({ id: questionId, question: questionText, options });
  }

  const responses = {};
  for (const [playerId, response] of Object.entries(raw.responses || {})) {
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(playerId) || !response || typeof response !== "object") {
      continue;
    }
    const answers = {};
    for (const [questionId, optionId] of Object.entries(response.answers || {})) {
      const question = questions.find((entry) => entry.id === questionId);
      if (question && question.options.some((option) => option.id === optionId)) {
        answers[questionId] = optionId;
      }
    }
    if (Object.keys(answers).length > 0) {
      responses[playerId] = {
        answers,
        updatedAt: Number(response.updatedAt) || Date.now(),
      };
    }
  }

  let durationSec = Number(raw.durationSec) || 0;
  if (durationSec !== 0 && (durationSec < 60 || durationSec > LIMITS.maxSurveyDuration)) {
    durationSec = 0;
  }
  const startedAt = Number(raw.startedAt) || Date.now();
  let endsAt = Number(raw.endsAt) || null;
  if (durationSec > 0) {
    endsAt = endsAt || startedAt + durationSec * 1000;
  } else {
    endsAt = null;
  }
  const status = raw.status;
  const closedAt = status === "closed" ? Number(raw.closedAt) || Date.now() : null;

  return {
    id: raw.id,
    title,
    questions,
    responses,
    status,
    durationSec,
    startedAt,
    endsAt,
    closedAt,
    revealReason: raw.revealReason || null,
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    fs.chmodSync(STATE_FILE, 0o600);
  } catch {
    // Some filesystems do not support chmod.
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    state.session = null;
    state.sessionClosedAt = Number(raw?.sessionClosedAt) || null;
    state.theme = normalizeTheme(raw?.theme);
    if (state.theme.logo) {
      const logoPath = path.join(DATA_DIR, `theme-logo.${THEME_LOGO_TYPES[state.theme.logo.type] || "bin"}`);
      if (!fs.existsSync(logoPath)) state.theme.logo = null;
    }

    const survey = normalizeStoredSurvey(raw?.survey);
    if (survey) {
      if (
        survey.status === "open" &&
        survey.endsAt &&
        survey.endsAt <= Date.now()
      ) {
        survey.status = "closed";
        survey.closedAt = Date.now();
        survey.revealReason = "timer";
      }
      state.round = null;
      state.session = null;
      state.survey = survey;
      state.sessionClosedAt = survey.closedAt || null;
      return;
    }
    state.survey = null;

    const round = raw?.round;
    if (!round || typeof round !== "object") return;
    state.sessionClosedAt = null;
    if (typeof round.id !== "string" || typeof round.question !== "string") return;

    if (round.mode === "hands") {
      if (round.status !== "open" && round.status !== "closed") return;
      const cleanHands = {};
      for (const [playerId, hand] of Object.entries(round.hands || {})) {
        if (/^[a-zA-Z0-9_-]{16,64}$/.test(playerId) && hand && typeof hand === "object") {
          cleanHands[playerId] = {
            raisedAt: Number(hand.raisedAt) || Date.now(),
          };
        }
      }
      state.session = null;
      state.round = {
        id: round.id,
        mode: "hands",
        title: cleanString(round.title, LIMITS.title) || "Room Check",
        question: normalizeQuestion(round.question),
        status: round.status,
        startedAt: Number(round.startedAt) || Date.now(),
        closedAt: Number(round.closedAt) || null,
        options: [],
        durationSec: 0,
        endsAt: null,
        revealedAt: null,
        revealReason: null,
        tieBreak: null,
        votes: {},
        hands: cleanHands,
      };
      return;
    }

    if (!Array.isArray(round.options) || round.options.length < LIMITS.minOptions) return;
    if (round.status !== "open" && round.status !== "revealed") return;

    const validOptions = new Set(round.options.map((option) => option.id));
    const cleanVotes = {};
    for (const [playerId, vote] of Object.entries(round.votes || {})) {
      if (
        /^[a-zA-Z0-9_-]{16,64}$/.test(playerId) &&
        vote &&
        typeof vote === "object" &&
        validOptions.has(vote.optionId)
      ) {
        cleanVotes[playerId] = {
          optionId: vote.optionId,
          at: Number(vote.at) || Date.now(),
        };
      }
    }

    let cleanTieBreak = null;
    if (round.status === "revealed" && round.tieBreak && typeof round.tieBreak === "object") {
      const pool = Array.isArray(round.tieBreak.pool)
        ? round.tieBreak.pool.filter((optionId) => validOptions.has(optionId))
        : [];
      const winnerOptionId =
        typeof round.tieBreak.winnerOptionId === "string" &&
        validOptions.has(round.tieBreak.winnerOptionId)
          ? round.tieBreak.winnerOptionId
          : null;
      if (
        (round.tieBreak.status === "spinning" || round.tieBreak.status === "done") &&
        pool.length >= 2 &&
        winnerOptionId
      ) {
        cleanTieBreak = {
          status: round.tieBreak.status,
          pool,
          winnerOptionId,
          startedAt: Number(round.tieBreak.startedAt) || Date.now(),
          endsAt: Number(round.tieBreak.endsAt) || Date.now(),
          completedAt: Number(round.tieBreak.completedAt) || null,
        };
      }
    }

    state.round = {
      ...round,
      mode: "poll",
      title: cleanString(round.title, LIMITS.title) || "Room Check",
      question: normalizeQuestion(round.question),
      options: round.options.map((option, index) => ({
        id: option.id,
        label: cleanString(option.label, LIMITS.option),
        color: option.color || OPTION_COLORS[index % OPTION_COLORS.length],
      })),
      votes: cleanVotes,
      spinOnTie: Boolean(round.spinOnTie),
      durationSec: Number(round.durationSec) || 0,
      endsAt: Number(round.endsAt) || null,
      startedAt: Number(round.startedAt) || Date.now(),
      revealedAt: Number(round.revealedAt) || null,
      revealReason: round.revealReason || null,
      tieBreak: round.status === "open" ? null : cleanTieBreak,
    };
    state.session = normalizeStoredSession(raw?.session, state.round);

    if (state.round.status === "open" && state.round.endsAt && state.round.endsAt <= Date.now()) {
      state.round.status = "revealed";
      state.round.revealedAt = Date.now();
      state.round.revealReason = "timer";
      persistState();
    }

    if (
      state.round.tieBreak?.status === "spinning" &&
      state.round.tieBreak.endsAt <= Date.now()
    ) {
      state.round.tieBreak.status = "done";
      state.round.tieBreak.completedAt = Date.now();
      persistState();
    }
  } catch (error) {
    console.error("Could not restore the last poll:", error.message);
  }
}

function armRevealTimer() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  const round = state.round;
  if (!round || round.mode === "hands" || round.status !== "open" || !round.endsAt) return;
  const remaining = Math.max(0, round.endsAt - Date.now());
  revealTimer = setTimeout(() => {
    revealTimer = null;
    revealRound("timer");
  }, remaining);
}

function armTieBreakTimer() {
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  const tieBreak = state.round?.tieBreak;
  if (!tieBreak || tieBreak.status !== "spinning") return;
  const remaining = Math.max(0, tieBreak.endsAt - Date.now());
  tieBreakTimer = setTimeout(() => {
    tieBreakTimer = null;
    completeTieBreak();
  }, remaining);
}

function completeTieBreak() {
  const tieBreak = state.round?.tieBreak;
  if (!tieBreak || tieBreak.status !== "spinning") return;
  tieBreak.status = "done";
  tieBreak.completedAt = Date.now();
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  scheduleSave();
  broadcastState();
}

function revealRound(reason) {
  const round = state.round;
  if (!round || round.mode === "hands" || round.status !== "open") return false;
  round.status = "revealed";
  round.revealedAt = Date.now();
  round.revealReason = reason;
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  scheduleSave();
  broadcastState();
  return true;
}

function openRound(details) {
  if (state.round?.status === "open") {
    throw new HttpError(409, "A round is already open. Finish it before starting another.");
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }
  state.survey = null;
  state.session = null;
  state.sessionClosedAt = null;
  state.round = createRound(details);
  armRevealTimer();
  scheduleSave();
  broadcastState();
  return state.round;
}

function startSession(details) {
  if (state.round?.status === "open") {
    throw new HttpError(409, "A round is already open. Finish it before starting another.");
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  const startedAt = Date.now();
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }
  state.survey = null;
  state.sessionClosedAt = null;
  state.session = {
    id: crypto.randomUUID(),
    title: details.title,
    questions: details.questions,
    index: 0,
    startedAt,
  };
  state.round = createRound(details.questions[0]);
  armRevealTimer();
  scheduleSave();
  broadcastState();
  return state.round;
}

function armSurveyTimer() {
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }
  const survey = state.survey;
  if (!survey || survey.status !== "open" || !survey.endsAt) return;
  const remaining = Math.max(0, survey.endsAt - Date.now());
  surveyTimer = setTimeout(() => {
    surveyTimer = null;
    closeSurvey("timer");
  }, remaining);
}

function startSurvey(details) {
  if (state.round?.status === "open") {
    throw new HttpError(409, "A round is already open. Finish it before starting another.");
  }
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }

  const startedAt = Date.now();
  state.round = null;
  state.session = null;
  state.sessionClosedAt = null;
  state.survey = {
    id: crypto.randomUUID(),
    title: details.title,
    questions: details.questions,
    responses: {},
    status: "open",
    durationSec: details.durationSec,
    startedAt,
    endsAt: details.durationSec > 0 ? startedAt + details.durationSec * 1000 : null,
    closedAt: null,
    revealReason: null,
  };
  armSurveyTimer();
  scheduleSave();
  broadcastState();
  return state.survey;
}

function closeSurvey(reason = "host") {
  const survey = state.survey;
  if (!survey || survey.status !== "open") return false;
  survey.status = "closed";
  survey.closedAt = Date.now();
  survey.revealReason = reason;
  state.sessionClosedAt = survey.closedAt;
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }
  scheduleSave();
  broadcastState();
  return true;
}

function submitSurveyAnswer(playerId, questionId, optionId) {
  const survey = state.survey;
  if (!survey || survey.status !== "open") {
    throw new HttpError(409, "The survey is closed.");
  }
  if (survey.endsAt && Date.now() >= survey.endsAt) {
    closeSurvey("timer");
    throw new HttpError(409, "Time is up. The survey is closed.");
  }

  const question = survey.questions.find((entry) => entry.id === questionId);
  if (!question) throw new HttpError(400, "That question is not part of this survey.");
  if (!question.options.some((option) => option.id === optionId)) {
    throw new HttpError(400, "Pick one of the answers on screen.");
  }

  const existing = survey.responses[playerId] || { answers: {}, updatedAt: null };
  existing.answers = { ...(existing.answers || {}), [questionId]: optionId };
  existing.updatedAt = Date.now();
  survey.responses[playerId] = existing;
  scheduleSave();
  broadcastState();
  return survey;
}

function advanceSession() {
  const session = state.session;
  if (!session) {
    throw new HttpError(409, "There is no multi-question session active.");
  }
  if (!state.round || state.round.status !== "revealed") {
    throw new HttpError(409, "Reveal the current question before moving on.");
  }
  if (state.round.tieBreak && state.round.tieBreak.status !== "done") {
    throw new HttpError(409, "Finish the tie-breaker before moving on.");
  }
  if (session.index + 1 >= session.questions.length) {
    throw new HttpError(409, "This is the last question in the session.");
  }

  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  session.index += 1;
  state.round = createRound(session.questions[session.index]);
  armRevealTimer();
  scheduleSave();
  broadcastState();
  return state.round;
}

function resetRound() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  if (surveyTimer) {
    clearTimeout(surveyTimer);
    surveyTimer = null;
  }
  state.round = null;
  state.survey = null;
  state.session = null;
  state.sessionClosedAt = null;
  scheduleSave();
  broadcastState();
}

function endSession() {
  if (state.survey) {
    closeSurvey("host");
    return;
  }
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  if (tieBreakTimer) {
    clearTimeout(tieBreakTimer);
    tieBreakTimer = null;
  }
  state.round = null;
  state.session = null;
  state.sessionClosedAt = Date.now();
  scheduleSave();
  broadcastState();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(raw);
    } catch {
      cookies[key] = raw;
    }
  }
  return cookies;
}

function signSession(expires) {
  const payload = `${expires}.${authRecord.sessionId}`;
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return payload + "." + signature;
}

function verifySession(value) {
  if (typeof value !== "string" || !authRecord) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const expires = Number(parts[0]);
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;
  if (parts[1] !== authRecord.sessionId) return false;
  const payload = parts[0] + "." + parts[1];
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isHostAuthed(req) {
  return Boolean(authRecord) && verifySession(parseCookies(req).roomcheck_host);
}

function setHostCookie(req, res) {
  const expires = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const cookie = [
    "roomcheck_host=" + encodeURIComponent(signSession(expires)),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + SESSION_MAX_AGE_SEC,
  ];
  if (requestIsSecure(req)) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function clearHostCookie(req, res) {
  const cookie = ["roomcheck_host=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (requestIsSecure(req)) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function requestIsSecure(req) {
  if (req.secure) return true;
  const forwarded = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  return forwarded === "https";
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeSetupCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateSetupCode() {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += SETUP_CODE_ALPHABET[crypto.randomInt(SETUP_CODE_ALPHABET.length)];
  }
  return code.slice(0, 4) + "-" + code.slice(4);
}

function setupCodeMatches(candidate) {
  if (!setupCode) return false;
  return safeEqualText(normalizeSetupCode(candidate), normalizeSetupCode(setupCode));
}

function validPassword(password) {
  if (typeof password !== "string") return "Enter a password.";
  if (password.trim().length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Keep the password under ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return "";
}

function ensureSessionSecret() {
  if (SESSION_SECRET) return SESSION_SECRET;

  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const saved = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim();
      if (saved.length >= 32) {
        SESSION_SECRET = saved;
        return SESSION_SECRET;
      }
    }

    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SESSION_SECRET_FILE, generated + "\n", { mode: 0o600 });
    try {
      fs.chmodSync(SESSION_SECRET_FILE, 0o600);
    } catch {
      // Some filesystems do not support chmod.
    }
    SESSION_SECRET = generated;
    return SESSION_SECRET;
  } catch (error) {
    console.warn("Could not persist the session secret:", error.message);
    SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    return SESSION_SECRET;
  }
}

function isValidAuthRecord(record) {
  if (!record || typeof record !== "object" || record.version !== 1) return false;
  if (typeof record.sessionId !== "string" || record.sessionId.length < 16) return false;
  const password = record.password;
  if (!password || typeof password !== "object") return false;
  if (password.algorithm !== "scrypt") return false;
  if (password.N !== SCRYPT.N || password.r !== SCRYPT.r || password.p !== SCRYPT.p) return false;
  if (password.keylen !== SCRYPT.keylen) return false;
  if (typeof password.salt !== "string" || typeof password.hash !== "string") return false;
  const salt = Buffer.from(password.salt, "base64");
  const hash = Buffer.from(password.hash, "base64");
  return salt.length >= 16 && hash.length === SCRYPT.keylen;
}

function readAuthRecord() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    if (!isValidAuthRecord(record)) {
      console.warn("The saved host password file is invalid. First-run setup will be available.");
      return null;
    }
    return record;
  } catch (error) {
    console.warn("Could not read the host password file:", error.message);
    return null;
  }
}

function initAuth() {
  ensureSessionSecret();
  authRecord = readAuthRecord();
  setupCode = authRecord ? null : generateSetupCode();
}

function scryptPassword(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

async function createAuthRecord(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptPassword(password, salt, SCRYPT.keylen);
  return {
    version: 1,
    sessionId: crypto.randomBytes(18).toString("base64url"),
    password: {
      algorithm: "scrypt",
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      keylen: SCRYPT.keylen,
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
    },
    createdAt: new Date().toISOString(),
  };
}

async function verifyPassword(password) {
  if (!isValidAuthRecord(authRecord)) return false;
  if (typeof password !== "string" || password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    const salt = Buffer.from(authRecord.password.salt, "base64");
    const expected = Buffer.from(authRecord.password.hash, "base64");
    const actual = await scryptPassword(password, salt, authRecord.password.keylen);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function saveAuthRecord(record) {
  const temp = AUTH_FILE + ".tmp";
  await fs.promises.writeFile(temp, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  try {
    await fs.promises.chmod(temp, 0o600);
  } catch {
    // Some filesystems do not support chmod.
  }
  await fs.promises.rename(temp, AUTH_FILE);
}

const loginAttempts = new Map();

function loginAllowed(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 0, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  return entry.count < 8;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function requireHost(req, res, next) {
  if (!isHostAuthed(req)) {
    return res.status(401).json({ error: "Host access required.", code: "host_required" });
  }
  next();
}

function parseVersionParts(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => {
      const number = Number.parseInt(part, 10);
      return Number.isFinite(number) ? number : 0;
    });
}

function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function updateInstallMode() {
  return fs.existsSync(path.join(__dirname, ".git")) ? "git" : "archive";
}

async function getUpdateStatus({ force = false } = {}) {
  const now = Date.now();
  const base = {
    currentVersion: CURRENT_VERSION,
    installMode: updateInstallMode(),
    updateAvailable: false,
    latestVersion: null,
    releaseName: null,
    releaseUrl: null,
    releaseNotes: null,
    publishedAt: null,
    checkedAt: updateCacheAt || null,
    error: null,
    disabled: !UPDATE_CHECK_ENABLED,
  };

  if (!UPDATE_CHECK_ENABLED) {
    return { ...base, error: "Update checks are disabled." };
  }

  const cacheAge = updateCacheAt ? now - updateCacheAt : Infinity;
  const cacheLimit = updateCache?.error ? UPDATE_ERROR_CACHE_MS : UPDATE_CACHE_MS;
  if (!force && updateCache && cacheAge < cacheLimit) {
    return updateCache;
  }
  if (force && updateCache && now - updateLastForceAt < UPDATE_FORCE_COOLDOWN_MS) {
    return updateCache;
  }
  if (updateCheckPromise) return updateCheckPromise;

  if (force) updateLastForceAt = now;
  updateCheckPromise = (async () => {
    try {
      const response = await fetch(UPDATE_API_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "room-check-update-check",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}. Try again later.`);
      }
      const release = await response.json();
      const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");
      if (!/^\d+\.\d+\.\d+/.test(latestVersion)) {
        throw new Error("The latest release does not have a valid version tag.");
      }
      const update = {
        ...base,
        latestVersion,
        updateAvailable: compareVersions(latestVersion, CURRENT_VERSION) > 0,
        releaseName: cleanString(release.name, 120) || `v${latestVersion}`,
        releaseUrl: /^https:\/\/github\.com\//i.test(String(release.html_url || ""))
          ? release.html_url
          : `https://github.com/${UPDATE_REPO}/releases/tag/v${latestVersion}`,
        releaseNotes: typeof release.body === "string" ? release.body.slice(0, 8000) : "",
        publishedAt: release.published_at || null,
        checkedAt: Date.now(),
        error: null,
      };
      updateCache = update;
      updateCacheAt = Date.now();
      return update;
    } catch (error) {
      const failed = {
        ...base,
        checkedAt: Date.now(),
        error: error?.message || "Could not check for updates.",
      };
      updateCache = failed;
      updateCacheAt = Date.now();
      return failed;
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

function logoPath(ext) {
  return path.join(DATA_DIR, `theme-logo.${ext}`);
}

function removeLogoFiles() {
  for (const ext of new Set(Object.values(THEME_LOGO_TYPES))) {
    try {
      fs.unlinkSync(logoPath(ext));
    } catch {
      // Nothing to remove.
    }
  }
}

function sanitizeSvgBuffer(buffer) {
  const text = buffer.toString("utf8").trim();
  if (!/<svg[\s>]/i.test(text)) {
    throw new HttpError(400, "That SVG does not contain an SVG root.");
  }
  if (
    /<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:|<!ENTITY|<!DOCTYPE|href\s*=\s*["']\s*(?:https?:|\/\/|data:text\/html)/i.test(
      text,
    )
  ) {
    throw new HttpError(400, "That SVG contains something unsafe. Remove scripts, event handlers and external links.");
  }
  return Buffer.from(text, "utf8");
}

function identifyLogo(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, "Choose a logo file.");
  }
  if (buffer.length > THEME_LOGO_MAX_BYTES) {
    throw new HttpError(413, "Keep the logo under 256 KB.");
  }

  if (mime === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.subarray(0, 8).equals(signature)) throw new HttpError(400, "That PNG is not valid.");
    return { ext: "png", type: mime, buffer };
  }
  if (mime === "image/jpeg") {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new HttpError(400, "That JPEG is not valid.");
    }
    return { ext: "jpg", type: mime, buffer };
  }
  if (mime === "image/webp") {
    if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
      throw new HttpError(400, "That WebP is not valid.");
    }
    return { ext: "webp", type: mime, buffer };
  }
  if (mime === "image/svg+xml") {
    return { ext: "svg", type: mime, buffer: sanitizeSvgBuffer(buffer) };
  }
  throw new HttpError(415, "Use a PNG, JPEG, WebP or SVG logo.");
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json({ limit: "32kb" }));

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }),
);

app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "player.html"));
});

app.get("/join", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "player.html"));
});

app.get("/host", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(PUBLIC_DIR, "host.html"));
});

app.get("/updates", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "updates.html"));
});

app.get("/healthz", (req, res) => {
  res.json({ ok: true, round: state.round?.status || "idle" });
});

app.get("/api/config", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    joinUrl: JOIN_URL,
    publicUrl: IS_PUBLIC,
    title: "Room Check",
    limits: LIMITS,
  });
});

app.get("/api/state", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const playerId = typeof req.query.playerId === "string" ? req.query.playerId : "";
  const validPlayer = /^[a-zA-Z0-9_-]{16,64}$/.test(playerId) ? playerId : "";
  res.json({
    state: publicState(),
    you: personalState(state.round, validPlayer, state.survey),
  });
});

app.get("/api/update", async (req, res, next) => {
  try {
    const update = await getUpdateStatus({ force: req.query.force === "1" });
    res.setHeader("Cache-Control", "no-store");
    res.json({ update });
  } catch (error) {
    next(error);
  }
});

app.get("/api/theme", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ theme: state.theme });
});

app.get("/api/theme/logo", (req, res) => {
  const logo = state.theme?.logo;
  if (!logo) return res.status(404).end();
  const ext = THEME_LOGO_TYPES[logo.type];
  if (!ext) return res.status(404).end();
  try {
    const buffer = fs.readFileSync(logoPath(ext));
    res.setHeader("Content-Type", logo.type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.send(buffer);
  } catch {
    res.status(404).end();
  }
});

app.get("/api/qr", async (req, res, next) => {
  try {
    const data = typeof req.query.data === "string" ? req.query.data.trim() : "";
    if (!data || data.length > 500 || !/^https?:\/\//i.test(data)) {
      throw new HttpError(400, "A valid http or https link is required for the QR code.");
    }
    const svg = await QRCode.toString(data, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: {
        dark: "#101210",
        light: "#ffffff",
      },
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get("/api/host/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    configured: Boolean(authRecord),
    authed: Boolean(authRecord) && isHostAuthed(req),
  });
});

app.post("/api/host/setup", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (authRecord) {
    return res.status(409).json({
      error: "The host password is already set.",
      code: "already_configured",
    });
  }
  if (setupInFlight) {
    return res.status(409).json({ error: "Setup is already in progress. Try again." });
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!loginAllowed(ip)) {
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
  }

  if (!setupCodeMatches(req.body?.setupCode)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: "That setup code is not right. Check the terminal." });
  }

  const passwordIssue = validPassword(req.body?.password);
  if (passwordIssue) {
    return res.status(400).json({ error: passwordIssue });
  }

  setupInFlight = true;
  try {
    const record = await createAuthRecord(req.body.password);
    await saveAuthRecord(record);
    authRecord = record;
    setupCode = null;
    loginAttempts.delete(ip);
    setHostCookie(req, res);
    console.log("Host password configured successfully.");
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  } finally {
    setupInFlight = false;
  }
});

app.post("/api/host/login", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!authRecord) {
    return res.status(409).json({
      error: "Set up a host password first.",
      code: "setup_required",
    });
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!loginAllowed(ip)) {
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
  }

  try {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const valid = await verifyPassword(password);
    if (!valid) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "That password is not right." });
    }
    loginAttempts.delete(ip);
    setHostCookie(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/logout", (req, res) => {
  clearHostCookie(req, res);
  res.json({ ok: true });
});

app.get("/api/host/state", requireHost, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ state: publicState({ includeCounts: true }) });
});

app.get("/api/host/palettes", requireHost, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ palettes: customPalettes });
});

app.post("/api/host/palettes", requireHost, (req, res, next) => {
  try {
    const name = cleanString(req.body?.name, 32);
    if (!name) throw new HttpError(400, "Give the palette a name.");
    if (customPalettes.some((palette) => palette.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, "A palette with that name already exists.");
    }
    const colors = {};
    for (const key of COLOR_KEYS) {
      const value = normalizeHex(req.body?.colors?.[key]);
      if (!value) throw new HttpError(400, "The palette needs all five colours.");
      colors[key] = value;
    }
    const palette = {
      id: `custom-${crypto.randomUUID()}`,
      name,
      colors,
      createdAt: Date.now(),
    };
    customPalettes = [...customPalettes, palette].slice(-30);
    persistCustomPalettes();
    res.status(201).json({ ok: true, palette });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/host/palettes/:id", requireHost, (req, res) => {
  const id = String(req.params.id || "");
  const next = customPalettes.filter((palette) => palette.id !== id);
  if (next.length === customPalettes.length) {
    return res.status(404).json({ error: "That palette was not found." });
  }
  customPalettes = next;
  persistCustomPalettes();
  res.json({ ok: true });
});

app.post("/api/host/theme", requireHost, (req, res, next) => {
  try {
    const nextTheme = normalizeTheme({
      ...(req.body?.theme && typeof req.body.theme === "object" ? req.body.theme : {}),
      logo: state.theme?.logo || null,
    });
    state.theme = nextTheme;
    scheduleSave();
    broadcastState();
    res.json({ ok: true, theme: nextTheme, state: publicState() });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/host/theme/logo",
  requireHost,
  express.raw({ type: () => true, limit: "300kb" }),
  (req, res, next) => {
    try {
      const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const logo = identifyLogo(req.body, mime);
      removeLogoFiles();
      fs.writeFileSync(logoPath(logo.ext), logo.buffer, { mode: 0o600 });
      try {
        fs.chmodSync(logoPath(logo.ext), 0o600);
      } catch {
        // Some filesystems do not support chmod.
      }
      state.theme = normalizeTheme({
        ...state.theme,
        logo: { version: Date.now(), type: logo.type },
      });
      scheduleSave();
      broadcastState();
      res.json({ ok: true, theme: state.theme, state: publicState() });
    } catch (error) {
      next(error);
    }
  },
);

app.delete("/api/host/theme/logo", requireHost, (req, res) => {
  removeLogoFiles();
  state.theme = normalizeTheme({ ...state.theme, logo: null });
  scheduleSave();
  broadcastState();
  res.json({ ok: true, theme: state.theme, state: publicState() });
});

app.post("/api/host/survey/start", requireHost, (req, res, next) => {
  try {
    const details = validateSurveyInput(req.body);
    const survey = startSurvey(details);
    res.json({ ok: true, surveyId: survey.id, state: publicState({ includeCounts: true }) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/survey/answer", (req, res, next) => {
  try {
    const playerId = typeof req.body?.playerId === "string" ? req.body.playerId : "";
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(playerId)) {
      throw new HttpError(400, "This browser could not be identified. Reload and try again.");
    }
    const questionId = typeof req.body?.questionId === "string" ? req.body.questionId : "";
    const optionId = typeof req.body?.optionId === "string" ? req.body.optionId : "";
    const survey = submitSurveyAnswer(playerId, questionId, optionId);
    res.json({
      ok: true,
      state: publicState(),
      you: personalState(null, playerId, survey),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/session/start", requireHost, (req, res, next) => {
  try {
    const details = validateSessionInput(req.body);
    const round = startSession(details);
    res.json({ ok: true, roundId: round.id, state: publicState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/session/next", requireHost, (req, res, next) => {
  try {
    const round = advanceSession();
    res.json({ ok: true, roundId: round.id, state: publicState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/open", requireHost, (req, res, next) => {
  try {
    const details = validateRoundInput(req.body);
    const round = openRound(details);
    res.json({ ok: true, roundId: round.id, state: publicState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/reveal", requireHost, (req, res) => {
  const wasRevealed = state.round?.status === "revealed";
  const revealed = revealRound("host");
  if (!revealed && !wasRevealed) {
    return res.status(409).json({ error: "There is no open round to reveal." });
  }
  res.json({ ok: true, state: publicState() });
});

app.post("/api/host/tiebreak/spin", requireHost, (req, res, next) => {
  try {
    const round = state.round;
    if (!round || round.status !== "revealed" || round.mode !== "poll") {
      throw new HttpError(409, "Reveal the poll before spinning the wheel.");
    }
    if (!round.spinOnTie) {
      throw new HttpError(409, "The tie-breaker wheel is not enabled for this poll.");
    }

    const results = buildResults(round);
    if (results.winners.length < 2) {
      throw new HttpError(409, "This poll is not tied.");
    }
    if (round.tieBreak) {
      throw new HttpError(409, "The tie-breaker has already been used for this round.");
    }

    const winnerOptionId = results.winners[crypto.randomInt(results.winners.length)];
    const now = Date.now();
    round.tieBreak = {
      status: "spinning",
      pool: [...results.winners],
      winnerOptionId,
      startedAt: now,
      endsAt: now + TIEBREAK_MS,
      completedAt: null,
    };
    armTieBreakTimer();
    scheduleSave();
    broadcastState();

    res.json({
      ok: true,
      winnerOptionId,
      endsAt: round.tieBreak.endsAt,
      state: publicState(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/host/reset", requireHost, (req, res) => {
  resetRound();
  res.json({ ok: true, state: publicState() });
});

app.post("/api/host/end", requireHost, (req, res) => {
  endSession();
  res.json({ ok: true, state: publicState({ includeCounts: true }) });
});

app.post("/api/host/hands/close", requireHost, (req, res) => {
  const round = state.round;
  if (!round || round.mode !== "hands") {
    return res.status(409).json({ error: "There is no live-hands round open." });
  }
  if (round.status === "open") {
    round.status = "closed";
    round.closedAt = Date.now();
    scheduleSave();
    broadcastState();
  }
  res.json({ ok: true, state: publicState() });
});

app.post("/api/hands", (req, res, next) => {
  try {
    const round = state.round;
    if (!round || round.mode !== "hands") {
      throw new HttpError(409, "There is no live-hands round open.");
    }
    if (round.status !== "open") {
      throw new HttpError(409, "The host has closed the hands.");
    }

    const playerId = typeof req.body?.playerId === "string" ? req.body.playerId : "";
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(playerId)) {
      throw new HttpError(400, "This browser could not be identified. Reload and try again.");
    }

    const raised = Boolean(req.body?.raised);
    const currentlyRaised = Object.prototype.hasOwnProperty.call(round.hands, playerId);
    if (raised && !currentlyRaised) {
      round.hands[playerId] = { raisedAt: Date.now() };
      scheduleSave();
      broadcastState();
    } else if (!raised && currentlyRaised) {
      delete round.hands[playerId];
      scheduleSave();
      broadcastState();
    }

    res.json({
      ok: true,
      state: publicState(),
      you: personalState(round, playerId),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/vote", (req, res, next) => {
  try {
    const round = state.round;
    if (!round || round.status !== "open") {
      throw new HttpError(409, "Voting is closed.");
    }
    if (round.mode !== "poll") {
      throw new HttpError(409, "This round does not use votes.");
    }
    if (round.endsAt && Date.now() >= round.endsAt) {
      revealRound("timer");
      throw new HttpError(409, "Time is up. The results are being revealed.");
    }

    const playerId = typeof req.body?.playerId === "string" ? req.body.playerId : "";
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(playerId)) {
      throw new HttpError(400, "This browser could not be identified. Reload and try again.");
    }

    const optionId = typeof req.body?.optionId === "string" ? req.body.optionId : "";
    if (!round.options.some((option) => option.id === optionId)) {
      throw new HttpError(400, "Pick one of the answers on screen.");
    }

    const updated = Object.prototype.hasOwnProperty.call(round.votes, playerId);
    round.votes[playerId] = { optionId, at: Date.now() };
    scheduleSave();
    broadcastState();
    res.json({
      ok: true,
      updated,
      state: publicState(),
      you: personalState(round, playerId),
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }
  res.status(404).type("text").send("Not found");
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError) && Number(error?.status) >= 400 && Number(error?.status) < 500) {
    status = Number(error.status);
  }
  if (status >= 500) console.error(error);
  const message = status >= 500 ? "Something went wrong." : error.message || "Bad request.";
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const role = url.searchParams.get("role") === "host" ? "host" : "player";
  if (role === "host" && !isHostAuthed(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const rawPlayerId = url.searchParams.get("playerId") || "";
  const playerId = /^[a-zA-Z0-9_-]{16,64}$/.test(rawPlayerId) ? rawPlayerId : "";

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.role = role;
    ws.playerId = playerId;
    ws.isAlive = true;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  const currentState = publicState();
  sendJson(ws, {
    type: "state",
    state: ws.role === "host" ? publicState({ includeCounts: true }) : currentState,
    you:
      ws.role === "host"
        ? null
        : personalState(state.round, ws.playerId, state.survey),
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("error", () => {
    // The close handler cleans up; avoid noisy crashes from flaky venue Wi-Fi.
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, 30_000);

initAuth();
loadCustomPalettes();
loadState();
armRevealTimer();
armTieBreakTimer();
armSurveyTimer();

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT in .env.`);
  } else {
    console.error("Server error:", error.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST_BIND, () => {
  const audience = IS_PUBLIC ? JOIN_URL : LAN_URL;
  const line = "─".repeat(58);
  console.log("");
  console.log("  ROOM CHECK");
  console.log("  " + line);
  console.log("  Audience     " + audience);
  console.log("  Host console http://localhost:" + PORT + "/host");
  console.log("  Host auth    " + (authRecord ? "Password protected" : "First-run setup needed"));
  console.log("  Mode         " + (IS_PUBLIC ? "Public link" : "Same Wi-Fi / LAN"));
  console.log("  " + line);
  if (authRecord) {
    console.log("  Open the host console and keep this process running.");
  } else {
    console.log("  FIRST-RUN SETUP CODE: " + setupCode);
    console.log("  Open the host console and create your password.");
  }
  console.log("");
});

function shutdown() {
  clearInterval(heartbeat);
  if (revealTimer) clearTimeout(revealTimer);
  if (tieBreakTimer) clearTimeout(tieBreakTimer);
  if (surveyTimer) clearTimeout(surveyTimer);
  if (saveTimer) clearTimeout(saveTimer);
  persistStateSync();
  for (const ws of wss.clients) {
    try {
      ws.close(1001, "Server shutting down");
    } catch {
      // Ignore already-closed sockets.
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});
