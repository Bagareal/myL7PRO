import type { AutomationState } from "../core/automation.js";
import type { KeyAction, ProfileState, SensorChange } from "../core/protocol.js";
import type { Settings } from "../core/settings.js";

export type ConnectionState = "assente" | "connesso" | "sleep";

export interface Snapshot {
  connection: ConnectionState;
  battery: number | null;
  wireless: boolean;
  productId: number | null;
  firmware: { mouse: string; receiver: string } | null;
  state: ProfileState | null;
  profileNames: [string, string, string] | null;
  pollingRates: number[];
  error: string | null;
}

export interface OpenApp {
  exe: string;
  label: string;
  title: string;
}

export interface AutomationView {
  settings: Settings;
  state: AutomationState;
}

export const CHANNELS = {
  snapshot: "l7:snapshot",
  get: "l7:get",
  setProfile: "l7:setProfile",
  renameProfile: "l7:renameProfile",
  setDpiLevel: "l7:setDpiLevel",
  setPolling: "l7:setPolling",
  setLevelCount: "l7:setLevelCount",
  removeLevel: "l7:removeLevel",
  restoreDpiDefaults: "l7:restoreDpiDefaults",
  setSensor: "l7:setSensor",
  setDebounce: "l7:setDebounce",
  setSleep: "l7:setSleep",
  setKey: "l7:setKey",
  restoreKeyDefaults: "l7:restoreKeyDefaults",
  automationGet: "l7:automation:get",
  automationChanged: "l7:automation:changed",
  setDefaultSlot: "l7:automation:setDefaultSlot",
  addRule: "l7:automation:addRule",
  removeRule: "l7:automation:removeRule",
  setRuleSlot: "l7:automation:setRuleSlot",
  moveRule: "l7:automation:moveRule",
  listApps: "l7:automation:listApps",
  pickExe: "l7:automation:pickExe",
  setAutostart: "l7:setAutostart",
} as const;

/** API esposta all'interfaccia come window.l7 (tramite preload). */
export interface L7Api {
  get(): Promise<Snapshot>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  setProfile(profile: number): Promise<void>;
  renameProfile(slot: number, name: string): Promise<void>;
  setDpiLevel(level: number, dpi: number): Promise<void>;
  setPolling(hz: number): Promise<void>;
  setLevelCount(count: number): Promise<void>;
  removeLevel(index: number): Promise<void>;
  restoreDpiDefaults(): Promise<void>;
  setSensor(change: SensorChange): Promise<void>;
  setDebounce(ms: number): Promise<void>;
  setSleep(minutes: number): Promise<void>;
  setKey(button: number, action: KeyAction): Promise<void>;
  restoreKeyDefaults(): Promise<void>;
  setAutostart(on: boolean): Promise<void>;
  automation: {
    get(): Promise<AutomationView>;
    onChange(fn: (v: AutomationView) => void): () => void;
    setDefaultSlot(slot: number): Promise<void>;
    addRule(rule: { exe: string; label: string; slot: number }): Promise<void>;
    removeRule(id: string): Promise<void>;
    setRuleSlot(id: string, slot: number): Promise<void>;
    moveRule(id: string, dir: "up" | "down"): Promise<void>;
    listApps(): Promise<OpenApp[]>;
    pickExe(): Promise<{ exe: string; label: string } | null>;
  };
}
