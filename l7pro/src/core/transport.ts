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
  onInput(fn: (logical: number[]) => void): () => void;
  close(): void;
}

export class Transport implements HidLink {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners: Array<(logical: number[]) => void> = [];

  private constructor(private dev: HID.HID) {
    dev.on("data", (buf: Buffer) => {
      // On Windows the buffer may start with the report ID: we strip it when recognized.
      const body = [REPORT_CONFIRM, REPORT_SHORT, REPORT_LONG].includes(buf[0]) ? buf.subarray(1) : buf;
      const logical = unxor(body);
      for (const l of [...this.listeners]) l(logical);
    });
    dev.on("error", () => {
      /* mouse unplugged or asleep: handled by the requests with a timeout */
    });
  }

  static open(path: string): Transport {
    return new Transport(new HID.HID(path));
  }

  close(): void {
    this.dev.close();
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

  private waitConfirm(cmd: number, timeoutMs: number): Promise<boolean> {
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
        const confirm = this.waitConfirm(cmd, 200);
        this.dev.sendFeatureReport(Array.from(request));
        await confirm;
        const raw = Buffer.from(this.dev.getFeatureReport(reportId, size));
        const res = decodeResponse(raw);
        if (res.cmd === cmd && isPlausible(res.data)) return res;
        await sleep(50);
      }
      throw new Error(`No valid response to command 0x${cmd.toString(16)} (mouse asleep?)`);
    });
  }
}
