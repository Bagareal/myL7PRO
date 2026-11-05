// Encoding and decoding of the 0x11/0x12 protocol (see PROTOCOL.md, sections 3 and 10).
// Only commands verified on the real mouse.

export const VENDOR_ID = 0x5253;
export const PRODUCT_IDS = [0x1020, 0x1021];
export const CONFIG_USAGE_PAGE = 0xff01;
export const CONFIG_USAGE = 1;

export const REPORT_SHORT = 0x11; // 20-byte payload
export const REPORT_LONG = 0x12; // 64-byte payload
export const REPORT_CONFIRM = 0x13; // confirmation input report

const PAYLOAD_LEN: Record<number, number> = { [REPORT_SHORT]: 20, [REPORT_LONG]: 64 };

export const DPI_MIN = 200;
export const DPI_MAX = 26000;
export const DPI_LEVELS = 6;
/** M HUB Restore defaults values (captured by the user on 2026-11-05). */
export const DPI_FACTORY = [400, 800, 1600, 3200, 6400, 26000];
export const PROFILE_COUNT = 3;
export const KEY_SLOTS = 6;
/** L7 Pro buttons: 0 left, 1 middle, 2 right, 3 Advance, 4 Back. */
export const BUTTON_COUNT = 5;
/** Types captured with M HUB: 0 default, 1 mouse, 2 keyboard, 3 multimedia, 5 DPI, 8 shortcut, 9 disabled. */
const KEY_TYPES = [0, 1, 2, 3, 5, 8, 9];

export const POLLING_RATES: Record<number, number[]> = {
  0x1020: [125, 500, 1000, 2000, 4000, 8000],
  0x1021: [125, 500, 1000],
};

/** Builds the buffer to pass to sendFeatureReport (report ID first, inverted bytes). */
export function encodeRequest(reportId: number, cmd: number, args: number[] = []): Buffer {
  const len = PAYLOAD_LEN[reportId];
  if (len === undefined) throw new Error(`Unsupported report ID: 0x${reportId.toString(16)}`);
  const logical = [cmd, ...args];
  if (logical.length > len) throw new Error("Payload too long");
  const out = Buffer.alloc(len + 1, 0xff);
  out[0] = reportId;
  logical.forEach((b, i) => {
    out[i + 1] = (b & 0xff) ^ 0xff;
  });
  return out;
}

/** Inverts the bytes (XOR 0xFF). */
export function unxor(buf: Uint8Array): number[] {
  return Array.from(buf, (b) => b ^ 0xff);
}

export interface Response {
  cmd: number;
  data: number[]; // logical data, starting at index 2 of the raw answer
}

/** Decodes a feature report that was read: index 0 = report ID, 1 = inverted command, 2.. = inverted data. */
export function decodeResponse(raw: Buffer): Response {
  return { cmd: raw[1] ^ 0xff, data: unxor(raw.subarray(2)) };
}

// ---------- Profile state (0x12 0x67) ----------

export interface ProfileState {
  profile: number;
  usbDpiIndex: number;
  usbRateIndex: number;
  wirelessDpiIndex: number;
  wirelessRateIndex: number;
  reserved: number;
  dpi: number[]; // 6 levels, X axis
  dpiY: number[]; // 6 levels, Y axis
  activeLevels: number;
  sensor: number;
  debounce: number;
  sleep: number;
  /** Sensor angle in degrees, signed (byte 49). */
  rotate: number;
  /** Six buttons (bytes 20-43); the L7 Pro uses five. */
  keys: KeyAction[];
}

/** Function of a button: type (0 = default) and three value bytes (PROTOCOL.md 5.7 and 10.19). */
export interface KeyAction {
  type: number;
  value: [number, number, number];
}

const u16 = (d: number[], o: number) => d[o] | (d[o + 1] << 8);

