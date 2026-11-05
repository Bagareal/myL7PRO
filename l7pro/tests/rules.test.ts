import { describe, expect, it } from "vitest";
import { pickSlot } from "../src/core/rules.js";

const rules = [
  { id: "1", exe: "r5apex.exe", label: "Apex", slot: 2 },
  { id: "2", exe: "discovery.exe", label: "The Finals", slot: 1 },
  { id: "3", exe: "discovery.exe", label: "duplicato", slot: 0 },
];
const s = { defaultSlot: 0, rules };

describe("pickSlot", () => {
  it("without rules it uses the normal profile", () => {
    expect(pickSlot("r5apex.exe", { defaultSlot: 1, rules: [] })).toEqual({ slot: 1, rule: null });
  });

  it("matches the program regardless of case", () => {
    expect(pickSlot("R5Apex.EXE", s)).toEqual({ slot: 2, rule: rules[0] });
  });

  it("matches the program even with the path in front", () => {
    expect(pickSlot(["C:", "Games", "Apex", "r5apex.exe"].join(String.fromCharCode(92)), s).slot).toBe(2);
    expect(pickSlot("/opt/games/r5apex.exe", s).slot).toBe(2);
  });

  it("when two rules match the first one wins", () => {
    expect(pickSlot("discovery.exe", s).rule).toBe(rules[1]);
  });

  it("with no match or a null program it uses the normal profile", () => {
    expect(pickSlot("chrome.exe", { defaultSlot: 0, rules })).toEqual({ slot: 0, rule: null });
    expect(pickSlot(null, { defaultSlot: 1, rules })).toEqual({ slot: 1, rule: null });
  });

  it("does not confuse a name that contains another", () => {
    expect(pickSlot("myr5apex.exe", s).rule).toBeNull();
  });
});
