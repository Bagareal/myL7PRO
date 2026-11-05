import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { MouseService } from "../core/mouseService.js";
import type { KeyAction, SensorChange } from "../core/protocol.js";
import { Transport, findDevices } from "../core/transport.js";
import { Automation } from "../core/automation.js";
import { SettingsStore } from "../core/settings.js";
import { CHANNELS, type AutomationView } from "../shared/api.js";
import { makeAutomationApi } from "./automationApi.js";
import { getForegroundExe, listOpenApps } from "./foreground.js";
import { pickExe } from "./pickExe.js";
import { createTray } from "./tray.js";

const service = new MouseService(() => {
  const found = findDevices();
  if (!found.length) return null;
  try {
    return Transport.open(found[0].path);
  } catch {
    return null; // interfaccia occupata o dongle appena scollegato: si riprova
  }
});

let win: BrowserWindow | null = null;
let quitting = false;
// Cerchiamo di restare nel tray alla chiusura della finestra nell'app installata; in sviluppo la X chiude davvero
// (cosi' si riavvia con npm run app), salvo L7_TRAY=1 per provare il tray.
const keepInTray = app.isPackaged || process.env["L7_TRAY"] === "1";
const startHidden = process.argv.includes("--hidden");

function showWindow(): void {
  if (!win || win.isDestroyed()) createWindow();
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    title: "myL7PRO",
    show: !startHidden,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  // L'app non apre mai pagine esterne.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  if (process.env["ELECTRON_RENDERER_URL"]) void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  else void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  // Diagnostica per lo sviluppo: errori della pagina nel terminale e, con L7_SHOT=file.png, una schermata dopo il caricamento.
  win.webContents.on("console-message", (e) => console.log(`[pagina] ${e.message}`));
  win.webContents.on("did-fail-load", (_e, code, desc) => console.log(`[pagina] caricamento fallito: ${code} ${desc}`));
  // Gli strumenti di diagnostica (screenshot e codice da variabile d'ambiente) non esistono nell'app installata.
  const shot = app.isPackaged ? undefined : process.env["L7_SHOT"];
  if (shot) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        // L7_EVAL: codice JS eseguito nella pagina prima dello scatto (solo diagnostica).
        const code = process.env["L7_EVAL"];
        if (code) {
          const out = await win?.webContents.executeJavaScript(code);
          console.log(`[eval] ${JSON.stringify(out)}`);
          await new Promise((r) => setTimeout(r, 800));
        }
        const img = await win?.webContents.capturePage();
        if (img) writeFileSync(shot, img.toPNG());
        app.quit();
      }, 4000);
    });
  }
  win.on("close", (e) => {
    if (keepInTray && !quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => {
    win = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(() => {
    ipcMain.handle(CHANNELS.get, () => service.snapshot());
    ipcMain.handle(CHANNELS.setProfile, (_e, profile: number) => {
      automation.noteManualChange();
      return service.setProfile(profile);
    });
    ipcMain.handle(CHANNELS.renameProfile, (_e, slot: number, name: string) => service.renameProfile(slot, name));
    ipcMain.handle(CHANNELS.setDpiLevel, (_e, level: number, dpi: number) => service.setDpiLevel(level, dpi));
    ipcMain.handle(CHANNELS.setPolling, (_e, hz: number) => service.setPolling(hz));
    ipcMain.handle(CHANNELS.setLevelCount, (_e, count: number) => service.setLevelCount(count));
    ipcMain.handle(CHANNELS.removeLevel, (_e, index: number) => service.removeLevel(index));
    ipcMain.handle(CHANNELS.restoreDpiDefaults, () => service.restoreDpiDefaults());
    ipcMain.handle(CHANNELS.setSensor, (_e, change: SensorChange) => service.setSensor(change));
    ipcMain.handle(CHANNELS.setDebounce, (_e, ms: number) => service.setDebounce(ms));
    ipcMain.handle(CHANNELS.setSleep, (_e, minutes: number) => service.setSleep(minutes));
    ipcMain.handle(CHANNELS.setKey, (_e, button: number, action: KeyAction) => service.setKey(button, action));
    ipcMain.handle(CHANNELS.restoreKeyDefaults, () => service.restoreKeyDefaults());
    service.onSnapshot((s) => win?.webContents.send(CHANNELS.snapshot, s));

    const ownExe = basename(process.execPath).toLowerCase();
    const sendAutomation = () => {
      if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.automationChanged, automationApi.get() satisfies AutomationView);
    };
    const automationApi = makeAutomationApi({
      store: new SettingsStore(app.getPath("userData")),
      // In sviluppo non si registra l'avvio automatico: punterebbe a electron.exe.
      applyAutostart: (on) => {
        if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] });
      },
      onChange: sendAutomation,
    });
    const automation = new Automation({
      mouse: service,
      getForeground: getForegroundExe,
      getSettings: () => automationApi.settings(),
      ignoreExes: [ownExe],
    });
    // Primo avvio dell'app installata: si parte con Windows, nascosta nel tray (poi lo si cambia in Settings).
    if (app.isPackaged && !existsSync(join(app.getPath("userData"), "settings.json"))) automationApi.setAutostart(true);
    automationApi.attach(automation);
    automation.onState(sendAutomation);

    ipcMain.handle(CHANNELS.automationGet, () => automationApi.get());
    ipcMain.handle(CHANNELS.setDefaultSlot, (_e, slot: number) => automationApi.setDefaultSlot(slot));
    ipcMain.handle(CHANNELS.addRule, (_e, rule: { exe: string; label: string; slot: number }) => automationApi.addRule(rule));
    ipcMain.handle(CHANNELS.removeRule, (_e, id: string) => automationApi.removeRule(id));
    ipcMain.handle(CHANNELS.setRuleSlot, (_e, id: string, slot: number) => automationApi.setRuleSlot(id, slot));
    ipcMain.handle(CHANNELS.moveRule, (_e, id: string, dir: "up" | "down") => automationApi.moveRule(id, dir));
    ipcMain.handle(CHANNELS.listApps, () => listOpenApps([ownExe]));
    ipcMain.handle(CHANNELS.pickExe, () => pickExe(win));
    ipcMain.handle(CHANNELS.setAutostart, (_e, on: boolean) => automationApi.setAutostart(on));

    const tray = createTray(
      {
        open: showWindow,
        setProfile: (slot) => {
          automation.noteManualChange();
          void service.setProfile(slot).catch(() => undefined);
        },
        quit: () => app.quit(),
      },
      service.snapshot(),
    );
    service.onSnapshot((s) => tray.update(s));
    app.on("before-quit", () => tray.destroy());

    service.start();
    automation.start();
    createWindow();
  });

  app.on("window-all-closed", () => {
    if (!keepInTray) app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    service.stop();
  });
}
