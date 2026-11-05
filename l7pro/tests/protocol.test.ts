import { describe, expect, it } from "vitest";
import {
  buildDebounceWrite,
  buildDpiWrite,
  buildLevelRemoval,
  buildPollingWrite,
  buildProfileRename,
  buildProfileSwitch,
  buildSensorWrite,
  buildSleepWrite,
  encodeRequest,
  parseDeviceStatus,
  parseNotification,
  parseProfileState,
  parseSensor,
  supportsGameMode,
  type ProfileState,
} from "../src/core/protocol.js";

const head = (b: Buffer, n: number) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, "0")).join(" ");

const state: ProfileState = {
  profile: 0,
  usbDpiIndex: 2,
  usbRateIndex: 2,
  wirelessDpiIndex: 2,
  wirelessRateIndex: 2,
  reserved: 2,
  dpi: [400, 800, 1229, 3200, 6400, 26000],
  dpiY: [400, 800, 1229, 3200, 6400, 26000],
  activeLevels: 3,
  sensor: 0x11,
  debounce: 6,
  sleep: 3,
  rotate: 0,
  keys: Array.from({ length: 6 }, () => ({ type: 0, value: [0, 0, 0] as [number, number, number] })),
};

describe("encodeRequest", () => {
  it("inverts the bytes and pads with 0xFF, with the report ID first", () => {
    const b = encodeRequest(0x11, 0x58, [1]);
    expect(head(b, 4)).toBe("11 a7 fe ff");
    expect(b.length).toBe(21);
    expect(encodeRequest(0x12, 0x67).length).toBe(65);
  });

  it("rejects an unknown report ID", () => {
    expect(() => encodeRequest(0x14, 0x01)).toThrow();
  });
});

describe("buildProfileSwitch", () => {
  it("profile 1 and profile 0 match the real capture", () => {
    expect(head(buildProfileSwitch(1), 4)).toBe("11 a7 fe ff");
    expect(head(buildProfileSwitch(0), 4)).toBe("11 a7 ff ff");
  });

  it("rejects profiles outside 0..2", () => {
    expect(() => buildProfileSwitch(3)).toThrow();
    expect(() => buildProfileSwitch(-1)).toThrow();
    expect(() => buildProfileSwitch(1.5)).toThrow();
  });
});

describe("buildProfileRename", () => {
  it("matches the two real M HUB captures (slot 2: Default3x and Default3)", () => {
    expect(head(buildProfileRename(2, "Default3x"), 13)).toBe("12 a6 fd bb 9a 99 9e 8a 93 8b cc 87 ff");
    expect(head(buildProfileRename(2, "Default3"), 13)).toBe("12 a6 fd bb 9a 99 9e 8a 93 8b cc ff ff");
  });

  it("is 65 bytes long and the rest is 0xff padding", () => {
    const b = buildProfileRename(0, "A");
    expect(b.length).toBe(65);
    expect(Array.from(b.subarray(4)).every((x) => x === 0xff)).toBe(true);
  });

  it("rejects slots outside 0..2", () => {
    expect(() => buildProfileRename(3, "X")).toThrow();
    expect(() => buildProfileRename(-1, "X")).toThrow();
    expect(() => buildProfileRename(1.5, "X")).toThrow();
  });

  it("rejects empty or too long names, names with '$' or outside printable ASCII", () => {
    expect(() => buildProfileRename(0, "")).toThrow();
    expect(() => buildProfileRename(0, "   ")).toThrow();
    expect(() => buildProfileRename(0, "A".repeat(17))).toThrow();
    expect(() => buildProfileRename(0, "a$b")).toThrow();
    expect(() => buildProfileRename(0, "caffè")).toThrow();
    expect(() => buildProfileRename(0, "a\tb")).toThrow();
  });
});

describe("buildPollingWrite", () => {
  it("when wireless it writes only freeRate", () => {
    expect(head(buildPollingWrite(true, 1), 4)).toBe("11 be ff fe");
    expect(head(buildPollingWrite(true, 2), 4)).toBe("11 be ff fd");
  });

  it("when wired it writes only usbRate", () => {
    expect(head(buildPollingWrite(false, 2), 4)).toBe("11 be fd ff");
  });
});

