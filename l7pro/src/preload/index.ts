import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type AutomationView, type L7Api, type Snapshot } from "../shared/api.js";

const api: L7Api = {
  get: () => ipcRenderer.invoke(CHANNELS.get),
  onSnapshot(fn) {
    const handler = (_e: unknown, s: Snapshot) => fn(s);
    ipcRenderer.on(CHANNELS.snapshot, handler);
    return () => {
      ipcRenderer.off(CHANNELS.snapshot, handler);
    };
  },
  setProfile: (profile) => ipcRenderer.invoke(CHANNELS.setProfile, profile),
  renameProfile: (slot, name) => ipcRenderer.invoke(CHANNELS.renameProfile, slot, name),
  setDpiLevel: (level, dpi) => ipcRenderer.invoke(CHANNELS.setDpiLevel, level, dpi),
  setPolling: (hz) => ipcRenderer.invoke(CHANNELS.setPolling, hz),
  setLevelCount: (count) => ipcRenderer.invoke(CHANNELS.setLevelCount, count),
  removeLevel: (index) => ipcRenderer.invoke(CHANNELS.removeLevel, index),
  restoreDpiDefaults: () => ipcRenderer.invoke(CHANNELS.restoreDpiDefaults),
  setSensor: (change) => ipcRenderer.invoke(CHANNELS.setSensor, change),
  setDebounce: (ms) => ipcRenderer.invoke(CHANNELS.setDebounce, ms),
  setSleep: (minutes) => ipcRenderer.invoke(CHANNELS.setSleep, minutes),
  setKey: (button, action) => ipcRenderer.invoke(CHANNELS.setKey, button, action),
  restoreKeyDefaults: () => ipcRenderer.invoke(CHANNELS.restoreKeyDefaults),
  setAutostart: (on) => ipcRenderer.invoke(CHANNELS.setAutostart, on),
  automation: {
    get: () => ipcRenderer.invoke(CHANNELS.automationGet),
    onChange(fn) {
      const handler = (_e: unknown, v: AutomationView) => fn(v);
      ipcRenderer.on(CHANNELS.automationChanged, handler);
      return () => {
        ipcRenderer.off(CHANNELS.automationChanged, handler);
      };
    },
    setDefaultSlot: (slot) => ipcRenderer.invoke(CHANNELS.setDefaultSlot, slot),
    addRule: (rule) => ipcRenderer.invoke(CHANNELS.addRule, rule),
    removeRule: (id) => ipcRenderer.invoke(CHANNELS.removeRule, id),
    setRuleSlot: (id, slot) => ipcRenderer.invoke(CHANNELS.setRuleSlot, id, slot),
    moveRule: (id, dir) => ipcRenderer.invoke(CHANNELS.moveRule, id, dir),
    listApps: () => ipcRenderer.invoke(CHANNELS.listApps),
    pickExe: () => ipcRenderer.invoke(CHANNELS.pickExe),
  },
};

contextBridge.exposeInMainWorld("l7", api);
