/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

const PLAYER_ID_KEY = "roomcheck.playerId.v1";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function createPlayerId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) return existing;
    const created = createPlayerId();
    localStorage.setItem(PLAYER_ID_KEY, created);
    return created;
  } catch {
    return createPlayerId();
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function api(path, options = {}) {
  const init = {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  };
  if (options.body && typeof options.body !== "string") {
    init.body = JSON.stringify(options.body);
    init.headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", { status: 0 });
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(payload?.error || "Something went wrong.", {
      status: response.status,
      code: payload?.code || "",
      payload,
    });
  }
  return payload;
}

export class LiveConnection {
  constructor({ role, playerId = "", onState, onStatus }) {
    this.role = role;
    this.playerId = playerId;
    this.onState = onState || (() => {});
    this.onStatus = onStatus || (() => {});
    this.socket = null;
    this.stopped = false;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.serverOffset = 0;
    this.boundVisibility = () => {
      if (document.visibilityState === "visible" && !this.socket && !this.stopped) {
        this.attempt = 0;
        this.connect();
      }
    };
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.connect();
  }

  get url() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({ role: this.role });
    if (this.playerId) params.set("playerId", this.playerId);
    return `${protocol}//${location.host}/ws?${params.toString()}`;
  }

  connect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.onStatus("connecting");

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.onStatus("online");
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message || message.type !== "state" || !message.state) return;
      this.syncServerTime(message.state);
      const you = Object.prototype.hasOwnProperty.call(message, "you") ? message.you : undefined;
      this.onState(message.state, you);
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.onStatus("offline");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {
        // The close event handles the reconnect.
      }
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** Math.min(this.attempt, 3), 8000);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  syncServerTime(state) {
    const now = Number(state?.now);
    if (Number.isFinite(now)) this.serverOffset = now - Date.now();
  }

  close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    document.removeEventListener("visibilitychange", this.boundVisibility);
    if (this.socket) {
      try {
        this.socket.close(1000, "Leaving");
      } catch {
        // Ignore.
      }
      this.socket = null;
    }
  }
}

export function renderConnection(pill, label, status, text = "") {
  if (!pill || !label) return;
  pill.dataset.status = status;
  const defaults = {
    online: "Live",
    connecting: "Connecting",
    offline: "Reconnecting",
  };
  label.textContent = text || defaults[status] || status;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatVoteCount(count) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(count) || 0);
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

export function showToast(el, message, duration = 3000) {
  if (!el) return;
  clearTimeout(showToast.timer);
  el.textContent = message;
  el.hidden = false;
  showToast.timer = setTimeout(() => {
    el.hidden = true;
  }, duration);
}

export async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

const CONFETTI_COLORS = ["#d8ff57", "#ff6e4a", "#72dff2", "#ff9dcd", "#b8a4ff", "#ffd472", "#f2ede0"];
let confettiFrame = 0;

export function launchConfetti(canvas, { duration = 4800 } = {}) {
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  cancelAnimationFrame(confettiFrame);

  const context = canvas.getContext("2d");
  if (!context) return;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const pieces = [];
  const count = Math.min(120, Math.max(64, Math.round(width / 14)));

  for (let index = 0; index < count; index += 1) {
    const left = index % 2 === 0;
    const originX = left ? -12 : width + 12;
    const originY = height * (0.62 + Math.random() * 0.22);
    const angle = left
      ? -Math.PI / 3.1 + (Math.random() - 0.5) * 0.45
      : (-2 * Math.PI) / 3.1 + (Math.random() - 0.5) * 0.45;
    const speed = 10 + Math.random() * 17;
    const size = 4 + Math.random() * 8;
    pieces.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: 0.985 + Math.random() * 0.01,
      gravity: 0.24 + Math.random() * 0.12,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.32,
      width: size * (0.55 + Math.random() * 0.9),
      height: size,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      round: Math.random() > 0.76,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  const start = performance.now();
  let last = start;

  const draw = (now) => {
    const delta = Math.min(2.4, Math.max(0.35, (now - last) / 16.67));
    last = now;
    context.clearRect(0, 0, width, height);

    for (const piece of pieces) {
      piece.vx *= piece.drag;
      piece.vy = piece.vy * piece.drag + piece.gravity * delta;
      piece.x += piece.vx * delta;
      piece.y += piece.vy * delta;
      piece.rotation += piece.spin * delta;
      piece.wobble += 0.13 * delta;

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.globalAlpha = Math.max(0, 1 - Math.max(0, now - start - duration * 0.62) / (duration * 0.38));
      if (piece.round) {
        context.beginPath();
        context.arc(0, 0, piece.width / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      }
      context.restore();
    }

    if (now - start < duration) {
      confettiFrame = requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, width, height);
    }
  };

  confettiFrame = requestAnimationFrame(draw);
  window.addEventListener(
    "resize",
    () => {
      resize();
    },
    { once: true },
  );
}

