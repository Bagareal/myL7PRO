import { afterEach, describe, expect, it } from "vitest";
import { MouseService } from "../src/core/mouseService.js";
import { functionById, keyboardAction } from "../src/core/keys.js";
import { FakeLink } from "./fakeLink.js";

const until = async (cond: () => boolean, ms = 1000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for the condition");
    await new Promise((r) => setTimeout(r, 2));
  }
};

const services: MouseService[] = [];
const make = (connect: () => FakeLink | null) => {
  const s = new MouseService(connect, { retryMs: 5, pollMs: 5, settleMs: 0 });
  services.push(s);
  return s;
};
afterEach(() => services.splice(0).forEach((s) => s.stop()));

const hex = (b: Buffer, n: number) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, "0")).join(" ");

describe("MouseService: connection", () => {
  it("without a device it stays 'absent' and connects when one appears", async () => {
    let link: FakeLink | null = null;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "absent");
    expect(s.snapshot().state).toBeNull();

    link = new FakeLink();
    await until(() => s.snapshot().connection === "connected");
    const snap = s.snapshot();
    expect(snap.battery).toBe(93);
    expect(snap.wireless).toBe(true);
    expect(snap.profileNames).toEqual(["Default1", "TheFinals", "Default3"]);
    expect(snap.state?.profile).toBe(0);
    expect(snap.pollingRates).toEqual([125, 500, 1000, 2000, 4000, 8000]);
    expect(snap.firmware).toEqual({ mouse: "5.12.5.0", receiver: "5.7.6.0" });
  });

  it("with PID 0x1021 it offers only 125, 500, 1000", async () => {
    const link = new FakeLink();
    link.pid = 0x1021;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    expect(s.snapshot().pollingRates).toEqual([125, 500, 1000]);
  });

  it("if reads fail it goes to 'sleep' without writing anything, then recovers", async () => {
    const link = new FakeLink();
    link.failReads = true;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "sleep");
    await expect(s.setDpiLevel(2, 1164)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);

    link.failReads = false;
    await until(() => s.snapshot().connection === "connected");
  });
});

