import type { UpdateInfo } from "../src/core/update.js";
import type { AutomationView, OpenApp, Snapshot } from "../src/shared/api.js";

export function connectedSnapshot(patch: Partial<Snapshot> = {}): Snapshot {
  return {
    connection: "connected",
    battery: 93,
    wireless: true,
    productId: 0x1020,
    firmware: { mouse: "5.12.5.0", receiver: "5.7.6.0" },
    state: {
      profile: 0,
      usbDpiIndex: 2,
      usbRateIndex: 2,
      wirelessDpiIndex: 2,
      wirelessRateIndex: 2,
      reserved: 2,
      dpi: [400, 800, 1229, 3200, 6400, 26000],
      dpiY: [400, 800, 1229, 3200, 6400, 26000],
      activeLevels: 3,
      sensor: 0x11,
      debounce: 6,
      sleep: 3,
      rotate: 0,
      keys: Array.from({ length: 6 }, () => ({ type: 0, value: [0, 0, 0] as [number, number, number] })),
    },
    profileNames: ["Default1", "TheFinals", "Default3"],
    pollingRates: [125, 500, 1000, 2000, 4000, 8000],
    error: null,
    ...patch,
  };
}

export const absentSnapshot = (): Snapshot =>
  connectedSnapshot({
    connection: "absent",
    battery: null,
    firmware: null,
    state: null,
    profileNames: null,
    pollingRates: [],
    productId: null,
  });

export const defaultAutomationView = (): AutomationView => ({
  settings: { version: 1, defaultSlot: 0, autostart: false, rules: [] },
  state: { foreground: null, match: { slot: 0, rule: null }, hold: false },
});

/** window.l7 finto: restituisce lo snapshot dato e permette di emetterne altri. */
export function installFakeApi(
  initial: Snapshot,
  extra: { automation?: AutomationView; apps?: OpenApp[]; picked?: { exe: string; label: string } | null; update?: UpdateInfo } = {},
) {
  const listeners: Array<(s: Snapshot) => void> = [];
  const automationListeners: Array<(v: AutomationView) => void> = [];
  const calls: Array<[string, ...unknown[]]> = [];
  const automationView = extra.automation ?? defaultAutomationView();
  const openApps = extra.apps ?? [];
  const picked = extra.picked ?? null;
  window.l7 = {
    get: async () => initial,
    onSnapshot: (fn) => {
      listeners.push(fn);
      return () => {
        listeners.splice(listeners.indexOf(fn), 1);
      };
    },
    setProfile: async (p) => void calls.push(["setProfile", p]),
    renameProfile: async (s, n) => void calls.push(["renameProfile", s, n]),
    setDpiLevel: async (l, d) => void calls.push(["setDpiLevel", l, d]),
    setPolling: async (hz) => void calls.push(["setPolling", hz]),
    setLevelCount: async (n) => void calls.push(["setLevelCount", n]),
    removeLevel: async (i) => void calls.push(["removeLevel", i]),
    restoreDpiDefaults: async () => void calls.push(["restoreDpiDefaults"]),
    setSensor: async (c) => void calls.push(["setSensor", c]),
    setDebounce: async (ms) => void calls.push(["setDebounce", ms]),
    setSleep: async (m) => void calls.push(["setSleep", m]),
    setKey: async (b, a) => void calls.push(["setKey", b, a]),
    restoreKeyDefaults: async () => void calls.push(["restoreKeyDefaults"]),
    setAutostart: async (on) => void calls.push(["setAutostart", on]),
    checkUpdate: async () => {
      calls.push(["checkUpdate"]);
      return extra.update ?? { current: "1.0.0", latest: "1.0.0", available: false, url: "https://github.com/Bagareal/myL7PRO/releases" };
    },
    openReleases: async () => void calls.push(["openReleases"]),
    automation: {
      get: async () => automationView,
      onChange: (fn) => {
        automationListeners.push(fn);
        return () => {
          automationListeners.splice(automationListeners.indexOf(fn), 1);
        };
      },
      setDefaultSlot: async (s) => void calls.push(["setDefaultSlot", s]),
      addRule: async (r) => void calls.push(["addRule", r.exe, r.label, r.slot]),
      removeRule: async (id) => void calls.push(["removeRule", id]),
      setRuleSlot: async (id, s) => void calls.push(["setRuleSlot", id, s]),
      moveRule: async (id, d) => void calls.push(["moveRule", id, d]),
      listApps: async () => openApps,
      pickExe: async () => picked,
    },
  };
  return {
    emit: (s: Snapshot) => listeners.forEach((l) => l(s)),
    emitAutomation: (v: AutomationView) => automationListeners.forEach((l) => l(v)),
    calls,
  };
}