export function parseProfileState(d: number[]): ProfileState {
  return {
    profile: d[0],
    usbRateIndex: d[1] >> 4,
    usbDpiIndex: d[1] & 0x0f,
    wirelessRateIndex: d[2] >> 4,
    wirelessDpiIndex: d[2] & 0x0f,
    reserved: d[3],
    dpi: Array.from({ length: DPI_LEVELS }, (_, i) => u16(d, 4 + i * 2)),
    activeLevels: d[16],
    sensor: d[17],
    debounce: d[18],
    sleep: d[19],
    rotate: (d[49] << 24) >> 24,
    keys: Array.from({ length: KEY_SLOTS }, (_, i) => ({
      type: d[20 + i * 4] & 0x0f,
      value: [d[21 + i * 4], d[22 + i * 4], d[23 + i * 4]] as [number, number, number],
    })),
    dpiY: Array.from({ length: DPI_LEVELS }, (_, i) => u16(d, 51 + i * 2)),
  };
}

export interface SensorSettings {
  lodMm: 1 | 2 | null;
  rippleControl: boolean;
  angleSnapping: boolean;
  motionSync: boolean;
  mode: "Performance" | "Gaming" | "Extreme";
}

/** Sensor byte of 0x67 (PROTOCOL.md 4.1.1): bits 0-1 LOD, 2 ripple, 3 angle snapping, 4 motion sync, 6-7 mode. */
export function parseSensor(byte: number): SensorSettings {
  const lod = byte & 0x03;
  const mode = (byte & 0x80) === 0 ? "Performance" : (byte & 0x40) === 0 ? "Gaming" : "Extreme";
  return {
    lodMm: lod === 1 ? 1 : lod === 2 ? 2 : null,
    rippleControl: (byte & 0x04) !== 0,
    angleSnapping: (byte & 0x08) !== 0,
    motionSync: (byte & 0x10) !== 0,
    mode,
  };
}

/** The Performance/Gaming/Extreme modes exist from mouse firmware 5.12.4.4. */
export function supportsGameMode(firmware: string): boolean {
  const parts = firmware.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false;
  const min = [5, 12, 4, 4];
  for (let i = 0; i < 4; i++) {
    if (parts[i] !== min[i]) return parts[i] > min[i];
  }
  return true;
}

export interface ReceiverInfo {
  bond: number;
  vid: number;
  pid: number;
  connect: number;
  game: number;
}

export function parseReceiverInfo(d: number[]): ReceiverInfo {
  return { bond: d[0], vid: u16(d, 1), pid: u16(d, 3), connect: d[5], game: d[6] };
}

export interface DeviceStatus {
  vid: number;
  pid: number;
  connectMode: number;
  connected: boolean;
  battery: number;
  charge: number;
}

/** 0x11 0x06: vid, pid, firmware (u32), mode/status byte, battery, charge. Layout from code, not fully verified yet. */
export function parseDeviceStatus(d: number[]): DeviceStatus {
  return {
    vid: u16(d, 0),
    pid: u16(d, 2),
    connectMode: d[8] & 0x07,
    connected: ((d[8] >> 3) & 1) === 1,
    battery: d[9],
    charge: d[10],
  };
}

/** Version: uint8 length, then an ASCII string. */
export function parseVersion(d: number[]): string {
  return String.fromCharCode(...d.slice(1, 1 + d[0]));
}

/** Profile name: one header byte, then UTF-8 with trailing zeros. Format "name$source$id". */
export function parseProfileName(d: number[]): string {
  const bytes = d.slice(1);
  const end = bytes.indexOf(0);
  const text = Buffer.from(end < 0 ? bytes : bytes.slice(0, end)).toString("utf8");
  return text.split("$")[0];
}

// ---------- Verified writes ----------

/** 0x11 0x58 PP: onboard profile switch. */
export function buildProfileSwitch(profile: number): Buffer {
  if (!Number.isInteger(profile) || profile < 0 || profile >= PROFILE_COUNT) {
    throw new Error(`Invalid profile: ${profile} (allowed 0..${PROFILE_COUNT - 1})`);
  }
  return encodeRequest(REPORT_SHORT, 0x58, [profile]);
}

export const PROFILE_NAME_MAX = 16;

/**
 * 0x12 0x59 SLOT NAME: renames an onboard profile (PROTOCOL.md 10.13). The name is plain ASCII, without
 * a length and without "$source$id"; the 0xFF padding acts as terminator. Verified with names of 8 and 9 characters:
 * the limit of 16 and printable-only ASCII are a cautious choice, not an M HUB limit.
 */
