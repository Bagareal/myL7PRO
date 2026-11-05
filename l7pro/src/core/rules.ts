import type { Rule, Settings } from "./settings.js";

export interface Match {
  slot: number;
  rule: Rule | null;
}

/** File name without the path, in lower case. */
export function exeName(exe: string): string {
  return exe.slice(Math.max(exe.lastIndexOf("\\"), exe.lastIndexOf("/")) + 1).toLowerCase();
}

/** Picks the slot for the foreground program: the first matching rule, otherwise the normal profile. */
export function pickSlot(exe: string | null, s: Pick<Settings, "defaultSlot" | "rules">): Match {
  if (exe) {
    const name = exeName(exe);
    const rule = s.rules.find((r) => exeName(r.exe) === name);
    if (rule) return { slot: rule.slot, rule };
  }
  return { slot: s.defaultSlot, rule: null };
}
