import type { Snapshot } from "../shared/api.js";
import { DEFAULT_ACTION, keepsLeftClick } from "./keys.js";
import { BUTTON_COUNT, buildKeyWrite, DPI_FACTORY, DPI_LEVELS, buildDebounceWrite, buildDpiWrite, buildLevelRemoval, buildPollingWrite, buildProfileRename, buildProfileSwitch, buildSensorWrite, buildSleepWrite, type KeyAction, type ProfileState, type SensorChange } from "./protocol.js";
import { L7Pro } from "./device.js";
import type { HidLink } from "./transport.js";

export interface MouseServiceOptions {
  /** Retry interval while the mouse is not connected. */
  retryMs?: number;
  /** Check interval while connected (detects unplugging and changes made on the mouse). */
  pollMs?: number;
  /** Wait between a write and the read-back. */
  settleMs?: number;
}

const EMPTY: Snapshot = {
  connection: "absent",
  battery: null,
  wireless: true,
  productId: null,
  firmware: null,
  state: null,
  profileNames: null,
  pollingRates: [],
  error: null,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Single owner of the connection: keeps the state read from the mouse and serializes writes. */
export class MouseService {
  private snap: Snapshot = { ...EMPTY };
  private listeners: Array<(s: Snapshot) => void> = [];
  private mouse: L7Pro | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private chain: Promise<unknown> = Promise.resolve();
  /** After a rename the names must be read again on the next round. */
  private namesStale = false;
  private readonly retryMs: number;
  private readonly pollMs: number;
  private readonly settleMs: number;

  constructor(
    private connect: () => HidLink | null,
    opts: MouseServiceOptions = {},
  ) {
    this.retryMs = opts.retryMs ?? 2000;
    this.pollMs = opts.pollMs ?? 3000;
    this.settleMs = opts.settleMs ?? 200;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.cycle();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.mouse?.close();
    this.mouse = null;
  }

  snapshot(): Snapshot {
    return this.snap;
  }

  onSnapshot(fn: (s: Snapshot) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private publish(patch: Partial<Snapshot>): void {
    const next = { ...this.snap, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.snap)) return;
    this.snap = next;
    for (const l of [...this.listeners]) l(this.snap);
  }

  /** Schedules the next round (one timer at a time). */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = this.running
      ? setTimeout(() => void this.cycle(), this.snap.connection === "connected" ? this.pollMs : this.retryMs)
      : null;
  }

  /** The channel is dead or silent: close it, so the next round reopens it (or finds the dongle is gone). */
  private dropMouse(): void {
    try {
      this.mouse?.close();
    } catch {
      /* already closed */
    }
    this.mouse = null;
  }

  /** One connect/read round; it reschedules itself until everything is connected. */
  private cycle(): Promise<void> {
    const run = this.chain.then(async () => {
      if (!this.running) return;
      try {
        if (!this.mouse) {
          const link = this.connect();
          if (!link) {
            this.publish({ ...EMPTY, connection: "absent" });
            return;
          }
          this.mouse = new L7Pro(link);
        }
        await this.refresh(this.mouse);
        this.publish({ connection: "connected", error: null });
      } catch (e) {
        this.dropMouse();
        this.publish({ connection: "sleep", error: message(e) });
      }
    });
    this.chain = run.catch(() => undefined);
    return run.finally(() => this.schedule());
  }

  private async refresh(mouse: L7Pro): Promise<void> {
    const info = await mouse.receiverInfo();
    mouse.productId = info.pid;
    const state = await mouse.state();
    const next: Partial<Snapshot> = { state, wireless: info.connect === 1, productId: info.pid, pollingRates: mouse.pollingRates() };
    if (!this.snap.firmware) next.firmware = { mouse: await mouse.mouseVersion(), receiver: await mouse.receiverVersion() };
    if (!this.snap.profileNames || this.namesStale) {
      next.profileNames = [await mouse.profileName(0), await mouse.profileName(1), await mouse.profileName(2)];
      this.namesStale = false;
    }
    next.battery = (await mouse.status()).status.battery;
    this.publish(next);
  }

  /** Runs a queued write; after sending it, reads the state back to verify it. */
  private write(build: (mouse: L7Pro, state: ProfileState) => Buffer): Promise<void> {
    const run = this.chain.then(async () => {
      const mouse = this.mouse;
      const state = this.snap.state;
      if (this.snap.connection !== "connected" || !mouse || !state) throw new Error("Mouse not connected");
      const request = build(mouse, state);
      await mouse.transport.send(request);
      await sleep(this.settleMs);
      try {
        await this.refresh(mouse);
        this.publish({ error: null });
      } catch (e) {
        this.dropMouse();
        this.publish({ connection: "sleep", error: message(e) });
        this.schedule();
        throw new Error(`Write sent but not verified: ${message(e)}`);
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  setProfile(profile: number): Promise<void> {
    return this.write(() => buildProfileSwitch(profile));
  }

  renameProfile(slot: number, name: string): Promise<void> {
    return this.write(() => {
      const request = buildProfileRename(slot, name);
      this.namesStale = true;
      return request;
    });
  }

  /** Sets one level. With dpiY the Y axis is written as given (equal to dpi = linked); without it, see buildDpiWrite. */
  setDpiLevel(level: number, dpi: number, dpiY?: number): Promise<void> {
    return this.write((mouse, state) => {
      if (!Number.isInteger(level) || level < 0 || level >= DPI_LEVELS) {
        throw new Error(`Invalid DPI level: ${level} (allowed 0..${DPI_LEVELS - 1})`);
      }
      const next = [...state.dpi];
      next[level] = dpi;
      if (dpiY === undefined) return buildDpiWrite(state, next);
      const nextY = [...state.dpiY];
      nextY[level] = dpiY;
      return buildDpiWrite(state, next, state.activeLevels, nextY);
    });
  }

  /** How many DPI levels the mouse button cycles through (1..6). The level values do not change. */
  setLevelCount(count: number): Promise<void> {
    return this.write((_mouse, state) => buildDpiWrite(state, state.dpi, count));
  }

  /** Removes exactly that level (the following ones shift down by one). */
  removeLevel(index: number): Promise<void> {
    return this.write((_mouse, state) => buildLevelRemoval(state, index));
  }

  /** M HUB factory values (Restore defaults): six levels, all in use. The active index stays valid. */
  restoreDpiDefaults(): Promise<void> {
    return this.write((_mouse, state) => buildDpiWrite(state, DPI_FACTORY, DPI_LEVELS, DPI_FACTORY));
  }

  /** LOD, ripple, angle snapping, motion sync, rotate (0x11 0x42). Never the mode. */
  setSensor(change: SensorChange): Promise<void> {
    return this.write((_mouse, state) => buildSensorWrite(state, change));
  }

  setDebounce(ms: number): Promise<void> {
    return this.write(() => buildDebounceWrite(ms));
  }

  /** Minuti (1..63); 0 = never sleep. */
  setSleep(minutes: number): Promise<void> {
    return this.write(() => buildSleepWrite(minutes));
  }

  /** Assigns a button function (0x12 0x52). Refuses if it removes the last left click. */
  setKey(button: number, action: KeyAction): Promise<void> {
    return this.write((_mouse, state) => {
      const request = buildKeyWrite(button, action);
      if (!keepsLeftClick(state.keys, button, action)) {
        throw new Error("At least one button must keep the left click");
      }
      return request;
    });
  }

  /** Restores the changed buttons to default, starting with the left one (so a left click always stays assigned). */
  async restoreKeyDefaults(): Promise<void> {
    for (let button = 0; button < BUTTON_COUNT; button++) {
      const state = this.snap.state;
      if (state && state.keys[button].type !== 0) await this.setKey(button, DEFAULT_ACTION);
    }
  }

  setPolling(hz: number): Promise<void> {
    return this.write((mouse) => {
      const idx = mouse.pollingRates().indexOf(hz);
      if (idx < 0) throw new Error(`Polling rate not allowed: ${hz}`);
      return buildPollingWrite(this.snap.wireless, idx);
    });
  }
}