export function buildProfileRename(slot: number, name: string): Buffer {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PROFILE_COUNT) {
    throw new Error(`Invalid profile: ${slot} (allowed 0..${PROFILE_COUNT - 1})`);
  }
  if (name.trim() === "") throw new Error("The name cannot be empty");
  if (name.length > PROFILE_NAME_MAX) throw new Error(`The name is too long (max ${PROFILE_NAME_MAX} characters)`);
  if (!/^[\x20-\x7e]+$/.test(name) || name.includes("$")) {
    throw new Error("The name can only contain letters, digits, spaces and basic punctuation (no $)");
  }
  return encodeRequest(REPORT_LONG, 0x59, [slot, ...Array.from(name, (c) => c.charCodeAt(0))]);
}

/** 0x11 0x41 usbRate freeRate. With the dongle, freeRate is the one written. */
export function buildPollingWrite(wireless: boolean, index: number): Buffer {
  return encodeRequest(REPORT_SHORT, 0x41, wireless ? [0, index] : [index, 0]);
}

/** Builds 0x12 0x40: active indexes (usb, wireless), reserved byte, six X levels, counter, six Y levels. */
function encodeDpiWrite(
  usbIndex: number,
  wirelessIndex: number,
  reserved: number,
  dpi: number[],
  dpiY: number[],
  count: number,
): Buffer {
  if (dpi.length !== DPI_LEVELS || dpiY.length !== DPI_LEVELS) throw new Error("Exactly 6 DPI levels are required");
  if (!Number.isInteger(count) || count < 1 || count > DPI_LEVELS) {
    throw new Error(`Invalid number of levels: ${count} (allowed 1..${DPI_LEVELS})`);
  }
  for (const v of [...dpi, ...dpiY]) {
    if (!Number.isInteger(v) || v < DPI_MIN || v > DPI_MAX) {
      throw new Error(`Invalid DPI: ${v} (allowed ${DPI_MIN}..${DPI_MAX})`);
    }
  }
  const args = [usbIndex, wirelessIndex, reserved];
  for (const v of dpi) args.push(v & 0xff, v >> 8);
  args.push(count, 0xff);
  for (const v of dpiY) args.push(v & 0xff, v >> 8);
  return encodeRequest(REPORT_LONG, 0x40, args);
}

/**
 * 0x12 0x40: writes the six DPI levels. The reserved byte is the one that was read; the active indexes stay those
 * that were read, unless they must fit within the number of levels in use (activeLevels, by default the one read).
 * Y axis: if dpiY is not given, a level whose Y was equal to X stays linked (Y follows the new X) and a level with a
 * separate Y keeps it. M HUB writes Y independently of X (PROTOCOL.md 10.20).
 */
export function buildDpiWrite(
  state: ProfileState,
  dpi: number[],
  activeLevels: number = state.activeLevels,
  dpiY: number[] = dpi.map((x, i) => (state.dpiY[i] === state.dpi[i] ? x : state.dpiY[i])),
): Buffer {
  const last = Math.max(0, activeLevels - 1);
  return encodeDpiWrite(
    Math.min(state.usbDpiIndex, last),
    Math.min(state.wirelessDpiIndex, last),
    state.reserved,
    dpi,
    dpiY,
    activeLevels,
  );
}

/**
 * Removes a level in use: the following ones shift down by one, the counter drops by one and the removed
 * value moves to the first unused place. The active index follows its level (or, if it was the removed one, stays valid).
 */
export function buildLevelRemoval(state: ProfileState, index: number): Buffer {
  const count = state.activeLevels;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`Invalid level: ${index} (levels in use: ${count})`);
  }
  if (count <= 1) throw new Error("At least one DPI level must remain");
  const inUse = state.dpi.slice(0, count);
  const [removed] = inUse.splice(index, 1);
  const dpi = [...inUse, removed, ...state.dpi.slice(count)];
  const inUseY = state.dpiY.slice(0, count);
  const [removedY] = inUseY.splice(index, 1);
  const dpiY = [...inUseY, removedY, ...state.dpiY.slice(count)];
  const follow = (active: number) => Math.min(active > index ? active - 1 : active, count - 2);
  return encodeDpiWrite(follow(state.usbDpiIndex), follow(state.wirelessDpiIndex), state.reserved, dpi, dpiY, count - 1);
}

// ---------- 0xE2 notification ----------

