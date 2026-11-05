import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PROFILE_COUNT } from "./protocol.js";

export interface Rule {
  id: string;
  exe: string;
  label: string;
  slot: number;
}

export interface Settings {
  version: 1;
  defaultSlot: number;
  rules: Rule[];
  autostart: boolean;
}

export const DEFAULT_SETTINGS: Settings = { version: 1, defaultSlot: 0, rules: [], autostart: false };

const validSlot = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < PROFILE_COUNT;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Ripulisce qualunque dato letto dal file: non lancia mai errori. */
export function sanitizeSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS, rules: [] };
  const seen = new Set<string>();
  const rules: Rule[] = [];
  if (Array.isArray(raw.rules)) {
    for (const r of raw.rules) {
      if (!isObject(r) || typeof r.exe !== "string" || !validSlot(r.slot)) continue;
      const exe = r.exe.trim().toLowerCase();
      if (!exe || seen.has(exe)) continue;
      seen.add(exe);
      rules.push({
        id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
        exe,
        label: typeof r.label === "string" && r.label ? r.label : exe,
        slot: r.slot,
      });
    }
  }
  return {
    version: 1,
    defaultSlot: validSlot(raw.defaultSlot) ? raw.defaultSlot : 0,
    rules,
    autostart: raw.autostart === true,
  };
}

/** Impostazioni in `settings.json` dentro la cartella dati dell'utente. */
export class SettingsStore {
  private readonly file: string;

  constructor(private dir: string) {
    this.file = join(dir, "settings.json");
  }

  load(): Settings {
    if (!existsSync(this.file)) return sanitizeSettings(null);
    let text = "";
    try {
      text = readFileSync(this.file, "utf8");
      return sanitizeSettings(JSON.parse(text));
    } catch {
      if (text) {
        try {
          copyFileSync(this.file, `${this.file}.bak`);
        } catch {
          /* copia di sicurezza non riuscita: si parte comunque da zero */
        }
      }
      return sanitizeSettings(null);
    }
  }

  save(s: Settings): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2));
    renameSync(tmp, this.file);
  }
}
