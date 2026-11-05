import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Automation, type ProfileMouse } from "../src/core/automation.js";
import type { Settings } from "../src/core/settings.js";
import type { Snapshot } from "../src/shared/api.js";
import { connectedSnapshot } from "./snapshots.js";

class FakeMouse implements ProfileMouse {
  snap: Snapshot = connectedSnapshot();
  calls: number[] = [];
  reject = false;
  private listeners: Array<(s: Snapshot) => void> = [];

  snapshot() {
    return this.snap;
  }
  onSnapshot(fn: (s: Snapshot) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  async setProfile(p: number) {
    this.calls.push(p);
    if (this.reject) throw new Error("Mouse not connected");
    this.set({ state: { ...this.snap.state!, profile: p } });
  }
  /** Cambio non fatto da noi (tasto del mouse). */
  set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l(this.snap));
  }
}

const settings: Settings = {
  version: 1,
  defaultSlot: 0,
  autostart: false,
  rules: [
    { id: "1", exe: "r5apex.exe", label: "Apex", slot: 2 },
    { id: "2", exe: "discovery.exe", label: "The Finals", slot: 1 },
  ],
};

let mouse: FakeMouse;
let fg: string | null;
let current: Settings;
let auto: Automation;
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function make() {
  auto = new Automation(
    { mouse, getForeground: async () => fg, getSettings: () => current, ignoreExes: ["electron.exe"] },
    { pollMs: 100, stableMs: 500 },
  );
  auto.start();
}

beforeEach(() => {
  vi.useFakeTimers();
  mouse = new FakeMouse();
  fg = "code.exe";
  current = structuredClone(settings);
});
afterEach(() => {
  auto?.stop();
  vi.useRealTimers();
});

describe("Automation: scelta e applicazione", () => {
  it("applica la regola solo dopo 500 ms di stabilita' e una volta sola", async () => {
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([]);
    fg = "r5apex.exe";
    await advance(300);
    expect(mouse.calls).toEqual([]);
    await advance(400);
    expect(mouse.calls).toEqual([2]);
    await advance(3000);
    expect(mouse.calls).toEqual([2]);
  });

  it("non manda nulla se lo slot richiesto e' gia' attivo", async () => {
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "r5apex.exe";
    make();
    await advance(2000);
    expect(mouse.calls).toEqual([]);
  });

  it("A -> B -> A entro 500 ms non manda nulla", async () => {
    make();
    await advance(1000);
    fg = "r5apex.exe";
    await advance(200);
    fg = "code.exe";
    await advance(2000);
    expect(mouse.calls).toEqual([]);
  });

  it("senza nessuna regola l'automazione non fa niente, nemmeno verso il profilo normale", async () => {
    current.rules = [];
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "chrome.exe";
    make();
    await advance(3000);
    expect(mouse.calls).toEqual([]);
  });

  it("un programma senza regola riporta al profilo normale", async () => {
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "chrome.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([0]);
  });

  it("ignora programma sconosciuto e la finestra di L7 Pro: il profilo non cambia", async () => {
    fg = "r5apex.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([2]);
    fg = null;
    await advance(2000);
    fg = "Electron.EXE";
    await advance(2000);
    expect(mouse.calls).toEqual([2]);
    expect(auto.state().foreground).toBe("r5apex.exe");
  });

  it("se getForeground lancia un errore, e' come un programma sconosciuto", async () => {
    fg = "r5apex.exe";
    make();
    await advance(1000);
    auto.stop();
    auto = new Automation(
      {
        mouse,
        getForeground: async () => {
          throw new Error("boom");
        },
        getSettings: () => current,
        ignoreExes: [],
      },
      { pollMs: 100, stableMs: 500 },
    );
    auto.start();
    await advance(2000);
    expect(mouse.calls).toEqual([2]);
  });
});

describe("Automation: mouse in sleep o scollegato", () => {
  it("al risveglio applica una sola volta lo slot giusto per l'app di quel momento", async () => {
    mouse.snap = connectedSnapshot({ connection: "sleep" });
    make();
    fg = "chrome.exe";
    await advance(700);
    fg = "r5apex.exe";
    await advance(700);
    fg = "discovery.exe";
    await advance(700);
    expect(mouse.calls).toEqual([]);

    mouse.set({ connection: "connesso" });
    await advance(1000);
    expect(mouse.calls).toEqual([1]);
  });

  it("setProfile che rifiuta non ferma il motore: riprova e poi si ferma", async () => {
    fg = "r5apex.exe";
    mouse.reject = true;
    make();
    await advance(1500);
    expect(mouse.calls.length).toBeGreaterThanOrEqual(2);
    mouse.reject = false;
    await advance(500);
    expect(mouse.snap.state!.profile).toBe(2);
    const n = mouse.calls.length;
    await advance(2000);
    expect(mouse.calls.length).toBe(n);
  });
});

describe("Automation: cambi manuali", () => {
  it("noteManualChange blocca l'automazione finche' non cambia l'app", async () => {
    fg = "r5apex.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([2]);

    auto.noteManualChange();
    mouse.set({ state: { ...mouse.snap.state!, profile: 1 } });
    await advance(3000);
    expect(mouse.calls).toEqual([2]);
    expect(auto.state().hold).toBe(true);

    fg = "code.exe";
    await advance(1000);
    expect(auto.state().hold).toBe(false);
    expect(mouse.calls).toEqual([2, 0]);
  });

  it("un cambio fatto dal mouse stesso mette l'automazione in attesa", async () => {
    fg = "r5apex.exe";
    make();
    await advance(1000);
    mouse.set({ state: { ...mouse.snap.state!, profile: 1 } });
    await advance(3000);
    expect(auto.state().hold).toBe(true);
    expect(mouse.calls).toEqual([2]);
  });

  it("il cambio di profilo al risveglio del mouse non conta come cambio manuale", async () => {
    mouse.snap = connectedSnapshot({ connection: "sleep" });
    make();
    fg = "r5apex.exe";
    await advance(1000);
    mouse.set({ connection: "connesso", state: { ...mouse.snap.state!, profile: 1 } });
    await advance(1000);
    expect(auto.state().hold).toBe(false);
    expect(mouse.calls).toEqual([2]);
  });
});

describe("Automation: modifiche alle regole e stato", () => {
  it("refresh applica subito una regola nuova per l'app gia' in primo piano", async () => {
    fg = "chrome.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([]);
    current.rules.push({ id: "3", exe: "chrome.exe", label: "Chrome", slot: 1 });
    auto.refresh();
    await advance(200);
    expect(mouse.calls).toEqual([1]);
  });

  it("state() e onState descrivono programma, regola e attesa", async () => {
    const seen: string[] = [];
    make();
    auto.onState((s) => seen.push(`${s.foreground}:${s.match.slot}:${s.hold}`));
    fg = "r5apex.exe";
    await advance(1000);
    expect(auto.state()).toMatchObject({ foreground: "r5apex.exe", hold: false });
    expect(auto.state().match.rule?.label).toBe("Apex");
    expect(seen).toContain("r5apex.exe:2:false");
  });
});
