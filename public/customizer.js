/*
 * Room Check theme customiser
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import { api, showToast } from "./common.js";
import {
  BUTTON_STYLES,
  CHOICE_PALETTES,
  COLOR_FIELDS,
  CORNER_STYLES,
  DEFAULT_THEME,
  PALETTES,
  contrastRatio,
  normalizeTheme,
} from "./theme-config.js";
import { applyTheme, getCurrentTheme } from "./theme.js";

const MAX_LOGO_BYTES = 256 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

let overlay;
let panel;
let closeButton;
let paletteGrid;
let colorGrid;
let contrastNote;
let paletteNameInput;
let paletteSaveButton;
let paletteSaveNote;
let backgroundGroup;
let gradientFrom;
let gradientTo;
let gradientFromValue;
let gradientToValue;
let angleInput;
let angleOutput;
let backgroundPreview;
let cornerGrid;
let buttonGrid;
let choiceGrid;
let logoInput;
let logoPreview;
let logoRemove;
let logoNote;
let status;
let resetButton;
let cancelButton;
let saveButton;
let initialised = false;

let savedTheme = null;
let draft = null;
let pendingLogoFile = null;
let removeLogo = false;
let logoPreviewUrl = null;
let lastFocus = null;
let customPalettes = [];

function cloneTheme(theme) {
  return normalizeTheme(JSON.parse(JSON.stringify(theme)));
}

function setStatus(message, { error = false } = {}) {
  status.textContent = message || "";
  status.classList.toggle("is-error", Boolean(error));
}

function makeButton(className, attributes = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value)) button.dataset[dataKey] = dataValue;
    } else {
      button.setAttribute(key, value);
    }
  }
  return button;
}

function syncPaletteSelection() {
  for (const card of paletteGrid.querySelectorAll("[data-palette]")) {
    card.classList.toggle("is-selected", card.dataset.palette === draft.palette);
  }
}

function syncColorFields() {
  for (const input of colorGrid.querySelectorAll("[data-color-key]")) {
    const key = input.dataset.colorKey;
    input.value = draft.colors[key];
    const output = input.closest(".color-field")?.querySelector("output");
    if (output) output.textContent = draft.colors[key].toUpperCase();
  }
}

function syncOptionSelection(container, dataKey, value) {
  for (const option of container.querySelectorAll(`[data-${dataKey}]`)) {
    option.classList.toggle("is-selected", option.dataset[dataKey] === value);
  }
}

function syncBackground() {
  for (const button of backgroundGroup.querySelectorAll("[data-background]")) {
    button.classList.toggle("is-selected", button.dataset.background === draft.background.type);
  }
  const gradient = draft.background.type === "gradient";
  angleInput.value = String(draft.background.angle);
  angleOutput.value = `${draft.background.angle}°`;
  angleInput.disabled = !gradient;
  gradientFrom.value = draft.background.from;
  gradientTo.value = draft.background.to;
  gradientFromValue.textContent = draft.background.from.toUpperCase();
  gradientToValue.textContent = draft.background.to.toUpperCase();
  gradientFrom.disabled = !gradient;
  gradientTo.disabled = !gradient;
  gradientFrom.closest(".gradient-color-grid")?.classList.toggle("is-disabled", !gradient);
  backgroundPreview.style.background = gradient
    ? `linear-gradient(${draft.background.angle}deg, ${draft.background.from}, ${draft.background.to})`
    : draft.colors.paper;
}

function syncChoiceSelection() {
  syncOptionSelection(choiceGrid, "choice", draft.choicePalette);
}

function syncLogo() {
  logoPreview.replaceChildren();
  if (logoPreviewUrl) {
    const image = document.createElement("img");
    image.src = logoPreviewUrl;
    image.alt = "";
    logoPreview.append(image);
  } else {
    const label = document.createElement("span");
    label.className = "logo-default";
    label.textContent = "Default mark";
    logoPreview.append(label);
  }
  logoRemove.disabled = !logoPreviewUrl && !removeLogo;
  logoNote.textContent = pendingLogoFile
    ? `${pendingLogoFile.name} — save to upload.`
    : "PNG, JPG, WebP or SVG. Max 256 KB; SVGs are usually tiny.";
}

function updateContrast() {
  const inkRatio = contrastRatio(draft.colors.ink, draft.colors.paper);
  const accentRatio = contrastRatio(draft.colors.accent, draft.colors.paper);
  const readable = inkRatio >= 4.5 && accentRatio >= 3.5;
  contrastNote.classList.toggle("is-warning", !readable);
  if (inkRatio < 4.5) {
    contrastNote.textContent = `Low contrast: ink on background is ${inkRatio.toFixed(1)}:1. Darken the ink or lighten the background.`;
  } else if (accentRatio < 3.5) {
    contrastNote.textContent = `Low accent contrast: ${accentRatio.toFixed(1)}:1 on the background. Choose a darker accent.`;
  } else {
    contrastNote.textContent = `Ink ${inkRatio.toFixed(1)}:1 · accent ${accentRatio.toFixed(1)}:1 — readable.`;
  }
}

function applyDraftPreview() {
  applyTheme(draft, { logoUrl: logoPreviewUrl });
}

function syncAll() {
  syncPaletteSelection();
  syncColorFields();
  syncBackground();
  syncOptionSelection(cornerGrid, "corners", draft.corners);
  syncOptionSelection(buttonGrid, "buttons", draft.buttons);
  syncChoiceSelection();
  syncLogo();
  updateContrast();
}

function paletteCard({ key, name, note, colors, custom = false }) {
  const card = makeButton("palette-card", { dataset: { palette: key } });
  if (custom) card.classList.add("palette-card--custom");
  const swatches = document.createElement("span");
  swatches.className = "palette-swatches";
  for (const colorKey of ["paper", "surface", "ink", "primary", "accent"]) {
    const swatch = document.createElement("span");
    swatch.style.background = colors[colorKey];
    swatches.append(swatch);
  }
  const label = document.createElement("strong");
  label.textContent = name;
  const description = document.createElement("small");
  description.textContent = note;
  card.append(swatches, label, description);
  card.addEventListener("click", () => {
    draft.palette = key;
    draft.colors = { ...colors };
    draft.background.from = colors.paper;
    draft.background.to = colors.surface;
    syncPaletteSelection();
    syncColorFields();
    syncBackground();
    applyDraftPreview();
    updateContrast();
    setStatus(`${name} loaded. Save to send it to the room.`);
  });
  return card;
}

function renderPaletteGrid() {
  paletteGrid.replaceChildren();
  for (const palette of PALETTES) {
    paletteGrid.append(
      paletteCard({
        key: palette.id,
        name: palette.name,
        note: palette.note,
        colors: palette.colors,
      }),
    );
  }
  for (const palette of customPalettes) {
    paletteGrid.append(
      paletteCard({
        key: `custom:${palette.id}`,
        name: palette.name,
        note: "Saved in your data folder.",
        colors: palette.colors,
        custom: true,
      }),
    );
  }
}

async function loadCustomPalettes() {
  try {
    const result = await api("/api/host/palettes");
    customPalettes = Array.isArray(result?.palettes) ? result.palettes : [];
  } catch {
    customPalettes = [];
  }
}

async function saveCustomPalette() {
  const name = paletteNameInput.value.trim();
  if (!name) {
    setStatus("Give the palette a name first.", { error: true });
    paletteNameInput.focus();
    return;
  }
  paletteSaveButton.disabled = true;
  paletteSaveButton.textContent = "Saving…";
  try {
    const result = await api("/api/host/palettes", {
      method: "POST",
      body: { name, colors: draft.colors },
    });
    if (result?.palette) {
      customPalettes.push(result.palette);
      draft.palette = `custom:${result.palette.id}`;
      renderPaletteGrid();
      syncPaletteSelection();
      paletteNameInput.value = "";
      paletteSaveNote.textContent = `“${result.palette.name}” saved to data. Save changes to use it on the room.`;
      setStatus(`“${result.palette.name}” saved to data.`);
    }
  } catch (error) {
    setStatus(error.message || "Could not save that palette.", { error: true });
  } finally {
    paletteSaveButton.disabled = false;
    paletteSaveButton.textContent = "Save palette";
  }
}

function renderColorGrid() {
  colorGrid.replaceChildren();
  for (const field of COLOR_FIELDS) {
    const wrapper = document.createElement("div");
    wrapper.className = "color-field";
    const label = document.createElement("label");
    label.htmlFor = `theme-color-${field.key}`;
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "color";
    input.id = `theme-color-${field.key}`;
    input.dataset.colorKey = field.key;
    input.setAttribute("aria-label", field.label);
    const output = document.createElement("output");
    output.htmlFor = input.id;
    const note = document.createElement("small");
    note.className = "field-hint";
    note.textContent = field.note;
    input.addEventListener("input", () => {
      const previous = draft.colors[field.key];
      draft.colors[field.key] = input.value;
      if (field.key === "paper" && draft.background.from === previous) {
        draft.background.from = input.value;
      }
      if (field.key === "surface" && draft.background.to === previous) {
        draft.background.to = input.value;
      }
      draft.palette = "custom";
      output.textContent = input.value.toUpperCase();
      syncPaletteSelection();
      syncBackground();
      applyDraftPreview();
      updateContrast();
      setStatus("Custom colours are previewing. Save to send them to the room.");
    });
    wrapper.append(label, input, output, note);
    colorGrid.append(wrapper);
  }
}

function renderBackgroundGroup() {
  backgroundGroup.replaceChildren();
  for (const [value, label] of [
    ["flat", "Flat"],
    ["gradient", "Gradient"],
  ]) {
    const button = makeButton("", { dataset: { background: value } });
    button.textContent = label;
    button.addEventListener("click", () => {
      draft.background.type = value;
      syncBackground();
      applyDraftPreview();
      setStatus(value === "gradient" ? "Gradient preview on. Choose a start and end colour." : "Flat background preview on.");
    });
    backgroundGroup.append(button);
  }
}

function renderCornerGrid() {
  cornerGrid.replaceChildren();
  for (const style of CORNER_STYLES) {
    const button = makeButton("theme-option", { dataset: { corners: style.id } });
    const name = document.createElement("strong");
    name.textContent = style.name;
    const note = document.createElement("small");
    note.textContent = style.note;
    button.append(name, note);
    button.addEventListener("click", () => {
      draft.corners = style.id;
      syncOptionSelection(cornerGrid, "corners", style.id);
      applyDraftPreview();
    });
    cornerGrid.append(button);
  }
}

function renderButtonGrid() {
  buttonGrid.replaceChildren();
  for (const style of BUTTON_STYLES) {
    const button = makeButton("theme-option", { dataset: { buttons: style.id } });
    const name = document.createElement("strong");
    name.textContent = style.name;
    const note = document.createElement("small");
    note.textContent = style.note;
    button.append(name, note);
    button.addEventListener("click", () => {
      draft.buttons = style.id;
      syncOptionSelection(buttonGrid, "buttons", style.id);
      applyDraftPreview();
    });
    buttonGrid.append(button);
  }
}

function renderChoiceGrid() {
  choiceGrid.replaceChildren();
  for (const palette of CHOICE_PALETTES) {
    const button = makeButton("choice-palette", { dataset: { choice: palette.id } });
    const swatches = document.createElement("span");
    swatches.className = "choice-swatch-row";
    for (const color of palette.colors) {
      const swatch = document.createElement("span");
      swatch.style.background = color;
      swatches.append(swatch);
    }
    const name = document.createElement("strong");
    name.textContent = palette.name;
    button.append(swatches, name);
    button.addEventListener("click", () => {
      draft.choicePalette = palette.id;
      syncChoiceSelection();
      applyDraftPreview();
    });
    choiceGrid.append(button);
  }
}

function releasePreviewUrl() {
  logoPreviewUrl = null;
}

async function openCustomizer() {
  savedTheme = getCurrentTheme();
  draft = cloneTheme(savedTheme);
  pendingLogoFile = null;
  removeLogo = false;
  releasePreviewUrl();
  logoPreviewUrl = savedTheme.logo ? `/api/theme/logo?v=${savedTheme.logo.version}` : null;
  lastFocus = document.activeElement;
  await loadCustomPalettes();
  renderPaletteGrid();
  setStatus("Previewing locally. Save to send it to the room.");
  syncAll();
  applyDraftPreview();
  overlay.hidden = false;
  document.body.classList.add("customizer-open");
  closeButton.focus();
}

function closeCustomizer({ revert = true } = {}) {
  if (revert && savedTheme) applyTheme(savedTheme);
  releasePreviewUrl();
  pendingLogoFile = null;
  removeLogo = false;
  overlay.hidden = true;
  document.body.classList.remove("customizer-open");
  if (lastFocus instanceof HTMLElement) lastFocus.focus();
}

function validateLogo(file) {
  if (!LOGO_TYPES.includes(file.type)) {
    return "Use a PNG, JPG, WebP or SVG file.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "Keep the logo under 256 KB.";
  }
  return "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

async function handleLogoChange() {
  const file = logoInput.files?.[0];
  logoInput.value = "";
  if (!file) return;
  const issue = validateLogo(file);
  if (issue) {
    setStatus(issue, { error: true });
    return;
  }
  try {
    const preview = await readFileAsDataUrl(file);
    releasePreviewUrl();
    pendingLogoFile = file;
    removeLogo = false;
    logoPreviewUrl = preview;
    syncLogo();
    applyDraftPreview();
    setStatus("Logo previewing. Save to upload it.");
  } catch (error) {
    setStatus(error.message || "Could not read that file.", { error: true });
  }
}

async function uploadLogo(file) {
  const response = await fetch("/api/host/theme/logo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not upload the logo.");
  }
  return payload;
}

async function saveTheme() {
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  setStatus("Saving theme…");
  try {
    if (pendingLogoFile) {
      await uploadLogo(pendingLogoFile);
    } else if (removeLogo) {
      await api("/api/host/theme/logo", { method: "DELETE", body: {} });
    }

    const result = await api("/api/host/theme", {
      method: "POST",
      body: { theme: { ...draft, logo: undefined } },
    });
    savedTheme = normalizeTheme(result.theme || draft);
    draft = cloneTheme(savedTheme);
    pendingLogoFile = null;
    removeLogo = false;
    applyTheme(savedTheme);
    closeCustomizer({ revert: false });
    showToast(document.querySelector("#toast"), "Theme saved for the room.", 2600);
  } catch (error) {
    setStatus(error.message || "Could not save the theme.", { error: true });
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
  }
}

function resetTheme() {
  releasePreviewUrl();
  pendingLogoFile = null;
  removeLogo = Boolean(savedTheme?.logo);
  draft = cloneTheme(DEFAULT_THEME);
  draft.logo = null;
  syncAll();
  applyDraftPreview();
  setStatus("Default theme loaded. Save to apply it.");
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCustomizer();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled)'),
  ).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function initCustomizer() {
  if (initialised) return;
  overlay = document.querySelector("#customizer-overlay");
  panel = overlay?.querySelector(".customizer-panel");
  closeButton = document.querySelector("#customizer-close");
  paletteGrid = document.querySelector("#theme-palette-grid");
  colorGrid = document.querySelector("#theme-color-grid");
  contrastNote = document.querySelector("#theme-contrast");
  paletteNameInput = document.querySelector("#theme-palette-name");
  paletteSaveButton = document.querySelector("#theme-palette-save");
  paletteSaveNote = document.querySelector("#theme-palette-note");
  backgroundGroup = document.querySelector("#theme-background");
  gradientFrom = document.querySelector("#theme-gradient-from");
  gradientTo = document.querySelector("#theme-gradient-to");
  gradientFromValue = document.querySelector("#theme-gradient-from-value");
  gradientToValue = document.querySelector("#theme-gradient-to-value");
  angleInput = document.querySelector("#theme-angle");
  angleOutput = document.querySelector("#theme-angle-value");
  backgroundPreview = document.querySelector("#theme-background-preview");
  cornerGrid = document.querySelector("#theme-corners");
  buttonGrid = document.querySelector("#theme-buttons");
  choiceGrid = document.querySelector("#theme-choice-grid");
  logoInput = document.querySelector("#theme-logo-input");
  logoPreview = document.querySelector("#theme-logo-preview");
  logoRemove = document.querySelector("#theme-logo-remove");
  logoNote = document.querySelector("#theme-logo-note");
  status = document.querySelector("#theme-status");
  resetButton = document.querySelector("#theme-reset");
  cancelButton = document.querySelector("#theme-cancel");
  saveButton = document.querySelector("#theme-save");
  const openButton = document.querySelector("#customise-button");
  if (
    !overlay ||
    !panel ||
    !openButton ||
    !closeButton ||
    !paletteGrid ||
    !colorGrid ||
    !backgroundGroup ||
    !gradientFrom ||
    !gradientTo ||
    !gradientFromValue ||
    !gradientToValue ||
    !cornerGrid ||
    !buttonGrid ||
    !choiceGrid ||
    !paletteNameInput ||
    !paletteSaveButton ||
    !paletteSaveNote
  ) {
    return;
  }

  renderPaletteGrid();
  renderColorGrid();
  renderBackgroundGroup();
  renderCornerGrid();
  renderButtonGrid();
  renderChoiceGrid();

  openButton.addEventListener("click", () => openCustomizer());
  closeButton.addEventListener("click", () => closeCustomizer());
  cancelButton.addEventListener("click", () => closeCustomizer());
  resetButton.addEventListener("click", resetTheme);
  saveButton.addEventListener("click", saveTheme);
  paletteSaveButton.addEventListener("click", saveCustomPalette);
  paletteNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCustomPalette();
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCustomizer();
  });
  overlay.addEventListener("keydown", handleKeydown);
  angleInput.addEventListener("input", () => {
    draft.background.angle = Number(angleInput.value);
    syncBackground();
    applyDraftPreview();
  });
  gradientFrom.addEventListener("input", () => {
    draft.background.from = gradientFrom.value;
    syncBackground();
    applyDraftPreview();
    setStatus("Gradient start colour updated.");
  });
  gradientTo.addEventListener("input", () => {
    draft.background.to = gradientTo.value;
    syncBackground();
    applyDraftPreview();
    setStatus("Gradient end colour updated.");
  });
  logoInput.addEventListener("change", handleLogoChange);
  logoRemove.addEventListener("click", () => {
    releasePreviewUrl();
    pendingLogoFile = null;
    removeLogo = true;
    syncLogo();
    applyDraftPreview();
    setStatus("Logo will be removed when you save.");
  });

  initialised = true;
}
