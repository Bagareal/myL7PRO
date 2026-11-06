import { describe, expect, it, vi } from "vitest";

const devices: FakeDevice[] = [];

class FakeDevice {
  closeCalls = 0;
  featureCalls = 0;
  on(): this {
    return this;
  }
  close(): void {
    this.closeCalls++;
    if (this.closeCalls > 1) throw new Error("double close");
  }
  sendFeatureReport(): number {
    this.featureCalls++;
    return 0;
  }
  getFeatureReport(): number[] {
    this.featureCalls++;
    return [];
  }
}

vi.mock("node-hid", () => ({
  default: {
    HID: class {
      constructor() {
        const d = new FakeDevice();
        devices.push(d);
        return d;
      }
    },
    devices: () => [],
  },
}));

import { Transport } from "../src/core/transport.js";

describe("Transport close", () => {
  it("closes the native device only once", () => {
    const t = Transport.open("x");
    t.close();
    t.close();
    expect(devices[devices.length - 1].closeCalls).toBe(1);
  });

  it("never touches the native device after closing", async () => {
    const t = Transport.open("x");
    const dev = devices[devices.length - 1];
    t.close();
    await expect(t.send(Buffer.from([0x11, 0x00]))).rejects.toThrow("Channel closed");
    await expect(t.read(0x11, 0x06)).rejects.toThrow("Channel closed");
    expect(dev.featureCalls).toBe(0);
  });

  it("stops a read that is in flight when the channel is closed", async () => {
    const t = Transport.open("x");
    const dev = devices[devices.length - 1];
    const pending = t.read(0x11, 0x06);
    await Promise.resolve();
    t.close();
    await expect(pending).rejects.toThrow("Channel closed");
    expect(dev.featureCalls).toBe(1);
  });
});
