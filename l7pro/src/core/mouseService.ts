import type { Snapshot } from "../shared/api.js";
import { DEFAULT_ACTION, keepsLeftClick } from "./keys.js";
import { BUTTON_COUNT, buildKeyWrite, DPI_FACTORY, DPI_LEVELS, buildDebounceWrite, buildDpiWrite, buildLevelRemoval, buildPollingWrite, buildProfileRename, buildProfileSwitch, buildSensorWrite, buildSleepWrite, type KeyAction, type ProfileState, type SensorChange } from "./protocol.js";
import { L7Pro } from "./device.js";
import type { HidLink } from "./transport.js";

export interface MouseServiceOptions {
  /** Intervallo di riprova quando il mouse non e' connesso. */
  retryMs?: number;
  /** Intervallo di controllo mentre e' connesso (rileva scollegamenti e cambi fatti dal mouse). */
  pollMs?: number;
  /** Attesa tra scrittura e rilettura. */
  settleMs?: number;
}

const EMPTY: Snapshot = {
  connection: "assente",
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

/** Unico proprietario della connessione: mantiene lo stato letto dal mouse e serializza le scritture. */
export class MouseService {
  private snap: Snapshot = { ...EMPTY };
  private listeners: Array<(s: Snapshot) => void> = [];
  private mouse: L7Pro | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private chain: Promise<unknown> = Promise.resolve();
  /** Dopo una rinomina i nomi vanno riletti al prossimo giro. */
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

  /** Programma il prossimo giro (un solo timer alla volta). */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = this.running
      ? setTimeout(() => void this.cycle(), this.snap.connection === "connesso" ? this.pollMs : this.retryMs)
      : null;
  }

  /** Il canale e' morto o muto: lo chiude, cosi' il prossimo giro lo riapre (o scopre che il dongle non c'e' piu'). */
  private dropMouse(): void {
    try {
      this.mouse?.close();
    } catch {
      /* gia' chiuso */
    }
    this.mouse = null;
  }

  /** Un giro di connessione/lettura; si riprogramma da solo finche' non e' tutto connesso. */
  private cycle(): Promise<void> {
    const run = this.chain.then(async () => {
      if (!this.running) return;
      try {
        if (!this.mouse) {
          const link = this.connect();
          if (!link) {
            this.publish({ ...EMPTY, connection: "assente" });
            return;
          }
          this.mouse = new L7Pro(link);
        }
        await this.refresh(this.mouse);
        this.publish({ connection: "connesso", error: null });
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

  /** Esegue una scrittura in coda; dopo averla inviata rilegge lo stato per verificarla. */
  private write(build: (mouse: L7Pro, state: ProfileState) => Buffer): Promise<void> {
    const run = this.chain.then(async () => {
      const mouse = this.mouse;
      const state = this.snap.state;
      if (this.snap.connection !== "connesso" || !mouse || !state) throw new Error("Mouse not connected");
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

  setDpiLevel(level: number, dpi: number): Promise<void> {
    return this.write((mouse, state) => {
      if (!Number.isInteger(level) || level < 0 || level >= DPI_LEVELS) {
        throw new Error(`Invalid DPI level: ${level} (allowed 0..${DPI_LEVELS - 1})`);
      }
      const next = [...state.dpi];
      next[level] = dpi;
      return buildDpiWrite(state, next);
    });
  }

  /** Quanti livelli DPI il tasto del mouse scorre (1..6). I valori dei livelli non cambiano. */
  setLevelCount(count: number): Promise<void> {
    return this.write((_mouse, state) => buildDpiWrite(state, state.dpi, count));
  }

  /** Toglie proprio quel livello (i successivi scalano di una posizione). */
  removeLevel(index: number): Promise<void> {
    return this.write((_mouse, state) => buildLevelRemoval(state, index));
  }

  /** Valori di fabbrica di M HUB (Restore defaults): sei livelli, tutti in uso. L'indice attivo resta valido. */
  restoreDpiDefaults(): Promise<void> {
    return this.write((_mouse, state) => buildDpiWrite(state, DPI_FACTORY, DPI_LEVELS));
  }

  /** LOD, ripple, angle snapping, motion sync, rotate (0x11 0x42). Mai la modalita'. */
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

  /** Assegna la funzione di un tasto (0x12 0x52). Rifiuta se toglie l'ultimo click sinistro. */
  setKey(button: number, action: KeyAction): Promise<void> {
    return this.write((_mouse, state) => {
      const request = buildKeyWrite(button, action);
      if (!keepsLeftClick(state.keys, button, action)) {
        throw new Error("At least one button must keep the left click");
      }
      return request;
    });
  }

  /** Rimette predefiniti i tasti cambiati, a partire dal sinistro (cosi' il click sinistro resta sempre assegnato). */
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
