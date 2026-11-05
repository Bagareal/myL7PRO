import type { Rule, Settings } from "./settings.js";

export interface Match {
  slot: number;
  rule: Rule | null;
}

/** Nome del file senza percorso e in minuscolo. */
export function exeName(exe: string): string {
  return exe.slice(Math.max(exe.lastIndexOf("\\"), exe.lastIndexOf("/")) + 1).toLowerCase();
}

/** Sceglie lo slot per il programma in primo piano: la prima regola che corrisponde, altrimenti il profilo normale. */
export function pickSlot(exe: string | null, s: Pick<Settings, "defaultSlot" | "rules">): Match {
  if (exe) {
    const name = exeName(exe);
    const rule = s.rules.find((r) => exeName(r.exe) === name);
    if (rule) return { slot: rule.slot, rule };
  }
  return { slot: s.defaultSlot, rule: null };
}