describe("buildDpiWrite", () => {
  it("writes the levels as in the real capture and keeps indexes and the reserved byte", () => {
    const b = buildDpiWrite(state, [400, 800, 1164, 3200, 6400, 26000]);
    expect(head(b, 11)).toBe("12 bf fd fd fd 6f fe df fc 73 fb");
    expect(b.length).toBe(65);
  });

  it("also writes the number of levels in use and Y values equal to X", () => {
    const b = buildDpiWrite(state, [400, 800, 1164, 3200, 6400, 26000]);
    // logical offset 16 = sum, 17 = 0xFF, 18.. = Y; on the wire +1 for the report ID and inverted
    expect(b[1 + 16] ^ 0xff).toBe(3);
    expect(b[1 + 17] ^ 0xff).toBe(0xff);
    expect(b[1 + 18] ^ 0xff).toBe(400 & 0xff);
    expect(b[1 + 19] ^ 0xff).toBe(400 >> 8);
  });

  it.each([199, 26001, NaN, 1000.5])("rejects the DPI value %s", (v) => {
    expect(() => buildDpiWrite(state, [400, 800, v, 3200, 6400, 26000])).toThrow();
  });

  it("with a different number of levels it writes the counter and keeps the active index within the levels", () => {
    const b = buildDpiWrite({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, state.dpi, 2);
    expect(b[1 + 16] ^ 0xff).toBe(2); // level counter
    expect(b[1 + 1] ^ 0xff).toBe(1); // usb index moved to count-1
    expect(b[1 + 2] ^ 0xff).toBe(1); // wireless index moved to count-1
    const c = buildDpiWrite({ ...state, usbDpiIndex: 0, wirelessDpiIndex: 1 }, state.dpi, 4);
    expect(c[1 + 16] ^ 0xff).toBe(4);
    expect([c[2] ^ 0xff, c[3] ^ 0xff]).toEqual([0, 1]); // indexes unchanged if already inside
  });

  it.each([0, 7, 2.5, NaN])("rejects the level count %s", (n) => {
    expect(() => buildDpiWrite(state, state.dpi, n)).toThrow();
  });

  it("rejects a number of levels other than 6", () => {
    expect(() => buildDpiWrite(state, [400, 800])).toThrow();
  });
});

describe("buildLevelRemoval", () => {
  const logical = (b: Buffer) => Array.from(b.subarray(1), (x) => x ^ 0xff);
  const levels = (l: number[]) => Array.from({ length: 6 }, (_, i) => l[4 + i * 2] | (l[5 + i * 2] << 8));

  it("removing the first level shifts the others, the counter drops and the active index follows its level", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, 0));
    expect(l[0]).toBe(0x40);
    expect(levels(l)).toEqual([800, 1229, 400, 3200, 6400, 26000]);
    expect(l[16]).toBe(2);
    expect([l[1], l[2]]).toEqual([1, 1]);
  });

  it("removing the active level keeps the index within the remaining levels", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, 2));
    expect(levels(l)).toEqual([400, 800, 1229, 3200, 6400, 26000]);
    expect(l[16]).toBe(2);
    expect([l[1], l[2]]).toEqual([1, 1]);
  });

  it("an active index before the removed level does not change", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 0, wirelessDpiIndex: 0 }, 1));
    expect([l[1], l[2]]).toEqual([0, 0]);
    expect(levels(l)).toEqual([400, 1229, 800, 3200, 6400, 26000]);
  });

  it("also writes Y values equal to X", () => {
    const l = logical(buildLevelRemoval(state, 0));
    expect(l.slice(18, 30)).toEqual(l.slice(4, 16));
  });

  it("rejects indexes outside the levels in use and the last remaining level", () => {
    expect(() => buildLevelRemoval(state, 3)).toThrow();
    expect(() => buildLevelRemoval(state, -1)).toThrow();
    expect(() => buildLevelRemoval({ ...state, activeLevels: 1 }, 0)).toThrow();
  });
});

describe("parseNotification", () => {
  it("decodes the real 0xE2 notification", () => {
    const logical = [0xe2, 0x01, 0x01, 0x00, 0x5d, 0x02, 0x02, 0x03, 0x26, 0x4c, 0x37, 0x20, 0x50, 0x72, 0x6f, 0x00];
    expect(parseNotification(logical)).toEqual({
      battery: 93,
      dpiIndex: 2,
      rateIndex: 2,
      activeLevels: 3,
      profile: 0,
    });
  });

  it("returns null if it is not a 0xE2 notification", () => {
    expect(parseNotification([0xe5, 0x58, 0, 0])).toBeNull();
  });
});

describe("parseDeviceStatus", () => {
  it("decodes the real 0x11 0x06 answer", () => {
    const d = [0x53, 0x52, 0xb0, 0x00, 0x0c, 0x05, 0x05, 0x00, 0x09, 0x5d, 0x00, 0x5d];
    expect(parseDeviceStatus(d)).toMatchObject({
      vid: 0x5253,
      battery: 93,
      connectMode: 1,
      connected: true,
    });
  });
});

describe("parseSensor", () => {
  it("0x11 (real value read from the mouse): LOD 1 mm, motion sync on, the rest off", () => {
    expect(parseSensor(0x11)).toEqual({ lodMm: 1, rippleControl: false, angleSnapping: false, motionSync: true, mode: "Performance" });
  });

  it("LOD 2 mm with bit 1, ripple with bit 2, angle snapping with bit 3", () => {
    expect(parseSensor(0x02).lodMm).toBe(2);
    expect(parseSensor(0x01 | 0x04).rippleControl).toBe(true);
    expect(parseSensor(0x01 | 0x08).angleSnapping).toBe(true);
    expect(parseSensor(0x01 | 0x04).angleSnapping).toBe(false);
  });

  it("LOD with unexpected bits 0-1 (00 or 11) stays unknown", () => {
    expect(parseSensor(0x00).lodMm).toBeNull();
    expect(parseSensor(0x03).lodMm).toBeNull();
  });

  it("mode: bit 7 = Gaming, bits 7 and 6 = Extreme, otherwise Performance", () => {
    expect(parseSensor(0x81).mode).toBe("Gaming");
    expect(parseSensor(0xc1).mode).toBe("Extreme");
    expect(parseSensor(0x41).mode).toBe("Performance");
  });
});

