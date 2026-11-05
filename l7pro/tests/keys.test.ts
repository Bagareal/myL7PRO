import { describe, expect, it } from "vitest";
import {
  FUNCTIONS,
  KEYBOARD_KEYS,
  describeAction,
  functionById,
  isDefaultAction,
  keepsLeftClick,
  keyboardAction,
} from "../src/core/keys.js";
import { buildKeyWrite, parseProfileState, type KeyAction } from "../src/core/protocol.js";

const head = (b: Buffer, n: number) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, "0")).join(" ");
const DEFAULT: KeyAction = { type: 0, value: [0, 0, 0] };
const defaults = (): KeyAction[] => Array.from({ length: 6 }, () => ({ ...DEFAULT }));

describe("buildKeyWrite (0x12 0x52, catture reali di M HUB, tasto 3)", () => {
  // report 0x12, XOR 0xFF: 52 03 00 tipo v1 v2 v3
  const cases: Array<[string, KeyAction, string]> = [
    ["Mute", functionById("mute").action, "12 ad fc ff fc 1d ff ff"],
    ["Back", functionById("back").action, "12 ad fc ff fe f7 ff ff"],
    ["Wheel up", functionById("wheel-up").action, "12 ad fc ff fe ff fd ff"],
    ["DPI +", functionById("dpi-plus").action, "12 ad fc ff fa fd ff ff"],
    ["DPI switch", functionById("dpi-switch").action, "12 ad fc ff fa fe ff ff"],
    ["A", keyboardAction(0x04, 0), "12 ad fc ff fd ff fb ff"],
    ["Enter", keyboardAction(0x28, 0), "12 ad fc ff fd ff d7 ff"],
    ["F5", keyboardAction(0x3e, 0), "12 ad fc ff fd ff c1 ff"],
    ["Ctrl+C", keyboardAction(0x06, 0x01), "12 ad fc ff fd fe f9 ff"],
    ["Ctrl+Shift+Esc", keyboardAction(0x29, 0x03), "12 ad fc ff fd fc d6 ff"],
    ["Alt+Tab", keyboardAction(0x2b, 0x04), "12 ad fc ff fd fb d4 ff"],
    ["Win+D", keyboardAction(0x07, 0x08), "12 ad fc ff fd f7 f8 ff"],
    ["Disable", functionById("disable").action, "12 ad fc ff f6 00 00 00"],
    ["Default", DEFAULT, "12 ad fc ff ff ff ff ff"],
    ["Left", functionById("left").action, "12 ad fc ff fe fe ff ff"],
    ["Right", functionById("right").action, "12 ad fc ff fe fd ff ff"],
    ["Middle", functionById("middle").action, "12 ad fc ff fe fb ff ff"],
    ["Advance", functionById("advance").action, "12 ad fc ff fe ef ff ff"],
    ["Wheel down", functionById("wheel-down").action, "12 ad fc ff fe ff 01 ff"],
    ["Volume +", functionById("volume-up").action, "12 ad fc ff fc 16 ff ff"],
    ["Volume -", functionById("volume-down").action, "12 ad fc ff fc 15 ff ff"],
    ["Play/Pause", functionById("play-pause").action, "12 ad fc ff fc 32 ff ff"],
    ["Next", functionById("next").action, "12 ad fc ff fc 4a ff ff"],
    ["Previous", functionById("previous").action, "12 ad fc ff fc 49 ff ff"],
    ["Stop", functionById("stop").action, "12 ad fc ff fc 48 ff ff"],
    ["Copy", functionById("copy").action, "12 ad fc ff f7 f8 fe f9"],
    ["Cut", functionById("cut").action, "12 ad fc ff f7 f8 fe e4"],
    ["Paste", functionById("paste").action, "12 ad fc ff f7 f8 fe e6"],
  ];
  it.each(cases)("%s", (_name, action, bytes) => {
    expect(head(buildKeyWrite(3, action), 8)).toBe(bytes);
  });

  it("usa l'indice del tasto e rifiuta indici, tipi e byte non validi", () => {
    expect(head(buildKeyWrite(4, DEFAULT), 4)).toBe("12 ad fb ff");
    expect(() => buildKeyWrite(5, DEFAULT)).toThrow();
    expect(() => buildKeyWrite(-1, DEFAULT)).toThrow();
    expect(() => buildKeyWrite(3, { type: 4, value: [0, 0, 0] })).toThrow();
    expect(() => buildKeyWrite(3, { type: 10, value: [1, 0, 0] })).toThrow();
    expect(() => buildKeyWrite(3, { type: 1, value: [256, 0, 0] })).toThrow();
  });
});

