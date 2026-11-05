import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore, sanitizeSettings } from "../src/core/settings.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "l7-settings-"));
});

describe("SettingsStore", () => {
  it("senza file restituisce i valori di fabbrica", () => {
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, defaultSlot: 0, rules: [], autostart: false });
  });

  it("salva e rilegge gli stessi dati", () => {
    const store = new SettingsStore(dir);
    const s = {
      version: 1 as const,
      defaultSlot: 1,
      autostart: true,
      rules: [{ id: "a", exe: "r5apex.exe", label: "Apex", slot: 2 }],
    };
    store.save(s);
    expect(new SettingsStore(dir).load()).toEqual(s);
    expect(existsSync(join(dir, "settings.json.tmp"))).toBe(false);
  });

  it("con un file non valido parte da zero e conserva il vecchio come .bak", () => {
    writeFileSync(join(dir, "settings.json"), "{ non e' json");
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
    expect(readFileSync(join(dir, "settings.json.bak"), "utf8")).toBe("{ non e' json");
  });

  it("con un file vuoto non lancia errori", () => {
    writeFileSync(join(dir, "settings.json"), "");
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("sanitizeSettings", () => {
  const rule = (o: Record<string, unknown>) => ({ id: "x", label: "L", ...o });

  it.each([null, undefined, 5, "testo", []])("un valore %j restituisce i valori di fabbrica", (raw) => {
    expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it("scarta regole con slot fuori da 0..2, exe vuoto o non stringa", () => {
    const s = sanitizeSettings({
      rules: [
        rule({ exe: "a.exe", slot: 3 }),
        rule({ exe: "b.exe", slot: -1 }),
        rule({ exe: "c.exe", slot: 1.5 }),
        rule({ exe: "", slot: 0 }),
        rule({ exe: 5, slot: 0 }),
        rule({ exe: "ok.exe", slot: 2 }),
      ],
    });
    expect(s.rules.map((r) => r.exe)).toEqual(["ok.exe"]);
  });

  it("tiene solo la prima di due regole con lo stesso exe, senza badare alle maiuscole, e salva in minuscolo", () => {
    const s = sanitizeSettings({
      rules: [rule({ exe: "R5Apex.EXE", slot: 2 }), rule({ exe: "r5apex.exe", slot: 1 })],
    });
    expect(s.rules).toHaveLength(1);
    expect(s.rules[0]).toMatchObject({ exe: "r5apex.exe", slot: 2 });
  });

  it("riporta defaultSlot e autostart non validi ai valori di fabbrica", () => {
    expect(sanitizeSettings({ defaultSlot: 7, autostart: "si" })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ defaultSlot: 2, autostart: true })).toMatchObject({ defaultSlot: 2, autostart: true });
  });

  it("accetta una version sconosciuta senza lanciare errori", () => {
    expect(sanitizeSettings({ version: 99, defaultSlot: 1 })).toMatchObject({ version: 1, defaultSlot: 1 });
  });

  it("assegna id ed etichetta a una regola che ne e' priva", () => {
    const [r] = sanitizeSettings({ rules: [{ exe: "game.exe", slot: 1 }] }).rules;
    expect(r.id).toBeTruthy();
    expect(r.label).toBe("game.exe");
  });
});
