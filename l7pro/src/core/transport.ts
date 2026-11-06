import HID from "node-hid";
import {
  CONFIG_USAGE,
  CONFIG_USAGE_PAGE,
  PRODUCT_IDS,
  REPORT_CONFIRM,
  REPORT_LONG,
  REPORT_SHORT,
  VENDOR_ID,
  decodeResponse,
  encodeRequest,
  unxor,
  type Response,
} from "./protocol.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Pause after a request when no confirmation is read (the answer is checked and retried anyway). */
const SETTLE_MS = 40;

export interface FoundDevice {
  path: string;
  productId: number;
  product?: string;
}

/** Lists the configuration interfaces (usage page 0xFF01) of the known dongles. */
export function findDevices(): FoundDevice[] {
  return HID.devices()
    .filter(
      (d) =>
        d.vendorId === VENDOR_ID &&
        PRODUCT_IDS.includes(d.productId) &&
        d.usagePage === CONFIG_USAGE_PAGE &&
        d.usage === CONFIG_USAGE &&
        d.path,
    )
    .map((d) => ({ path: d.path as string, productId: d.productId, product: d.product }));
}

/** Communication channel with the mouse: implemented by Transport (real HID) and by a fake in tests. */
export interface HidLink {
  read(
    reportId: number,
    cmd: number,
    args?: number[],
    isPlausible?: (data: number[]) => boolean,
  ): Promise<Response>;
  send(request: Buffer): Promise<boolean>;
  /** Starts reading the input reports in the background (development CLI only, see Transport.listen). */
  listen?(): void;
  onInput(fn: (logical: number[]) => void): () => void;
  close(): void;
}

export class Transport implements HidLink {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners: Array<(logical: number[]) => void> = [];
  private closed = false;

  private listening = false;

  private constructor(private dev: HID.HID) {
    dev.on("error", () => {
      /* mouse unplugged or asleep: handled by the requests with a timeout */
    });
  }

  /**
   * Starts node-hid's background read thread, to see the input reports (confirmations, 0xE2 notifications).
   * The app never calls it: that thread running next to the feature reports corrupted the native heap
   * (crash 0xc0000374 after a few minutes). Only the development CLI uses it.
   */
  listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.dev.on("data", (buf: Buffer) => {
      // On Windows the buffer may start with the report ID: we strip it when recognized.
      const body = [REPORT_CONFIRM, REPORT_SHORT, REPORT_LONG].includes(buf[0]) ? buf.subarray(1) : buf;
      const logical = unxor(body);
      for (const l of [...this.listeners]) l(logical);
    });
  }

  static open(path: string): Transport {
    return new Transport(new HID.HID(path));
  }

  /** Idempotent: closing a node-hid device twice, or using it after closing, corrupts the native heap. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners = [];
    try {
      this.dev.close();
    } catch {
      /* already gone */
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Channel closed");
  }

  /** Listens to input reports (logical data, already inverted). Returns the function that stops listening. */
  onInput(fn: (logical: number[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Serializes operations: one command at a time. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Waits for the 0xE5 confirmation when listening; otherwise just gives the mouse a moment to answer. */
  private waitConfirm(cmd: number, timeoutMs: number): Promise<boolean> {
    if (!this.listening) return sleep(Math.min(timeoutMs, SETTLE_MS)).then(() => false);
    return new Promise((resolve) => {
      const stop = this.onInput((l) => {
        if (l[0] === 0xe5 && l[1] === cmd) {
          clearTimeout(timer);
          stop();
          resolve(true);
        }
      });
      const timer = setTimeout(() => {
        stop();
        resolve(false);
      }, timeoutMs);
    });
  }

  /** Sends an already encoded request and waits for the confirmation (best effort). */
  send(request: Buffer): Promise<boolean> {
    return this.enqueue(async () => {
      this.assertOpen();
      const cmd = request[1] ^ 0xff;
      const confirm = this.waitConfirm(cmd, 400);
      this.dev.sendFeatureReport(Array.from(request));
      return confirm;
    });
  }

  /** Sends a read request and returns the answer, with a few retries. */
  read(
    reportId: number,
    cmd: number,
    args: number[] = [],
    isPlausible: (data: number[]) => boolean = () => true,
  ): Promise<Response> {
    return this.enqueue(async () => {
      const request = encodeRequest(reportId, cmd, args);
      const size = reportId === REPORT_LONG ? 65 : 21;
      for (let attempt = 0; attempt < 6; attempt++) {
        this.assertOpen();
        const confirm = this.waitConfirm(cmd, 200);
        this.dev.sendFeatureReport(Array.from(request));
        await confirm;
        this.assertOpen();
        const raw = Buffer.from(this.dev.getFeatureReport(reportId, size));
        const res = decodeResponse(raw);
        if (res.cmd === cmd && isPlausible(res.data)) return res;
        await sleep(50);
      }
      throw new Error(`No valid response to command 0x${cmd.toString(16)} (mouse asleep?)`);
    });
  }
}