describe("catalogo funzioni", () => {
  it("non contiene le funzioni non catturate", () => {
    const ids = FUNCTIONS.map((f) => f.id);
    expect(ids).not.toContain("dpi-minus");
    expect(FUNCTIONS.some((f) => f.action.type === 10 || f.action.type === 4)).toBe(false);
  });
  it("ha id unici", () => {
    const ids = FUNCTIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("i tasti della tastiera hanno usage HID standard", () => {
    const usage = (label: string) => KEYBOARD_KEYS.find((k) => k.label === label)?.usage;
    expect([usage("A"), usage("Z"), usage("1"), usage("0"), usage("F1"), usage("F12"), usage("Enter"), usage("Esc"), usage("Tab")]).toEqual([
      0x04, 0x1d, 0x1e, 0x27, 0x3a, 0x45, 0x28, 0x29, 0x2b,
    ]);
  });
});

describe("describeAction", () => {
  it("nomina le funzioni, anche quelle predefinite del tasto", () => {
    expect(describeAction(DEFAULT, 0)).toBe("Default (Left button)");
    expect(describeAction(DEFAULT, 3)).toBe("Default (Advance)");
    expect(describeAction(functionById("mute").action, 3)).toBe("Mute");
    expect(describeAction(functionById("back").action, 3)).toBe("Back");
    expect(describeAction(keyboardAction(0x06, 0x01), 3)).toBe("Ctrl + C");
    expect(describeAction(keyboardAction(0x29, 0x03), 3)).toBe("Ctrl + Shift + Esc");
    expect(describeAction(keyboardAction(0x07, 0x08), 3)).toBe("Win + D");
    expect(describeAction(functionById("disable").action, 3)).toBe("Disabled");
    expect(describeAction({ type: 10, value: [1, 0, 0] }, 3)).toBe("Other (type 10)");
  });
  it("isDefaultAction", () => {
    expect(isDefaultAction(DEFAULT)).toBe(true);
    expect(isDefaultAction(functionById("left").action)).toBe(false);
  });
});

describe("keepsLeftClick: protezione del click sinistro", () => {
  it("tutto predefinito: il click sinistro c'e'", () => {
    expect(keepsLeftClick(defaults(), 3, functionById("mute").action)).toBe(true);
  });
  it("rifiuta di togliere il click sinistro dal tasto sinistro se non c'e' altrove", () => {
    expect(keepsLeftClick(defaults(), 0, functionById("disable").action)).toBe(false);
    expect(keepsLeftClick(defaults(), 0, keyboardAction(0x04, 0))).toBe(false);
    expect(keepsLeftClick(defaults(), 0, functionById("right").action)).toBe(false);
  });
  it("permette di cambiare il sinistro se un altro tasto fa il click sinistro", () => {
    const keys = defaults();
    keys[3] = functionById("left").action;
    expect(keepsLeftClick(keys, 0, functionById("right").action)).toBe(true);
  });
  it("rifiuta di togliere il click sinistro da un altro tasto se e' l'unico", () => {
    const keys = defaults();
    keys[0] = functionById("disable").action;
    keys[3] = functionById("left").action;
    expect(keepsLeftClick(keys, 3, functionById("mute").action)).toBe(false);
  });
  it("il click sinistro esplicito sul tasto sinistro basta", () => {
    const keys = defaults();
    keys[0] = functionById("left").action;
    expect(keepsLeftClick(keys, 4, functionById("disable").action)).toBe(true);
  });
});

describe("parseProfileState: tasti", () => {
  it("legge tipo e valore dei sei tasti dai byte 20-43", () => {
    const d = new Array(64).fill(0);
    d[20 + 3 * 4] = 0x33; // tasto 3: indice 3 (nibble alto), tipo 3
    d[21 + 3 * 4] = 0xe2;
    const keys = parseProfileState(d).keys;
    expect(keys).toHaveLength(6);
    expect(keys[3]).toEqual({ type: 3, value: [0xe2, 0, 0] });
    expect(keys[0]).toEqual({ type: 0, value: [0, 0, 0] });
  });
});
