import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { makeAutomationApi } from "../src/main/automationApi.js";
import { SettingsStore } from "../src/core/settings.js";

let dir: string;
let refresh: Mock<() => void>;
let changes: number;
let autostartCalls: boolean[];

function make() {
  const api = makeAutomationApi({
    store: new SettingsStore(dir),
    applyAutostart: (on) => void autostartCalls.push(on),
    onChange: () => void changes++,
  });
  api.attach({
    refresh,
    state: () => ({ foreground: null, match: { slot: api.settings().defaultSlot, rule: null }, hold: false }),
  });
  return api;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "l7-api-"));
  refresh = vi.fn();
  changes = 0;
  autostartCalls = [];
});

describe("makeAutomationApi", () => {
  it("starts from the factory settings and get() returns settings and state", () => {
    const v = make().get();
    expect(v.settings).toMatchObject({ defaultSlot: 0, rules: [], autostart: false });
    expect(v.state.hold).toBe(false);
  });

  it("addRule creates an id, lower-cases the exe, saves and reads back after a restart", () => {
    const api = make();
    api.addRule({ exe: "R5Apex.EXE", label: "Apex", slot: 2 });
    const [r] = api.settings().rules;
    expect(r).toMatchObject({ exe: "r5apex.exe", label: "Apex", slot: 2 });
    expect(r.id).toBeTruthy();
    expect(make().settings().rules).toEqual([r]);
  });

  it("addRule accepts a path and keeps only the file name", () => {
    const api = make();
    api.addRule({ exe: ["C:", "Games", "Discovery.exe"].join(String.fromCharCode(92)), label: "", slot: 1 });
    expect(api.settings().rules[0]).toMatchObject({ exe: "discovery.exe", label: "discovery.exe" });
  });

  it.each([
    [{ exe: "", label: "x", slot: 0 }],
    [{ exe: "   ", label: "x", slot: 0 }],
    [{ exe: "a.exe", label: "x", slot: 3 }],
    [{ exe: "a.exe", label: "x", slot: -1 }],
    [{ exe: "a.exe", label: "x", slot: 1.5 }],
  ])("addRule rejects %j", (input) => {
    const api = make();
    expect(() => api.addRule(input)).toThrow();
    expect(api.settings().rules).toHaveLength(0);
  });

  it("addRule rejects a program that is already there (case-insensitive)", () => {
    const api = make();
    api.addRule({ exe: "a.exe", label: "A", slot: 0 });
    expect(() => api.addRule({ exe: "A.EXE", label: "A2", slot: 1 })).toThrow(/already/i);
  });

  it("removeRule, setRuleSlot and moveRule save and reject unknown ids or invalid slots", () => {
    const api = make();
    api.addRule({ exe: "a.exe", label: "A", slot: 0 });
    api.addRule({ exe: "b.exe", label: "B", slot: 0 });
    api.addRule({ exe: "c.exe", label: "C", slot: 0 });
    const [a, b, c] = api.settings().rules;

    api.setRuleSlot(b.id, 2);
    expect(api.settings().rules[1].slot).toBe(2);
    expect(() => api.setRuleSlot(b.id, 5)).toThrow();
    expect(() => api.setRuleSlot("nope", 1)).toThrow();

    api.moveRule(c.id, "up");
    expect(api.settings().rules.map((r) => r.exe)).toEqual(["a.exe", "c.exe", "b.exe"]);
    api.moveRule(a.id, "up");
    api.moveRule(b.id, "down");
    expect(api.settings().rules.map((r) => r.exe)).toEqual(["a.exe", "c.exe", "b.exe"]);

    api.removeRule(c.id);
    expect(api.settings().rules.map((r) => r.exe)).toEqual(["a.exe", "b.exe"]);
    expect(() => api.removeRule("nope")).toThrow();
    expect(make().settings().rules.map((r) => r.exe)).toEqual(["a.exe", "b.exe"]);
  });

  it("setDefaultSlot rejects invalid slots and saves good ones", () => {
    const api = make();
    api.setDefaultSlot(2);
    expect(make().settings().defaultSlot).toBe(2);
    expect(() => api.setDefaultSlot(3)).toThrow();
    expect(() => api.setDefaultSlot(NaN)).toThrow();
  });

  it("setAutostart saves and applies the choice to the system; rejects non-boolean values", () => {
    const api = make();
    api.setAutostart(true);
    expect(autostartCalls).toEqual([true]);
    expect(make().settings().autostart).toBe(true);
    expect(() => api.setAutostart("si" as unknown as boolean)).toThrow();
  });

  it("every change re-applies the rules and notifies the interface, a rejection does not", () => {
    const api = make();
    api.addRule({ exe: "a.exe", label: "A", slot: 0 });
    api.setDefaultSlot(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(changes).toBe(2);
    expect(() => api.setDefaultSlot(9)).toThrow();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(changes).toBe(2);
  });
});