export interface Notification {
  battery: number;
  dpiIndex: number;
  rateIndex: number;
  activeLevels: number;
  profile: number;
}

/** Decodes a notification (logical bytes). Returns null if it is not a 0xE2 notification. */
export function parseNotification(logical: number[]): Notification | null {
  if (logical[0] !== 0xe2) return null;
  return {
    battery: logical[4],
    dpiIndex: logical[5],
    rateIndex: logical[6],
    activeLevels: logical[7],
    profile: logical[15],
  };
}

// ---------- Sensor writes (real capture, PROTOCOL.md 10.14-10.18) ----------

export interface SensorChange {
  lodMm?: 1 | 2;
  rippleControl?: boolean;
  angleSnapping?: boolean;
  motionSync?: boolean;
  /** Degrees, -30..30. */
  rotate?: number;
}

export const ROTATE_LIMIT = 30;
export const DEBOUNCE_MIN = 1;
export const DEBOUNCE_MAX = 20;
export const SLEEP_MAX = 63;

const flag = (v: boolean | undefined) => (v === undefined ? 0 : v ? 1 : 2);

/**
 * 0x11 0x42 `lod ripple line motionSync 0 0 0 rotateOpen rotateVal`. Like M HUB: always sends the current LOD
 * (or the new one) and zero for whatever does not change. The mode (gameMode) is never written.
 */
export function buildSensorWrite(state: ProfileState, change: SensorChange): Buffer {
  if (change.lodMm !== undefined && change.lodMm !== 1 && change.lodMm !== 2) {
    throw new Error(`Invalid LOD: ${change.lodMm} (allowed 1 or 2 mm)`);
  }
  const lod = change.lodMm ?? parseSensor(state.sensor).lodMm;
  if (lod === null) throw new Error("Unknown LOD: refusing to write the sensor settings");
  let rotateOpen = 0;
  let rotateVal = 0;
  if (change.rotate !== undefined) {
    if (!Number.isInteger(change.rotate) || Math.abs(change.rotate) > ROTATE_LIMIT) {
      throw new Error(`Invalid angle: ${change.rotate} (allowed -${ROTATE_LIMIT}..${ROTATE_LIMIT})`);
    }
    rotateOpen = 1;
    rotateVal = change.rotate & 0xff;
  }
  return encodeRequest(REPORT_SHORT, 0x42, [
    lod,
    flag(change.rippleControl),
    flag(change.angleSnapping),
    flag(change.motionSync),
    0,
    0,
    0,
    rotateOpen,
    rotateVal,
  ]);
}

/** 0x11 0x43 ms. Limits 1..20 inferred from the M HUB slider. */
export function buildDebounceWrite(ms: number): Buffer {
  if (!Number.isInteger(ms) || ms < DEBOUNCE_MIN || ms > DEBOUNCE_MAX) {
    throw new Error(`Invalid debounce: ${ms} (allowed ${DEBOUNCE_MIN}..${DEBOUNCE_MAX} ms)`);
  }
  return encodeRequest(REPORT_SHORT, 0x43, [ms]);
}

/** 0x11 0x0A flag minutes: flag 1 = timer in minutes (1..63), 0 = never sleep (minutes 0). */
export function buildSleepWrite(minutes: number): Buffer {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > SLEEP_MAX) {
    throw new Error(`Invalid sleep timer: ${minutes} (allowed 0 = never, or 1..${SLEEP_MAX} min)`);
  }
  return encodeRequest(REPORT_SHORT, 0x0a, minutes === 0 ? [0, 0] : [1, minutes]);
}

/** 0x12 0x52 `button 0 type v1 v2 v3` (real capture, PROTOCOL.md 10.19). Does not check the left-click protection: see keys.ts. */
export function buildKeyWrite(button: number, action: KeyAction): Buffer {
  if (!Number.isInteger(button) || button < 0 || button >= BUTTON_COUNT) {
    throw new Error(`Invalid button: ${button} (allowed 0..${BUTTON_COUNT - 1})`);
  }
  if (!KEY_TYPES.includes(action.type)) throw new Error(`Unsupported key type: ${action.type}`);
  if (action.value.length !== 3 || action.value.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error("Invalid key value");
  }
  return encodeRequest(REPORT_LONG, 0x52, [button, 0, action.type, ...action.value]);
}
