/*
 * Room Check theme application
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import {
  CHOICE_KEYS,
  DEFAULT_THEME,
  getChoiceColors,
  normalizeTheme,
  themeCssVariables,
} from "./theme-config.js";

const DEFAULT_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="1" fill="currentColor"></rect><path d="M9.5 12.5v7M16 9v14M22.5 13.5v5" fill="none" stroke="#101210" stroke-width="3" stroke-linecap="round"></path></svg>`;
const RADIUS_BY_CORNER = { sharp: "2px", soft: "8px", round: "18px" };
let currentTheme = normalizeTheme(DEFAULT_THEME);

export function getCurrentTheme() {
  return normalizeTheme(currentTheme);
}

export function applyTheme(theme, { logoUrl } = {}) {
  const next = normalizeTheme(theme);
  currentTheme = next;
  const root = document.documentElement;
  const variables = themeCssVariables(next);

  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value);
  }

  const radius = RADIUS_BY_CORNER[next.corners] || RADIUS_BY_CORNER.sharp;
  for (const key of ["--radius-card", "--radius-sm", "--radius-md", "--radius-lg"]) {
    root.style.setProperty(key, radius);
  }
  root.style.setProperty("--radius-pill", next.corners === "round" ? "999px" : radius);
  root.dataset.corners = next.corners;
  root.dataset.buttonStyle = next.buttons;

  const choiceColors = getChoiceColors(next);
  choiceColors.forEach((color, index) => {
    root.style.setProperty(`--data-${CHOICE_KEYS[index]}`, color);
  });

  const resolvedLogoUrl =
    logoUrl !== undefined
      ? logoUrl
      : next.logo
        ? `/api/theme/logo?v=${next.logo.version}`
        : null;
  applyLogo(resolvedLogoUrl);
  applyFavicon(resolvedLogoUrl);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next.colors.paper);
  document.dispatchEvent(new CustomEvent("roomcheck:theme", { detail: next }));
}

function applyLogo(url) {
  for (const mark of document.querySelectorAll(".brand-mark")) {
    mark.replaceChildren();
    mark.classList.toggle("has-logo", Boolean(url));
    if (url) {
      const image = document.createElement("img");
      image.className = "brand-logo";
      image.src = url;
      image.alt = "";
      image.decoding = "async";
      mark.append(image);
    } else {
      mark.innerHTML = DEFAULT_MARK;
    }
  }
}

function applyFavicon(url) {
  const icon = document.querySelector('link[rel="icon"]');
  if (!icon) return;
  icon.setAttribute("href", url || "/favicon.svg?v=2");
}

export async function loadTheme() {
  try {
    const response = await fetch("/api/theme", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload?.theme) {
        applyTheme(payload.theme);
        return getCurrentTheme();
      }
    }
  } catch {
    // Fall back to the default theme.
  }
  applyTheme(DEFAULT_THEME);
  return getCurrentTheme();
}
