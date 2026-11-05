import type { HidLink } from "../src/core/transport.js";
import type { Response } from "../src/core/protocol.js";

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Simulated mouse: answers like the real L7 Pro (logical data from PROTOCOL.md section 10). */
export class FakeLink implements HidLink {
  profile = 0;
  usbDpiIndex = 2;
  wirelessDpiIndex = 2;
  usbRate = 2;
  wirelessRate = 2;
  dpi = [400, 800, 1229, 3200, 6400, 26000];
  dpiY = [400, 800, 1229, 3200, 6400, 26000];
  activeLevels = 3;
  pid = 0x1020;
  battery = 93;
  names = ["Default1", "TheFinals", "Default3"];
  sensor = 0x11;
  debounce = 6;
  sleep = 3;
  rotate = 0;
  keys: Array<{ type: number; value: number[] }> = Array.from({ length: 6 }, () => ({ type: 0, value: [0, 0, 0] }));

  /** Every read throws (mouse asleep). */
  failReads = false;
  /** After the next write, reads throw. */
  failReadsAfterWrite = false;
  writes: Buffer[] = [];
  closed = false;
  private listeners: Array<(l: number[]) => void> = [];

  async read(
    _reportId: number,
    cmd: number,
    args: number[] = [],
    isPlausible: (d: number[]) => boolean = () => true,
  ): Promise<Response> {
    if (this.failReads) throw new Error("Nessuna risposta valida (mouse in sleep?)");
    const data = this.dataFor(cmd, args);
    if (!isPlausible(data)) throw new Error("Risposta non plausibile");
    return { cmd, data };
  }

  private dataFor(cmd: number, args: number[]): number[] {
    if (cmd === 0x67) {
      const d = new Array(64).fill(0);
      d[0] = this.profile;
      d[1] = (this.usbRate << 4) | this.usbDpiIndex;
      d[2] = (this.wirelessRate << 4) | this.wirelessDpiIndex;
      d[3] = 2;
      this.dpi.forEach((v, i) => {
        d[4 + i * 2] = v & 0xff;
        d[5 + i * 2] = v >> 8;
      });
      this.dpiY.forEach((v, i) => {
        d[51 + i * 2] = v & 0xff;
        d[52 + i * 2] = v >> 8;
      });
      d[16] = this.activeLevels;
      d[17] = this.sensor;
      d[18] = this.debounce;
      d[19] = this.sleep;
      d[49] = this.rotate & 0xff;
      this.keys.forEach((k, i) => {
        d[20 + i * 4] = (i << 4) | k.type;
        d[21 + i * 4] = k.value[0];
        d[22 + i * 4] = k.value[1];
        d[23 + i * 4] = k.value[2];
      });
      return d;
    }
    if (cmd === 0x68) {
      const i = args[0];
      return [i, ...ascii(this.names[i]), 0, 0, 0, 0];
    }
    if (cmd === 0x03) return [1, 0x53, 0x52, this.pid & 0xff, this.pid >> 8, 1, 0];
    if (cmd === 0x04) {
      const v = args[0] === 0xaa ? "5.7.6.0" : "5.12.5.0";
      return [v.length, ...ascii(v)];
    }
    if (cmd === 0x06) return [0x53, 0x52, 0xb0, 0, 0x0c, 5, 5, 0, 0x09, this.battery, 0, this.battery];
    throw new Error(`Comando non simulato: 0x${cmd.toString(16)}`);
  }

  async send(request: Buffer): Promise<boolean> {
    this.writes.push(Buffer.from(request));
    const l = Array.from(request.subarray(1), (b) => b ^ 0xff);
    if (l[0] === 0x58) this.profile = l[1];
    if (l[0] === 0x40) {
      this.usbDpiIndex = l[1];
      this.wirelessDpiIndex = l[2];
      this.dpi = Array.from({ length: 6 }, (_, i) => l[4 + i * 2] | (l[5 + i * 2] << 8));
      this.dpiY = Array.from({ length: 6 }, (_, i) => l[18 + i * 2] | (l[19 + i * 2] << 8));
      this.activeLevels = l[16];
    }
    if (l[0] === 0x42) {
      this.sensor = (this.sensor & ~0x03) | l[1];
      const bit = (v: number, mask: number) => {
        if (v === 1) this.sensor |= mask;
        if (v === 2) this.sensor &= ~mask;
      };
      bit(l[2], 0x04);
      bit(l[3], 0x08);
      bit(l[4], 0x10);
      if (l[8] === 1) this.rotate = (l[9] << 24) >> 24;
    }
    if (l[0] === 0x52) this.keys[l[1]] = { type: l[3], value: [l[4], l[5], l[6]] };
    if (l[0] === 0x43) this.debounce = l[1];
    if (l[0] === 0x0a) this.sleep = l[1] === 0 ? 0 : l[2];
    if (l[0] === 0x59) {
      const end = l.indexOf(0, 2);
      this.names[l[1]] = String.fromCharCode(...l.slice(2, end < 0 ? undefined : end));
    }
    if (l[0] === 0x41) {
      this.usbRate = l[1];
      this.wirelessRate = l[2];
    }
    if (this.failReadsAfterWrite) this.failReads = true;
    return true;
  }

  onInput(fn: (l: number[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }

  close(): void {
    this.closed = true;
  }
}
