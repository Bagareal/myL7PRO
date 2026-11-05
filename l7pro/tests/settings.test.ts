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
  it("without a file it returns the factory values", () => {
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, defaultSlot: 0, rules: [], autostart: false });
  });

  it("saves and reads back the same data", () => {
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

  it("with an invalid file it starts from scratch and keeps the old one as .bak", () => {
    writeFileSync(join(dir, "settings.json"), "{ not json");
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
    expect(readFileSync(join(dir, "settings.json.bak"), "utf8")).toBe("{ not json");
  });

  it("with an empty file it does not throw", () => {
    writeFileSync(join(dir, "settings.json"), "");
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("sanitizeSettings", () => {
  const rule = (o: Record<string, unknown>) => ({ id: "x", label: "L", ...o });

  it.each([null, undefined, 5, "text", []])("a value %j returns the factory values", (raw) => {
    expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it("drops rules with a slot outside 0..2, an empty exe or a non-string", () => {
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

  it("keeps only the first of two rules with the same exe, case-insensitive, and saves in lower case", () => {
    const s = sanitizeSettings({
      rules: [rule({ exe: "R5Apex.EXE", slot: 2 }), rule({ exe: "r5apex.exe", slot: 1 })],
    });
    expect(s.rules).toHaveLength(1);
    expect(s.rules[0]).toMatchObject({ exe: "r5apex.exe", slot: 2 });
  });

  it("resets an invalid defaultSlot and autostart to the factory values", () => {
    expect(sanitizeSettings({ defaultSlot: 7, autostart: "si" })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ defaultSlot: 2, autostart: true })).toMatchObject({ defaultSlot: 2, autostart: true });
  });

  it("accepts an unknown version without throwing", () => {
    expect(sanitizeSettings({ version: 99, defaultSlot: 1 })).toMatchObject({ version: 1, defaultSlot: 1 });
  });

  it("gives an id and a label to a rule that has none", () => {
    const [r] = sanitizeSettings({ rules: [{ exe: "game.exe", slot: 1 }] }).rules;
    expect(r.id).toBeTruthy();
    expect(r.label).toBe("game.exe");
  });
});
