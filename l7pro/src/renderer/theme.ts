// Accent color chosen by the user: lives only in the renderer (localStorage), nothing is written to the mouse.
export const DEFAULT_ACCENT = "#00e5ff";
export const PRESET_ACCENTS = ["#00e5ff", "#ff9d2e", "#b6ff3c", "#ff3d71", "#a678ff", "#ffffff"];

const KEY = "l7.accent";
const HEX = /^#[0-9a-f]{6}$/i;

export const isAccent = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** Black or white, whichever reads better on top of the color. */
export function onAccent(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#000000" : "#ffffff";
}

export function loadAccent(): string {
  try {
    const v = localStorage.getItem(KEY);
    return isAccent(v) ? v.toLowerCase() : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function applyAccent(hex: string): void {
  const root = document.documentElement.style;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  root.setProperty("--accent", hex);
  root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.1)`);
  root.setProperty("--on-accent", onAccent(hex));
}

export function saveAccent(hex: string): void {
  applyAccent(hex);
  try {
    localStorage.setItem(KEY, hex);
  } catch {
    /* without storage the color only lasts for this session */
  }
}
