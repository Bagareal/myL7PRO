// Codifica e decodifica del protocollo 0x11/0x12 (vedi PROTOCOL.md, sezioni 3 e 10).
// Solo comandi verificati sul mouse reale.

export const VENDOR_ID = 0x5253;
export const PRODUCT_IDS = [0x1020, 0x1021];
export const CONFIG_USAGE_PAGE = 0xff01;
export const CONFIG_USAGE = 1;

export const REPORT_SHORT = 0x11; // payload 20 byte
export const REPORT_LONG = 0x12; // payload 64 byte
export const REPORT_CONFIRM = 0x13; // input report di conferma

const PAYLOAD_LEN: Record<number, number> = { [REPORT_SHORT]: 20, [REPORT_LONG]: 64 };

export const DPI_MIN = 200;
export const DPI_MAX = 26000;
export const DPI_LEVELS = 6;
/** Valori di Restore defaults di M HUB (catturati dall utente il 2026-11-05). */
export const DPI_FACTORY = [400, 800, 1600, 3200, 6400, 26000];
export const PROFILE_COUNT = 3;
export const KEY_SLOTS = 6;
/** Tasti del L7 Pro: 0 sinistro, 1 centrale, 2 destro, 3 Advance, 4 Back. */
export const BUTTON_COUNT = 5;
/** Tipi catturati con M HUB: 0 predefinita, 1 mouse, 2 tastiera, 3 multimediale, 5 DPI, 8 scorciatoia, 9 disabilitato. */
const KEY_TYPES = [0, 1, 2, 3, 5, 8, 9];

export const POLLING_RATES: Record<number, number[]> = {
  0x1020: [125, 500, 1000, 2000, 4000, 8000],
  0x1021: [125, 500, 1000],
};

/** Costruisce il buffer da passare a sendFeatureReport (report ID in testa, byte invertiti). */
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

/** Inverte i byte (XOR 0xFF). */
export function unxor(buf: Uint8Array): number[] {
  return Array.from(buf, (b) => b ^ 0xff);
}

export interface Response {
  cmd: number;
  data: number[]; // dati logici, a partire dall'indice 2 della risposta grezza
}

/** Decodifica un feature report letto: indice 0 = report ID, 1 = comando invertito, 2.. = dati invertiti. */
export function decodeResponse(raw: Buffer): Response {
  return { cmd: raw[1] ^ 0xff, data: unxor(raw.subarray(2)) };
}

// ---------- Stato profilo (0x12 0x67) ----------

export interface ProfileState {
  profile: number;
  usbDpiIndex: number;
  usbRateIndex: number;
  wirelessDpiIndex: number;
  wirelessRateIndex: number;
  reserved: number;
  dpi: number[]; // 6 livelli, asse X
  dpiY: number[]; // 6 livelli, asse Y
  activeLevels: number;
  sensor: number;
  debounce: number;
  sleep: number;
  /** Angolo del sensore in gradi, con segno (byte 49). */
  rotate: number;
  /** Sei tasti (byte 20-43); il L7 Pro ne usa cinque. */
  keys: KeyAction[];
}

/** Funzione di un tasto: tipo (0 = predefinita) e tre byte di valore (PROTOCOL.md 5.7 e 10.19). */
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

/** Byte sensore di 0x67 (PROTOCOL.md 4.1.1): bit 0-1 LOD, 2 ripple, 3 angle snapping, 4 motion sync, 6-7 modalita'. */
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

/** Le modalita' Performance/Gaming/Extreme esistono dal firmware 5.12.4.4 del mouse. */
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

/** 0x11 0x06: vid, pid, firmware (u32), byte modo/stato, batteria, carica. Struttura da codice, non ancora verificata. */
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

/** Versione: lunghezza uint8 poi stringa ASCII. */
export function parseVersion(d: number[]): string {
  return String.fromCharCode(...d.slice(1, 1 + d[0]));
}

/** Nome profilo: un byte di intestazione, poi UTF-8 con zeri finali. Formato "nome$sorgente$id". */
export function parseProfileName(d: number[]): string {
  const bytes = d.slice(1);
  const end = bytes.indexOf(0);
  const text = Buffer.from(end < 0 ? bytes : bytes.slice(0, end)).toString("utf8");
  return text.split("$")[0];
}

// ---------- Scritture verificate ----------

/** 0x11 0x58 PP: cambio profilo onboard. */
export function buildProfileSwitch(profile: number): Buffer {
  if (!Number.isInteger(profile) || profile < 0 || profile >= PROFILE_COUNT) {
    throw new Error(`Invalid profile: ${profile} (allowed 0..${PROFILE_COUNT - 1})`);
  }
  return encodeRequest(REPORT_SHORT, 0x58, [profile]);
}

export const PROFILE_NAME_MAX = 16;

