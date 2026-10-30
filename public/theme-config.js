/*
 * Room Check theme configuration
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

export const THEME_VERSION = 1;
export const COLOR_KEYS = ["paper", "surface", "ink", "primary", "accent"];
export const CHOICE_KEYS = ["lime", "coral", "blue", "pink", "violet", "sand", "mint", "ice", "peach", "rose"];

export const COLOR_FIELDS = [
  { key: "paper", label: "Background", note: "The page behind everything." },
  { key: "surface", label: "Surface", note: "Cards, panels and the gradient end." },
  { key: "ink", label: "Ink", note: "Text, borders and hard shadows." },
  { key: "primary", label: "Primary", note: "Main actions and the live state." },
  { key: "accent", label: "Accent", note: "Rules, focus and secondary signals." },
];

export const DEFAULT_THEME = {
  version: THEME_VERSION,
  palette: "shore",
  colors: {
    paper: "#f6ecd7",
    surface: "#e7d8bd",
    ink: "#1d3b32",
    primary: "#39745a",
    accent: "#2f6f5e",
  },
  background: { type: "flat", angle: 135, from: "#f6ecd7", to: "#e7d8bd" },
  corners: "sharp",
  buttons: "solid",
  choicePalette: "print",
  logo: null,
};

export const PALETTES = [
  {
    id: "ocean",
    name: "Ocean",
    note: "Deep current, tidal teal and foam.",
    colors: {
      paper: "#041f2b",
      surface: "#083442",
      ink: "#e6faff",
      primary: "#2f9bff",
      accent: "#4fd1c5",
    },
  },
  {
    id: "noir",
    name: "Noir",
    note: "Black paper, bone ink and a warm signal.",
    colors: {
      paper: "#101010",
      surface: "#1b1b1b",
      ink: "#f2eadf",
      primary: "#e0b354",
      accent: "#e05d44",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    note: "Ink-black navy, neon violet and ice cyan.",
    colors: {
      paper: "#16161e",
      surface: "#1f2335",
      ink: "#c0caf5",
      primary: "#bb9af7",
      accent: "#7dcfff",
    },
  },
  {
    id: "shore",
    name: "Shore",
    note: "Morning sand, seagrass and sea glass.",
    colors: {
      paper: "#f6ecd7",
      surface: "#e7d8bd",
      ink: "#1d3b32",
      primary: "#39745a",
      accent: "#2f6f5e",
    },
  },
  {
    id: "studio",
    name: "Studio",
    note: "Bone paper, charcoal and vermilion.",
    colors: {
      paper: "#f4efe6",
      surface: "#e7dfd2",
      ink: "#181614",
      primary: "#1f1f1f",
      accent: "#c4472d",
    },
  },
  {
    id: "candy",
    name: "Candy",
    note: "Blush paper, berry and gold.",
    colors: {
      paper: "#fbeaf0",
      surface: "#f0d6e0",
      ink: "#351723",
      primary: "#f4b942",
      accent: "#b23a6b",
    },
  },
];

export const CHOICE_PALETTES = [
  {
    id: "print",
    name: "Print",
    colors: ["#ebc831", "#dd6d45", "#5b9cba", "#d48490", "#9978a8", "#e4ac59", "#80b38a", "#78afbc", "#de8f57", "#c1657c"],
  },
  {
    id: "bright",
    name: "Bright",
    colors: ["#f6d34a", "#f08a5d", "#6bb7d6", "#e58bb0", "#a78bd4", "#e8c56a", "#7fc9a4", "#8ab8e0", "#e9a36f", "#d77f9a"],
  },
  {
    id: "cool",
    name: "Cool",
    colors: ["#7fb3c9", "#5b9bb8", "#7bc0b2", "#9bb8d9", "#6c9f9a", "#a5c8d8", "#89b7a8", "#6f8fb0", "#b3d0d8", "#86a9b8"],
  },
  {
    id: "warm",
    name: "Warm",
    colors: ["#e8b04a", "#d96b4a", "#c98b4a", "#d9a15f", "#b75a4a", "#e3c07a", "#cf7f5a", "#d6a36a", "#bf6f4f", "#e0b87a"],
  },
  {
    id: "mono",
    name: "Mono",
    colors: ["#ece8df", "#ddd8ce", "#cec8bd", "#beb7ab", "#aea69a", "#9e9589", "#8e8578", "#7e7568", "#6e6558", "#5e5548"],
  },
  {
    id: "garden",
    name: "Garden",
    colors: ["#a8c686", "#7fa66a", "#c7b45a", "#d18b5b", "#8aa8a1", "#b9c97f", "#e0c98b", "#6f8f6a", "#c9a1a1", "#9bbf9a"],
  },
];

export const CORNER_STYLES = [
  { id: "sharp", name: "Sharp", note: "2px cuts, print-like." },
  { id: "soft", name: "Soft", note: "8px, a little warmer." },
  { id: "round", name: "Round", note: "18px, friendly." },
];

export const BUTTON_STYLES = [
  { id: "solid", name: "Solid", note: "Accent fill, hard shadow." },
  { id: "outline", name: "Outline", note: "Paper fill, accent rule." },
  { id: "minimal", name: "Minimal", note: "Ink action, no depth." },
];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(HEX);
  if (!match) return fallback;
  const raw = match[1].toLowerCase();
  return "#" + (raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw);
}

export function hexToRgb(value) {
  const hex = normalizeHex(value, "#000000").slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function relativeLuminance(value) {
  const { r, g, b } = hexToRgb(value);
  const channel = (part) => {
    const normalized = part / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(left, right) {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function paletteById(id) {
  return PALETTES.find((palette) => palette.id === id) || null;
}

export function choicePaletteById(id) {
  return CHOICE_PALETTES.find((palette) => palette.id === id) || null;
}

export function getChoiceColors(theme) {
  const palette = choicePaletteById(theme?.choicePalette) || CHOICE_PALETTES[0];
  return [...palette.colors];
}

export function themeFromPalette(id) {
  const palette = paletteById(id);
  if (!palette) return structuredClone(DEFAULT_THEME);
  return {
    ...structuredClone(DEFAULT_THEME),
    palette: palette.id,
    colors: { ...palette.colors },
  };
}

export function normalizeTheme(input) {
  const source = input && typeof input === "object" ? input : {};
  const legacyPaletteId =
    source.palette === "carnival" ? "shore" : source.palette === "orchard" ? "candy" : source.palette;
  const legacyPreset = paletteById(legacyPaletteId);
  const colorsSource = legacyPreset
    ? legacyPreset.colors
    : source.colors && typeof source.colors === "object"
      ? source.colors
      : {};
  const colors = {};
  for (const key of COLOR_KEYS) {
    colors[key] = normalizeHex(colorsSource[key], DEFAULT_THEME.colors[key]);
  }

  const paletteId =
    PALETTES.some((palette) => palette.id === legacyPaletteId) ||
    /^custom:[a-zA-Z0-9-]{1,60}$/.test(legacyPaletteId)
      ? legacyPaletteId
      : "custom";
  const backgroundType = source.background?.type === "gradient" ? "gradient" : "flat";
  const angle = Number(source.background?.angle);
  const backgroundFrom = normalizeHex(source.background?.from, colors.paper);
  const backgroundTo = normalizeHex(source.background?.to, colors.surface);
  const corners = CORNER_STYLES.some((style) => style.id === source.corners) ? source.corners : "sharp";
  const buttons = BUTTON_STYLES.some((style) => style.id === source.buttons) ? source.buttons : "solid";
  const choicePalette = choicePaletteById(source.choicePalette) ? source.choicePalette : "print";
  const logoSource = source.logo && typeof source.logo === "object" ? source.logo : null;
  const logo =
    logoSource &&
    Number.isFinite(Number(logoSource.version)) &&
    ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(logoSource.type)
      ? { version: Number(logoSource.version), type: logoSource.type }
      : null;

  return {
    version: THEME_VERSION,
    palette: paletteId,
    colors,
    background: {
      type: backgroundType,
      angle: Number.isFinite(angle) ? Math.max(0, Math.min(360, Math.round(angle))) : 135,
      from: backgroundFrom,
      to: backgroundTo,
    },
    corners,
    buttons,
    choicePalette,
    logo,
  };
}

export function themeCssVariables(theme) {
  const t = normalizeTheme(theme);
  const primaryInk =
    contrastRatio(t.colors.primary, t.colors.ink) >= contrastRatio(t.colors.primary, t.colors.paper)
      ? t.colors.ink
      : t.colors.paper;
  const darkPaper = relativeLuminance(t.colors.paper) < 0.35;
  const shadow = darkPaper
    ? `color-mix(in oklch, ${t.colors.paper} 35%, black)`
    : t.colors.ink;
  return {
    "--color-paper": t.colors.paper,
    "--color-paper-2": t.colors.surface,
    "--color-paper-3": `color-mix(in oklch, ${t.colors.surface} 84%, ${t.colors.ink})`,
    "--color-ink": t.colors.ink,
    "--color-shadow": shadow,
    "--color-accent": t.colors.primary,
    "--color-accent-2": t.colors.accent,
    "--color-accent-ink": primaryInk,
    "--color-focus": t.colors.accent,
    "--page-background":
      t.background.type === "gradient"
        ? `linear-gradient(${t.background.angle}deg, ${t.background.from}, ${t.background.to})`
        : t.colors.paper,
  };
}
