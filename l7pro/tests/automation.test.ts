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
  /** A change we did not make (a mouse button). */
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

describe("Automation: choosing and applying", () => {
  it("applies the rule only after 500 ms of stability, and only once", async () => {
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

  it("sends nothing if the requested slot is already active", async () => {
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "r5apex.exe";
    make();
    await advance(2000);
    expect(mouse.calls).toEqual([]);
  });

  it("A -> B -> A within 500 ms sends nothing", async () => {
    make();
    await advance(1000);
    fg = "r5apex.exe";
    await advance(200);
    fg = "code.exe";
    await advance(2000);
    expect(mouse.calls).toEqual([]);
  });

  it("with no rules automation does nothing, not even toward the normal profile", async () => {
    current.rules = [];
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "chrome.exe";
    make();
    await advance(3000);
    expect(mouse.calls).toEqual([]);
  });

  it("a program without a rule goes back to the normal profile", async () => {
    mouse.snap = connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 2 } });
    fg = "chrome.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([0]);
  });

  it("ignores an unknown program and the myL7PRO window: the profile does not change", async () => {
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

  it("if getForeground throws, it is treated like an unknown program", async () => {
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

describe("Automation: mouse asleep or unplugged", () => {
  it("on wake-up applies the right slot once, for the app at that moment", async () => {
    mouse.snap = connectedSnapshot({ connection: "sleep" });
    make();
    fg = "chrome.exe";
    await advance(700);
    fg = "r5apex.exe";
    await advance(700);
    fg = "discovery.exe";
    await advance(700);
    expect(mouse.calls).toEqual([]);

    mouse.set({ connection: "connected" });
    await advance(1000);
    expect(mouse.calls).toEqual([1]);
  });

  it("a rejecting setProfile does not stop the engine: it retries and then settles", async () => {
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

describe("Automation: manual changes", () => {
  it("noteManualChange holds automation until the app changes", async () => {
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

  it("a change made by the mouse itself puts automation on hold", async () => {
    fg = "r5apex.exe";
    make();
    await advance(1000);
    mouse.set({ state: { ...mouse.snap.state!, profile: 1 } });
    await advance(3000);
    expect(auto.state().hold).toBe(true);
    expect(mouse.calls).toEqual([2]);
  });

  it("the profile change when the mouse wakes up does not count as a manual change", async () => {
    mouse.snap = connectedSnapshot({ connection: "sleep" });
    make();
    fg = "r5apex.exe";
    await advance(1000);
    mouse.set({ connection: "connected", state: { ...mouse.snap.state!, profile: 1 } });
    await advance(1000);
    expect(auto.state().hold).toBe(false);
    expect(mouse.calls).toEqual([2]);
  });
});

describe("Automation: rule changes and state", () => {
  it("refresh applies a new rule right away for the app already in the foreground", async () => {
    fg = "chrome.exe";
    make();
    await advance(1000);
    expect(mouse.calls).toEqual([]);
    current.rules.push({ id: "3", exe: "chrome.exe", label: "Chrome", slot: 1 });
    auto.refresh();
    await advance(200);
    expect(mouse.calls).toEqual([1]);
  });

  it("state() and onState describe program, rule and hold", async () => {
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