/**
 * 0x12 0x59 SLOT NOME: rinomina un profilo onboard (PROTOCOL.md 10.13). Il nome e' ASCII in chiaro, senza
 * lunghezza e senza "$sorgente$id"; il riempimento 0xFF funge da terminatore. Verificato con nomi di 8 e 9 caratteri:
 * il limite di 16 e il solo ASCII stampabile sono una scelta prudente, non il limite di M HUB.
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

/** 0x11 0x41 usbRate freeRate. Con il dongle si scrive freeRate. */
export function buildPollingWrite(wireless: boolean, index: number): Buffer {
  return encodeRequest(REPORT_SHORT, 0x41, wireless ? [0, index] : [index, 0]);
}

/** Costruisce 0x12 0x40: indici attivi (usb, wireless), byte riservato, sei livelli X (e Y uguali), contatore. */
function encodeDpiWrite(usbIndex: number, wirelessIndex: number, reserved: number, dpi: number[], count: number): Buffer {
  if (dpi.length !== DPI_LEVELS) throw new Error("Exactly 6 DPI levels are required");
  if (!Number.isInteger(count) || count < 1 || count > DPI_LEVELS) {
    throw new Error(`Invalid number of levels: ${count} (allowed 1..${DPI_LEVELS})`);
  }
  for (const v of dpi) {
    if (!Number.isInteger(v) || v < DPI_MIN || v > DPI_MAX) {
      throw new Error(`Invalid DPI: ${v} (allowed ${DPI_MIN}..${DPI_MAX})`);
    }
  }
  const args = [usbIndex, wirelessIndex, reserved];
  for (const v of dpi) args.push(v & 0xff, v >> 8);
  args.push(count, 0xff);
  for (const v of dpi) args.push(v & 0xff, v >> 8);
  return encodeRequest(REPORT_LONG, 0x40, args);
}

/**
 * 0x12 0x40: scrive i sei livelli DPI. Il byte riservato e' quello letto; gli indici attivi restano quelli
 * letti, salvo che debbano rientrare nel numero di livelli in uso (activeLevels, di default quello letto).
 */
export function buildDpiWrite(state: ProfileState, dpi: number[], activeLevels: number = state.activeLevels): Buffer {
  const last = Math.max(0, activeLevels - 1);
  return encodeDpiWrite(
    Math.min(state.usbDpiIndex, last),
    Math.min(state.wirelessDpiIndex, last),
    state.reserved,
    dpi,
    activeLevels,
  );
}

/**
 * Toglie un livello in uso: i successivi scalano di una posizione, il contatore cala di uno e il valore
 * tolto passa al primo posto non in uso. L'indice attivo segue il suo livello (o, se era quello tolto, resta valido).
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
  const follow = (active: number) => Math.min(active > index ? active - 1 : active, count - 2);
  return encodeDpiWrite(follow(state.usbDpiIndex), follow(state.wirelessDpiIndex), state.reserved, dpi, count - 1);
}

// ---------- Notifica 0xE2 ----------

export interface Notification {
  battery: number;
  dpiIndex: number;
  rateIndex: number;
  activeLevels: number;
  profile: number;
}

/** Decodifica una notifica (byte logici). Restituisce null se non e' una notifica 0xE2. */
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

// ---------- Scritture del sensore (cattura reale, PROTOCOL.md 10.14-10.18) ----------

export interface SensorChange {
  lodMm?: 1 | 2;
  rippleControl?: boolean;
  angleSnapping?: boolean;
  motionSync?: boolean;
  /** Gradi, -30..30. */
  rotate?: number;
}

export const ROTATE_LIMIT = 30;
export const DEBOUNCE_MIN = 1;
export const DEBOUNCE_MAX = 20;
export const SLEEP_MAX = 63;

const flag = (v: boolean | undefined) => (v === undefined ? 0 : v ? 1 : 2);

/**
 * 0x11 0x42 `lod ripple line motionSync 0 0 0 rotateOpen rotateVal`. Come M HUB: manda sempre il LOD attuale
 * (o quello nuovo) e a zero cio' che non cambia. La modalita' (gameMode) non si scrive mai.
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

/** 0x11 0x43 ms. Limiti 1..20 dedotti dallo slider di M HUB. */
export function buildDebounceWrite(ms: number): Buffer {
  if (!Number.isInteger(ms) || ms < DEBOUNCE_MIN || ms > DEBOUNCE_MAX) {
    throw new Error(`Invalid debounce: ${ms} (allowed ${DEBOUNCE_MIN}..${DEBOUNCE_MAX} ms)`);
  }
  return encodeRequest(REPORT_SHORT, 0x43, [ms]);
}

/** 0x11 0x0A flag minuti: flag 1 = timer in minuti (1..63), 0 = never sleep (minuti 0). */
export function buildSleepWrite(minutes: number): Buffer {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > SLEEP_MAX) {
    throw new Error(`Invalid sleep timer: ${minutes} (allowed 0 = never, or 1..${SLEEP_MAX} min)`);
  }
  return encodeRequest(REPORT_SHORT, 0x0a, minutes === 0 ? [0, 0] : [1, minutes]);
}

/** 0x12 0x52 `button 0 tipo v1 v2 v3` (cattura reale, PROTOCOL.md 10.19). Non controlla la protezione del sinistro: vedi keys.ts. */
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