describe("supportsGameMode", () => {
  it("true from firmware 5.12.4.4 upward", () => {
    expect(supportsGameMode("5.12.4.4")).toBe(true);
    expect(supportsGameMode("5.12.5.0")).toBe(true);
    expect(supportsGameMode("5.13.0.0")).toBe(true);
    expect(supportsGameMode("6.0.0.0")).toBe(true);
  });

  it("false below 5.12.4.4 or with invalid text", () => {
    expect(supportsGameMode("5.12.4.3")).toBe(false);
    expect(supportsGameMode("5.11.9.9")).toBe(false);
    expect(supportsGameMode("")).toBe(false);
    expect(supportsGameMode("abc")).toBe(false);
  });
});

describe("buildSensorWrite (0x11 0x42, real captures 10.14-10.18)", () => {
  const bytes = (b: Buffer) => head(b, 11);
  it("LOD 2 mm and 1 mm: only the LOD, the rest zero", () => {
    expect(bytes(buildSensorWrite(state, { lodMm: 2 }))).toBe("11 bd fd ff ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { lodMm: 1 }))).toBe("11 bd fe ff ff ff ff ff ff ff ff");
  });
  it("ripple, angle snapping and motion sync: 1 = on, 2 = off, with the current LOD", () => {
    expect(bytes(buildSensorWrite(state, { rippleControl: true }))).toBe("11 bd fe fe ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { rippleControl: false }))).toBe("11 bd fe fd ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { angleSnapping: true }))).toBe("11 bd fe ff fe ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { angleSnapping: false }))).toBe("11 bd fe ff fd ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { motionSync: true }))).toBe("11 bd fe ff ff fe ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { motionSync: false }))).toBe("11 bd fe ff ff fd ff ff ff ff ff");
  });
  it("rotate: rotateOpen always 1, signed angle", () => {
    const r = (deg: number) => head(buildSensorWrite(state, { rotate: deg }), 12);
    expect(r(0)).toBe("11 bd fe ff ff ff ff ff ff fe ff ff");
    expect(r(-1)).toBe("11 bd fe ff ff ff ff ff ff fe 00 ff");
    expect(r(-2)).toBe("11 bd fe ff ff ff ff ff ff fe 01 ff");
    expect(r(2)).toBe("11 bd fe ff ff ff ff ff ff fe fd ff");
    expect(r(-7)).toBe("11 bd fe ff ff ff ff ff ff fe 06 ff");
  });
  it("rejects rotate outside -30..30, an invalid LOD and an unknown LOD with a write that needs it", () => {
    expect(() => buildSensorWrite(state, { rotate: 31 })).toThrow();
    expect(() => buildSensorWrite(state, { rotate: -31 })).toThrow();
    expect(() => buildSensorWrite(state, { rotate: 1.5 })).toThrow();
    expect(() => buildSensorWrite(state, { lodMm: 3 as 1 })).toThrow();
    expect(() => buildSensorWrite({ ...state, sensor: 0x10 }, { motionSync: false })).toThrow(/LOD/);
  });
});

describe("buildDebounceWrite (0x11 0x43)", () => {
  it("a single argument in milliseconds", () => {
    expect(head(buildDebounceWrite(4), 4)).toBe("11 bc fb ff");
    expect(head(buildDebounceWrite(12), 4)).toBe("11 bc f3 ff");
  });
  it("rejects values outside 1..20", () => {
    for (const v of [0, 21, -1, 4.5]) expect(() => buildDebounceWrite(v)).toThrow();
  });
});

describe("buildSleepWrite (0x11 0x0A)", () => {
  it("flag 1 and minutes; never sleep = flag 0 and minutes 0", () => {
    expect(head(buildSleepWrite(3), 5)).toBe("11 f5 fe fc ff");
    expect(head(buildSleepWrite(63), 5)).toBe("11 f5 fe c0 ff");
    expect(head(buildSleepWrite(0), 5)).toBe("11 f5 ff ff ff");
  });
  it("rejects values outside 0 (never) and 1..63", () => {
    for (const v of [-1, 64, 2.5]) expect(() => buildSleepWrite(v)).toThrow();
  });
});

describe("parseProfileState: rotate", () => {
  it("reads signed rotate from byte 49", () => {
    const d = new Array(64).fill(0);
    d[49] = 0xfe;
    expect(parseProfileState(d).rotate).toBe(-2);
    d[49] = 5;
    expect(parseProfileState(d).rotate).toBe(5);
  });
});
