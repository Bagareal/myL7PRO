import activeWin from "active-win";
import { exeName } from "../core/rules.js";

import type { OpenApp } from "../shared/api.js";

export type { OpenApp };

interface WinLike {
  title?: string;
  owner?: { path?: string; name?: string };
}

/** Removes invisible characters (some games put them in titles) and extra spaces. */
export function cleanText(s: string | undefined): string {
  return (s ?? "").replace(/[​-‏⁠﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** Lower-case `.exe` file name, or null if the path is not a program. */
export function exeFromPath(path: string | undefined): string | null {
  if (!path) return null;
  const name = exeName(path);
  return name.endsWith(".exe") ? name : null;
}

/** One program per exe, without the excluded ones, sorted by label. */
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

/** Foreground program (lower-case file name), or null if there is none or reading fails. */
export async function getForegroundExe(): Promise<string | null> {
  try {
    return exeFromPath((await activeWin())?.owner?.path);
  } catch {
    return null;
  }
}

/** Programs with an open window right now, plus the foreground one (full-screen games are not in the Windows list). */
export async function listOpenApps(excludeExes: string[] = []): Promise<OpenApp[]> {
  try {
    const [active, open] = await Promise.all([activeWin(), activeWin.getOpenWindows()]);
    return toOpenApps([...(active ? [active] : []), ...open], excludeExes);
  } catch {
    return [];
  }
}
