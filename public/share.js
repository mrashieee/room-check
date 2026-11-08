/*
 * Room Check
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { copyText } from "./common.js";
import { loadTheme } from "./theme.js";

const readyView = document.querySelector("#share-ready");
const errorView = document.querySelector("#share-error");
const errorNote = document.querySelector("#share-error-note");
const title = document.querySelector("#share-title");
const linkLabel = document.querySelector("#share-link");
const qrImage = document.querySelector("#share-qr");
const openLink = document.querySelector("#share-open");
const copyButton = document.querySelector("#share-copy");
const downloadButton = document.querySelector("#share-download");
const note = document.querySelector("#share-note");

let joinUrl = "";
let presentationTitle = "";
let qrLoaded = false;

async function request(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Could not load the audience link.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showError(message) {
  readyView.hidden = true;
  errorView.hidden = false;
  if (message) errorNote.textContent = message;
}

function setShareLink(nextUrl, nextTitle, isPublic) {
  joinUrl = nextUrl;
  presentationTitle = nextTitle || "";
  title.textContent = presentationTitle ? `Scan to join ${presentationTitle}.` : "Scan to join.";
  linkLabel.textContent = joinUrl.replace(/^https?:\/\//, "");
  linkLabel.dataset.url = joinUrl;
  openLink.href = joinUrl;
  qrLoaded = false;
  downloadButton.disabled = true;
  qrImage.src = `/api/qr?data=${encodeURIComponent(joinUrl)}`;
  readyView.hidden = false;
  errorView.hidden = true;
  note.textContent = isPublic
    ? "Public tunnel link. Keep this laptop and the tunnel running during the session."
    : "Local network link. Run npm run share for a public audience link.";
}

function wrapCanvasText(context, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const character of String(text)) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitCanvasText(context, text, maxWidth, startSize, minSize) {
  let size = startSize;
  while (size > minSize) {
    context.font = `500 ${size}px 'Golos Text', sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

async function downloadCard() {
  if (!joinUrl || !qrLoaded) {
    note.textContent = "The QR code is still loading. Try again in a moment.";
    return;
  }

  downloadButton.disabled = true;
  const original = downloadButton.textContent;
  downloadButton.textContent = "Preparing PNG…";
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const width = 1920;
    const height = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const styles = getComputedStyle(document.documentElement);
    const paper = styles.getPropertyValue("--color-paper").trim() || "#f6ecd7";
    const ink = styles.getPropertyValue("--color-ink").trim() || "#1d3b32";
    const accent = styles.getPropertyValue("--color-accent").trim() || "#2f6f5e";
    const muted = styles.getPropertyValue("--muted").trim() || "#6c6a63";

    context.fillStyle = paper;
    context.fillRect(0, 0, width, height);
    context.fillStyle = accent;
    context.fillRect(0, 0, width, 18);

    context.fillStyle = ink;
    context.font = "800 86px 'Big Shoulders Display', sans-serif";
    context.fillText("SCAN TO JOIN", 96, 170);
    context.font = "600 28px 'Golos Text', sans-serif";
    context.fillStyle = muted;
    context.fillText("POINT A PHONE CAMERA AT THE CODE", 100, 222);

    const cardTitle = presentationTitle || "Room Check";
    context.fillStyle = ink;
    context.font = "800 78px 'Big Shoulders Display', sans-serif";
    const titleLines = wrapCanvasText(context, cardTitle.slice(0, 52), 760).slice(0, 2);
    titleLines.forEach((line, index) => {
      context.fillText(line, 96, 340 + index * 82);
    });

    const qrSize = 680;
    const qrX = width - qrSize - 100;
    const qrY = 200;
    context.fillStyle = "#ffffff";
    context.fillRect(qrX - 26, qrY - 26, qrSize + 52, qrSize + 52);
    context.strokeStyle = ink;
    context.lineWidth = 4;
    context.strokeRect(qrX - 26, qrY - 26, qrSize + 52, qrSize + 52);
    context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    context.fillStyle = muted;
    context.font = "600 24px 'Golos Text', sans-serif";
    context.fillText("AUDIENCE LINK", 100, 684);
    context.fillStyle = ink;
    const linkSize = fitCanvasText(context, joinUrl, 760, 30, 18);
    context.font = `500 ${linkSize}px 'Golos Text', sans-serif`;
    context.fillText(joinUrl, 100, 724);

    context.fillStyle = muted;
    context.font = "500 24px 'Golos Text', sans-serif";
    context.fillText("Polls · Hands · Surveys", 100, 850);
    context.fillText("The audience screen stays silent. Slides stay on the projector.", 100, 892);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not create the PNG.");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "room-check-join.png";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note.textContent = "PNG downloaded. Drop it into your slide deck.";
  } catch (error) {
    note.textContent = error.message || "Could not create the PNG.";
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = original;
  }
}

qrImage.addEventListener("load", () => {
  qrLoaded = true;
  downloadButton.disabled = false;
});

qrImage.addEventListener("error", () => {
  qrLoaded = false;
  downloadButton.disabled = true;
  note.textContent = "The QR code could not load. Check the server and try again.";
});

copyButton.addEventListener("click", async () => {
  if (!joinUrl) return;
  if (await copyText(joinUrl)) {
    const original = copyButton.getAttribute("aria-label");
    copyButton.setAttribute("aria-label", "Audience link copied");
    setTimeout(() => {
      if (copyButton.getAttribute("aria-label") === "Audience link copied") {
        copyButton.setAttribute("aria-label", original || "");
      }
    }, 2000);
  }
});

downloadButton.addEventListener("click", downloadCard);

async function loadShare() {
  try {
    const [config, state] = await Promise.all([
      request("/api/config"),
      request("/api/state").catch(() => null),
    ]);
    if (!config?.joinUrl) throw new Error("The audience link is not configured.");
    setShareLink(
      config.joinUrl,
      state?.state?.presentation?.title || "",
      Boolean(config.publicUrl),
    );
  } catch (error) {
    showError(
      error.status === 401
        ? "Sign in on the interactions page, then return to this page."
        : error.message || "Start the server, then return to this page.",
    );
  }
}

loadTheme().then(() => loadShare());
