import { describe, expect, it } from "vitest";
import { pickSlot } from "../src/core/rules.js";

const rules = [
  { id: "1", exe: "r5apex.exe", label: "Apex", slot: 2 },
  { id: "2", exe: "discovery.exe", label: "The Finals", slot: 1 },
  { id: "3", exe: "discovery.exe", label: "duplicato", slot: 0 },
];
const s = { defaultSlot: 0, rules };

describe("pickSlot", () => {
  it("senza regole usa il profilo normale", () => {
    expect(pickSlot("r5apex.exe", { defaultSlot: 1, rules: [] })).toEqual({ slot: 1, rule: null });
  });

  it("riconosce il programma senza badare alle maiuscole", () => {
    expect(pickSlot("R5Apex.EXE", s)).toEqual({ slot: 2, rule: rules[0] });
  });

  it("riconosce il programma anche con il percorso davanti", () => {
    expect(pickSlot(["C:", "Games", "Apex", "r5apex.exe"].join(String.fromCharCode(92)), s).slot).toBe(2);
    expect(pickSlot("/opt/games/r5apex.exe", s).slot).toBe(2);
  });

  it("se due regole corrispondono vince la prima", () => {
    expect(pickSlot("discovery.exe", s).rule).toBe(rules[1]);
  });

  it("senza corrispondenza o con programma nullo usa il profilo normale", () => {
    expect(pickSlot("chrome.exe", { defaultSlot: 0, rules })).toEqual({ slot: 0, rule: null });
    expect(pickSlot(null, { defaultSlot: 1, rules })).toEqual({ slot: 1, rule: null });
  });

  it("non confonde un nome che ne contiene un altro", () => {
    expect(pickSlot("myr5apex.exe", s).rule).toBeNull();
  });
});
