import { BUTTON_COUNT, type KeyAction } from "./protocol.js";

/** L7 Pro buttons with the index the mouse uses (PROTOCOL.md 10.19). */
export const BUTTONS = [
  { index: 0, name: "Left button" },
  { index: 1, name: "Middle button" },
  { index: 2, name: "Right button" },
  { index: 3, name: "Advance" },
  { index: 4, name: "Back" },
] as const;

/** Buttons that make the mouse hard to use if assigned badly: they ask for confirmation. */
export const RISKY_BUTTONS: readonly number[] = [0, 1, 2];

export type KeyGroup = "Mouse" | "DPI" | "Edit" | "Multimedia" | "Other";

export interface KeyFunction {
  id: string;
  label: string;
  group: KeyGroup;
  action: KeyAction;
}

const fn = (id: string, label: string, group: KeyGroup, type: number, value: [number, number, number]): KeyFunction => ({
  id,
  label,
  group,
  action: { type, value },
});

/** Only functions captured with M HUB (PROTOCOL.md 10.19): no DPI -, profile switch, Shortcut or macros. */
export const FUNCTIONS: readonly KeyFunction[] = [
  fn("left", "Left button", "Mouse", 1, [0x01, 0, 0]),
  fn("right", "Right button", "Mouse", 1, [0x02, 0, 0]),
  fn("middle", "Middle button", "Mouse", 1, [0x04, 0, 0]),
  fn("advance", "Advance", "Mouse", 1, [0x10, 0, 0]),
  fn("back", "Back", "Mouse", 1, [0x08, 0, 0]),
  fn("wheel-up", "Wheel up", "Mouse", 1, [0, 0x02, 0]),
  fn("wheel-down", "Wheel down", "Mouse", 1, [0, 0xfe, 0]),
  fn("dpi-plus", "DPI +", "DPI", 5, [0x02, 0, 0]),
  fn("dpi-switch", "DPI switch", "DPI", 5, [0x01, 0, 0]),
  fn("cut", "Cut", "Edit", 8, [0x07, 0x01, 0x1b]),
  fn("copy", "Copy", "Edit", 8, [0x07, 0x01, 0x06]),
  fn("paste", "Paste", "Edit", 8, [0x07, 0x01, 0x19]),
  fn("play-pause", "Play/Pause", "Multimedia", 3, [0xcd, 0, 0]),
  fn("mute", "Mute", "Multimedia", 3, [0xe2, 0, 0]),
  fn("stop", "Stop", "Multimedia", 3, [0xb7, 0, 0]),
  fn("previous", "Previous Song", "Multimedia", 3, [0xb6, 0, 0]),
  fn("next", "Next song", "Multimedia", 3, [0xb5, 0, 0]),
  fn("volume-up", "Volume +", "Multimedia", 3, [0xe9, 0, 0]),
  fn("volume-down", "Volume -", "Multimedia", 3, [0xea, 0, 0]),
  fn("disable", "Disabled", "Other", 9, [0xff, 0xff, 0xff]),
];

export function functionById(id: string): KeyFunction {
  const f = FUNCTIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown key function: ${id}`);
  return f;
}

export const DEFAULT_ACTION: KeyAction = { type: 0, value: [0, 0, 0] };

export const isDefaultAction = (a: KeyAction) => a.type === 0;

// ---------- Keyboard ----------

export const MODIFIERS = [
  { name: "Ctrl", bit: 0x01 },
  { name: "Shift", bit: 0x02 },
  { name: "Alt", bit: 0x04 },
  { name: "Win", bit: 0x08 },
] as const;

/** HID usage on the keyboard page. */
export const KEYBOARD_KEYS: ReadonlyArray<{ label: string; usage: number }> = [
  ...Array.from({ length: 26 }, (_, i) => ({ label: String.fromCharCode(65 + i), usage: 0x04 + i })),
  ...[..."1234567890"].map((c, i) => ({ label: c, usage: 0x1e + i })),
  ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, usage: 0x3a + i })),
  { label: "Enter", usage: 0x28 },
  { label: "Esc", usage: 0x29 },
  { label: "Backspace", usage: 0x2a },
  { label: "Tab", usage: 0x2b },
  { label: "Space", usage: 0x2c },
  { label: "Right arrow", usage: 0x4f },
  { label: "Left arrow", usage: 0x50 },
  { label: "Down arrow", usage: 0x51 },
  { label: "Up arrow", usage: 0x52 },
];

/** Keyboard key with the modifier mask (Ctrl 1, Shift 2, Alt 4, Win 8). */
export function keyboardAction(usage: number, modifiers: number): KeyAction {
  return { type: 2, value: [modifiers & 0x0f, usage, 0] };
}

// ---------- Description ----------

export function describeAction(a: KeyAction, button: number): string {
  if (a.type === 0) return `Default (${BUTTONS[button]?.name ?? `button ${button}`})`;
  if (a.type === 2) {
    const mods = MODIFIERS.filter((m) => a.value[0] & m.bit).map((m) => m.name);
    const key = KEYBOARD_KEYS.find((k) => k.usage === a.value[1])?.label ?? `key 0x${a.value[1].toString(16)}`;
    return [...mods, key].join(" + ");
  }
  const known = FUNCTIONS.find((f) => f.action.type === a.type && f.action.value.every((b, i) => b === a.value[i]));
  return known ? known.label : `Other (type ${a.type})`;
}

// ---------- Left click protection ----------

const isLeftClick = (a: KeyAction, button: number) =>
  (a.type === 0 && button === 0) || (a.type === 1 && a.value[0] === 0x01 && a.value[1] === 0 && a.value[2] === 0);

/** True if, after assigning `next` to `button`, at least one button still does the left click. */
export function keepsLeftClick(keys: KeyAction[], button: number, next: KeyAction): boolean {
  for (let i = 0; i < BUTTON_COUNT; i++) {
    const a = i === button ? next : keys[i];
    if (a && isLeftClick(a, i)) return true;
  }
  return false;
}
