import activeWin from "active-win";
import { exeName } from "../core/rules.js";

import type { OpenApp } from "../shared/api.js";

export type { OpenApp };

interface WinLike {
  title?: string;
  owner?: { path?: string; name?: string };
}

/** Toglie i caratteri invisibili (alcuni giochi li mettono nei titoli) e gli spazi in eccesso. */
export function cleanText(s: string | undefined): string {
  return (s ?? "").replace(/[​-‏⁠﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** Nome del file `.exe` in minuscolo, o null se il percorso non e' di un programma. */
export function exeFromPath(path: string | undefined): string | null {
  if (!path) return null;
  const name = exeName(path);
  return name.endsWith(".exe") ? name : null;
}

/** Un programma per ogni exe, senza quelli da escludere, ordinati per etichetta. */
export function toOpenApps(windows: WinLike[], excludeExes: string[]): OpenApp[] {
  const skip = excludeExes.map((e) => e.toLowerCase());
  const byExe = new Map<string, OpenApp>();
  for (const w of windows) {
    const exe = exeFromPath(w.owner?.path);
    if (!exe || skip.includes(exe) || byExe.has(exe)) continue;
    byExe.set(exe, { exe, label: cleanText(w.owner?.name) || exe, title: cleanText(w.title) });
  }
  return [...byExe.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Programma in primo piano (nome del file in minuscolo), o null se non c'e' o la lettura fallisce. */
export async function getForegroundExe(): Promise<string | null> {
  try {
    return exeFromPath((await activeWin())?.owner?.path);
  } catch {
    return null;
  }
}

/** Programmi con una finestra aperta adesso, piu' quello in primo piano (i giochi a schermo intero non sono nell'elenco di Windows). */
export async function listOpenApps(excludeExes: string[] = []): Promise<OpenApp[]> {
  try {
    const [active, open] = await Promise.all([activeWin(), activeWin.getOpenWindows()]);
    return toOpenApps([...(active ? [active] : []), ...open], excludeExes);
  } catch {
    return [];
  }
}