describe("MouseService: writes", () => {
  it("setProfile sends the profile switch, reads back and updates the snapshot", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setProfile(1);
    expect(hex(link.writes[0], 4)).toBe("11 a7 fe ff");
    expect(s.snapshot().state?.profile).toBe(1);
  });

  it("renameProfile sends 0x12 0x59, reads the names back and updates the snapshot", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3"]);

    await s.renameProfile(2, "Default3x");
    expect(hex(link.writes[0], 6)).toBe("12 a6 fd bb 9a 99");
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3x"]);
  });

  it("renameProfile with an invalid name or slot rejects without sending", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    await expect(s.renameProfile(2, "")).rejects.toThrow();
    await expect(s.renameProfile(5, "ok")).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3"]);
  });

  it("setProfile outside 0..2 rejects without sending", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    await expect(s.setProfile(5)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
  });

  it("two setProfile calls without await run in order and the last one wins", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    const a = s.setProfile(1);
    const b = s.setProfile(2);
    await Promise.all([a, b]);
    expect(link.writes.map((w) => hex(w, 4))).toEqual(["11 a7 fe ff", "11 a7 fd ff"]);
    expect(s.snapshot().state?.profile).toBe(2);
  });

  it("setDpiLevel changes only that level and leaves the rest as it was", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setDpiLevel(2, 1164);
    expect(link.dpi).toEqual([400, 800, 1164, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(3);
    expect(link.usbDpiIndex).toBe(2);
    expect(s.snapshot().state?.dpi[2]).toBe(1164);
  });

  it.each([[2, 100], [2, 26001], [6, 800], [-1, 800]])("setDpiLevel(%s, %s) rejects without sending", async (level, dpi) => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    await expect(s.setDpiLevel(level, dpi)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
  });

  it("setLevelCount changes only the number of levels in use and keeps the active index valid", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setLevelCount(2);
    expect(link.activeLevels).toBe(2);
    expect(link.dpi).toEqual([400, 800, 1229, 3200, 6400, 26000]);
    expect(link.usbDpiIndex).toBe(1);
    expect(s.snapshot().state?.activeLevels).toBe(2);
    await expect(s.setLevelCount(0)).rejects.toThrow();
    await expect(s.setLevelCount(7)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("restoreDpiDefaults writes the six factory values with six levels in use, in a single write", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.restoreDpiDefaults();
    expect(link.dpi).toEqual([400, 800, 1600, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(6);
    expect(link.usbDpiIndex).toBe(2);
    expect(link.writes).toHaveLength(1);
    expect(s.snapshot().state?.activeLevels).toBe(6);
  });

  it("removeLevel removes that level, shifts the others and keeps the active index valid", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.removeLevel(0);
    expect(link.dpi).toEqual([800, 1229, 400, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(2);
    expect(link.usbDpiIndex).toBe(1);
    expect(s.snapshot().state?.dpi.slice(0, 2)).toEqual([800, 1229]);
    await expect(s.removeLevel(5)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("setSensor writes only what changes, keeps the LOD and reads the state back", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setSensor({ rippleControl: true });
    expect(link.sensor).toBe(0x15);
    await s.setSensor({ motionSync: false });
    expect(link.sensor).toBe(0x05);
    await s.setSensor({ lodMm: 2 });
    expect(link.sensor).toBe(0x06);
    await s.setSensor({ angleSnapping: true });
    expect(link.sensor).toBe(0x0e);
    await s.setSensor({ rotate: -3 });
    expect(link.rotate).toBe(-3);
    expect(link.sensor).toBe(0x0e);
    expect(s.snapshot().state?.rotate).toBe(-3);
    expect(link.writes).toHaveLength(5);
    await expect(s.setSensor({ rotate: 40 })).rejects.toThrow();
    expect(link.writes).toHaveLength(5);
  });

  it("setDebounce and setSleep write and read back; never sleep = 0", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setDebounce(9);
    expect(s.snapshot().state?.debounce).toBe(9);
    await s.setSleep(10);
    expect(s.snapshot().state?.sleep).toBe(10);
    await s.setSleep(0);
    expect(s.snapshot().state?.sleep).toBe(0);
    await expect(s.setDebounce(0)).rejects.toThrow();
    await expect(s.setSleep(64)).rejects.toThrow();
    expect(link.writes).toHaveLength(3);
  });

  it("setKey writes the button and reads the state back; restoreKeyDefaults restores only the changed ones", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setKey(3, functionById("mute").action);
    expect(link.keys[3]).toEqual({ type: 3, value: [0xe2, 0, 0] });
    expect(s.snapshot().state?.keys[3]).toEqual({ type: 3, value: [0xe2, 0, 0] });
    await s.setKey(4, keyboardAction(0x06, 0x01));
    expect(link.writes).toHaveLength(2);

    await s.restoreKeyDefaults();
    expect(link.keys.slice(0, 5).every((k) => k.type === 0)).toBe(true);
    expect(link.writes).toHaveLength(4);
    await s.restoreKeyDefaults();
    expect(link.writes).toHaveLength(4);
  });

  it("setKey rejects without writing if it removes the last left click or the data is invalid", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await expect(s.setKey(0, functionById("disable").action)).rejects.toThrow(/left click/);
    await expect(s.setKey(0, functionById("right").action)).rejects.toThrow(/left click/);
    await expect(s.setKey(7, functionById("mute").action)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);

    await s.setKey(3, functionById("left").action);
    await s.setKey(0, functionById("disable").action);
    await expect(s.setKey(3, functionById("mute").action)).rejects.toThrow(/left click/);
    expect(link.writes).toHaveLength(2);
    await s.restoreKeyDefaults();
    expect(link.keys.slice(0, 5).every((k) => k.type === 0)).toBe(true);
  });

  it("setPolling writes freeRate when wireless and rejects values outside the list", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    await s.setPolling(500);
    expect(hex(link.writes[0], 4)).toBe("11 be ff fe");
    expect(s.snapshot().state?.wirelessRateIndex).toBe(1);
    await expect(s.setPolling(3000)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("if the read-back after a write fails it reports an error and goes to 'sleep', then recovers", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    link.failReadsAfterWrite = true;
    await expect(s.setProfile(2)).rejects.toThrow(/not verified/i);
    expect(s.snapshot().connection).toBe("sleep");
    expect(s.snapshot().error).toBeTruthy();

    link.failReads = false;
    link.failReadsAfterWrite = false;
    await until(() => s.snapshot().connection === "connected");
    expect(s.snapshot().state?.profile).toBe(2);
    expect(s.snapshot().error).toBeNull();
  });
});

describe("MouseService: continuous connection check", () => {
  it("after unplugging it goes to 'absent', closes the old channel and reconnects on return", async () => {
    const old = new FakeLink();
    let current: FakeLink | null = old;
    const s = make(() => current);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    old.failReads = true;
    current = null;
    await until(() => s.snapshot().connection === "absent");
    expect(old.closed).toBe(true);
    expect(s.snapshot().state).toBeNull();

    const fresh = new FakeLink();
    fresh.battery = 80;
    current = fresh;
    await until(() => s.snapshot().connection === "connected");
    expect(s.snapshot().battery).toBe(80);
  });

  it("with the dongle present but the mouse silent it goes to 'sleep' and then recovers", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    link.failReads = true;
    await until(() => s.snapshot().connection === "sleep");
    link.failReads = false;
    await until(() => s.snapshot().connection === "connected");
  });

  it("updates the battery and the profile changed by the mouse itself", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    link.battery = 50;
    link.profile = 2;
    await until(() => s.snapshot().battery === 50 && s.snapshot().state?.profile === 2);
  });

  it("does not notify the listeners again when nothing changed", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");
    let n = 0;
    s.onSnapshot(() => n++);
    await new Promise((r) => setTimeout(r, 60));
    expect(n).toBe(0);
  });
});

describe("MouseService: connection guard", () => {
  it("with the state already read but the mouse asleep it sends no write", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connected");

    link.failReadsAfterWrite = true;
    await expect(s.setProfile(1)).rejects.toThrow(/not verified/i);
    expect(s.snapshot().state).not.toBeNull();
    expect(s.snapshot().connection).toBe("sleep");
    expect(link.writes).toHaveLength(1);

    await expect(s.setProfile(2)).rejects.toThrow(/not connected/i);
    await expect(s.setDpiLevel(0, 500)).rejects.toThrow(/not connected/i);
    await expect(s.setPolling(500)).rejects.toThrow(/not connected/i);
    expect(link.writes).toHaveLength(1);
  });
});

describe("MouseService: notifications", () => {
  it("forwards snapshots to the listeners and stops after unsubscribing", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    const seen: string[] = [];
    const off = s.onSnapshot((x) => seen.push(x.connection));
    s.start();
    await until(() => s.snapshot().connection === "connected");
    expect(seen).toContain("connected");
    off();
    const n = seen.length;
    await s.setProfile(1);
    expect(seen.length).toBe(n);
  });
});
