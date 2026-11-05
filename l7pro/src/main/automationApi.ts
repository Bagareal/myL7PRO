import { randomUUID } from "node:crypto";
import { PROFILE_COUNT } from "../core/protocol.js";
import { exeName } from "../core/rules.js";
import type { AutomationState } from "../core/automation.js";
import type { Rule, Settings, SettingsStore } from "../core/settings.js";
import type { AutomationView } from "../shared/api.js";

interface Deps {
  store: SettingsStore;
  /** Registra o toglie l'avvio automatico con Windows. */
  applyAutostart: (on: boolean) => void;
  /** Chiamata dopo ogni modifica riuscita (per aggiornare l'interfaccia). */
  onChange: () => void;
}

interface AutomationLike {
  state(): AutomationState;
  refresh(): void;
}

const validSlot = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < PROFILE_COUNT;

/** Modifica le impostazioni dell'automazione: valida ogni argomento, salva su file e riapplica le regole. */
export function makeAutomationApi(deps: Deps) {
  let settings: Settings = deps.store.load();
  let automation: AutomationLike | null = null;

  function commit(next: Settings): void {
    deps.store.save(next);
    settings = next;
    automation?.refresh();
    deps.onChange();
  }

  const find = (id: string): number => {
    const i = settings.rules.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`Unknown rule: ${id}`);
    return i;
  };

  return {
    attach(a: AutomationLike): void {
      automation = a;
    },

    settings(): Settings {
      return settings;
    },

    get(): AutomationView {
      if (!automation) throw new Error("Automation not ready");
      return { settings, state: automation.state() };
    },

    setDefaultSlot(slot: number): void {
      if (!validSlot(slot)) throw new Error(`Invalid profile: ${slot}`);
      commit({ ...settings, defaultSlot: slot });
    },

    addRule(input: { exe: string; label: string; slot: number }): void {
      const exe = typeof input.exe === "string" ? exeName(input.exe.trim()) : "";
      if (!exe) throw new Error("Program name is empty");
      if (!validSlot(input.slot)) throw new Error(`Invalid profile: ${input.slot}`);
      if (settings.rules.some((r) => r.exe === exe)) throw new Error(`${exe} already has a rule`);
      const rule: Rule = { id: randomUUID(), exe, label: (input.label ?? "").trim() || exe, slot: input.slot };
      commit({ ...settings, rules: [...settings.rules, rule] });
    },

    removeRule(id: string): void {
      const i = find(id);
      commit({ ...settings, rules: settings.rules.filter((_, n) => n !== i) });
    },

    setRuleSlot(id: string, slot: number): void {
      const i = find(id);
      if (!validSlot(slot)) throw new Error(`Invalid profile: ${slot}`);
      commit({ ...settings, rules: settings.rules.map((r, n) => (n === i ? { ...r, slot } : r)) });
    },

    moveRule(id: string, dir: "up" | "down"): void {
      const i = find(id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= settings.rules.length) return;
      const rules = [...settings.rules];
      [rules[i], rules[j]] = [rules[j], rules[i]];
      commit({ ...settings, rules });
    },

    setAutostart(on: boolean): void {
      if (typeof on !== "boolean") throw new Error("Invalid value");
      deps.applyAutostart(on);
      commit({ ...settings, autostart: on });
    },
  };
}

export type AutomationApi = ReturnType<typeof makeAutomationApi>;
