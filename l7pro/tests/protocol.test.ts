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
  it("inverte i byte e riempie con 0xFF, con report ID in testa", () => {
    const b = encodeRequest(0x11, 0x58, [1]);
    expect(head(b, 4)).toBe("11 a7 fe ff");
    expect(b.length).toBe(21);
    expect(encodeRequest(0x12, 0x67).length).toBe(65);
  });

  it("rifiuta un report ID sconosciuto", () => {
    expect(() => encodeRequest(0x14, 0x01)).toThrow();
  });
});

describe("buildProfileSwitch", () => {
  it("profilo 1 e profilo 0 coincidono con la cattura reale", () => {
    expect(head(buildProfileSwitch(1), 4)).toBe("11 a7 fe ff");
    expect(head(buildProfileSwitch(0), 4)).toBe("11 a7 ff ff");
  });

  it("rifiuta profili fuori da 0..2", () => {
    expect(() => buildProfileSwitch(3)).toThrow();
    expect(() => buildProfileSwitch(-1)).toThrow();
    expect(() => buildProfileSwitch(1.5)).toThrow();
  });
});

describe("buildProfileRename", () => {
  it("coincide con le due catture reali di M HUB (slot 2: Default3x e Default3)", () => {
    expect(head(buildProfileRename(2, "Default3x"), 13)).toBe("12 a6 fd bb 9a 99 9e 8a 93 8b cc 87 ff");
    expect(head(buildProfileRename(2, "Default3"), 13)).toBe("12 a6 fd bb 9a 99 9e 8a 93 8b cc ff ff");
  });

  it("e' lungo 65 byte e il resto e' riempimento 0xff", () => {
    const b = buildProfileRename(0, "A");
    expect(b.length).toBe(65);
    expect(Array.from(b.subarray(4)).every((x) => x === 0xff)).toBe(true);
  });

  it("rifiuta slot fuori da 0..2", () => {
    expect(() => buildProfileRename(3, "X")).toThrow();
    expect(() => buildProfileRename(-1, "X")).toThrow();
    expect(() => buildProfileRename(1.5, "X")).toThrow();
  });

  it("rifiuta nomi vuoti, troppo lunghi, con '$' o fuori da ASCII stampabile", () => {
    expect(() => buildProfileRename(0, "")).toThrow();
    expect(() => buildProfileRename(0, "   ")).toThrow();
    expect(() => buildProfileRename(0, "A".repeat(17))).toThrow();
    expect(() => buildProfileRename(0, "a$b")).toThrow();
    expect(() => buildProfileRename(0, "caffè")).toThrow();
    expect(() => buildProfileRename(0, "a\tb")).toThrow();
  });
});

describe("buildPollingWrite", () => {
  it("con il wireless scrive solo freeRate", () => {
    expect(head(buildPollingWrite(true, 1), 4)).toBe("11 be ff fe");
    expect(head(buildPollingWrite(true, 2), 4)).toBe("11 be ff fd");
  });

  it("con il cavo scrive solo usbRate", () => {
    expect(head(buildPollingWrite(false, 2), 4)).toBe("11 be fd ff");
  });
});

describe("buildDpiWrite", () => {
  it("scrive i livelli come nella cattura reale e mantiene indici e riservato", () => {
    const b = buildDpiWrite(state, [400, 800, 1164, 3200, 6400, 26000]);
    expect(head(b, 11)).toBe("12 bf fd fd fd 6f fe df fc 73 fb");
    expect(b.length).toBe(65);
  });

  it("scrive anche il numero di livelli attivi e i valori Y uguali agli X", () => {
    const b = buildDpiWrite(state, [400, 800, 1164, 3200, 6400, 26000]);
    // offset logico 16 = sum, 17 = 0xFF, 18.. = Y; sul filo +1 per il report ID e invertito
    expect(b[1 + 16] ^ 0xff).toBe(3);
    expect(b[1 + 17] ^ 0xff).toBe(0xff);
    expect(b[1 + 18] ^ 0xff).toBe(400 & 0xff);
    expect(b[1 + 19] ^ 0xff).toBe(400 >> 8);
  });

  it.each([199, 26001, NaN, 1000.5])("rifiuta il valore DPI %s", (v) => {
    expect(() => buildDpiWrite(state, [400, 800, v, 3200, 6400, 26000])).toThrow();
  });

  it("con un numero di livelli diverso scrive il contatore e tiene l'indice attivo dentro i livelli", () => {
    const b = buildDpiWrite({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, state.dpi, 2);
    expect(b[1 + 16] ^ 0xff).toBe(2); // contatore livelli
    expect(b[1 + 1] ^ 0xff).toBe(1); // indice usb portato a count-1
    expect(b[1 + 2] ^ 0xff).toBe(1); // indice wireless portato a count-1
    const c = buildDpiWrite({ ...state, usbDpiIndex: 0, wirelessDpiIndex: 1 }, state.dpi, 4);
    expect(c[1 + 16] ^ 0xff).toBe(4);
    expect([c[2] ^ 0xff, c[3] ^ 0xff]).toEqual([0, 1]); // indici invariati se gia' dentro
  });

  it.each([0, 7, 2.5, NaN])("rifiuta il contatore di livelli %s", (n) => {
    expect(() => buildDpiWrite(state, state.dpi, n)).toThrow();
  });

  it("rifiuta un numero di livelli diverso da 6", () => {
    expect(() => buildDpiWrite(state, [400, 800])).toThrow();
  });
});

describe("buildLevelRemoval", () => {
  const logical = (b: Buffer) => Array.from(b.subarray(1), (x) => x ^ 0xff);
  const levels = (l: number[]) => Array.from({ length: 6 }, (_, i) => l[4 + i * 2] | (l[5 + i * 2] << 8));

  it("togliendo il primo livello gli altri scalano, il contatore cala e l'indice attivo segue il suo livello", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, 0));
    expect(l[0]).toBe(0x40);
    expect(levels(l)).toEqual([800, 1229, 400, 3200, 6400, 26000]);
    expect(l[16]).toBe(2);
    expect([l[1], l[2]]).toEqual([1, 1]);
  });

  it("togliendo il livello attivo l'indice resta dentro i livelli rimasti", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 2, wirelessDpiIndex: 2 }, 2));
    expect(levels(l)).toEqual([400, 800, 1229, 3200, 6400, 26000]);
    expect(l[16]).toBe(2);
    expect([l[1], l[2]]).toEqual([1, 1]);
  });

  it("l'indice attivo prima del livello tolto non cambia", () => {
    const l = logical(buildLevelRemoval({ ...state, usbDpiIndex: 0, wirelessDpiIndex: 0 }, 1));
    expect([l[1], l[2]]).toEqual([0, 0]);
    expect(levels(l)).toEqual([400, 1229, 800, 3200, 6400, 26000]);
  });

  it("scrive anche i valori Y uguali agli X", () => {
    const l = logical(buildLevelRemoval(state, 0));
    expect(l.slice(18, 30)).toEqual(l.slice(4, 16));
  });

  it("rifiuta indici fuori dai livelli in uso e l'ultimo livello rimasto", () => {
    expect(() => buildLevelRemoval(state, 3)).toThrow();
    expect(() => buildLevelRemoval(state, -1)).toThrow();
    expect(() => buildLevelRemoval({ ...state, activeLevels: 1 }, 0)).toThrow();
  });
});

describe("parseNotification", () => {
  it("decodifica la notifica 0xE2 reale", () => {
    const logical = [0xe2, 0x01, 0x01, 0x00, 0x5d, 0x02, 0x02, 0x03, 0x26, 0x4c, 0x37, 0x20, 0x50, 0x72, 0x6f, 0x00];
    expect(parseNotification(logical)).toEqual({
      battery: 93,
      dpiIndex: 2,
      rateIndex: 2,
      activeLevels: 3,
      profile: 0,
    });
  });

  it("restituisce null se non e' una notifica 0xE2", () => {
    expect(parseNotification([0xe5, 0x58, 0, 0])).toBeNull();
  });
});

describe("parseDeviceStatus", () => {
  it("decodifica la risposta 0x11 0x06 reale", () => {
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
  it("0x11 (valore reale letto dal mouse): LOD 1 mm, motion sync acceso, il resto spento", () => {
    expect(parseSensor(0x11)).toEqual({ lodMm: 1, rippleControl: false, angleSnapping: false, motionSync: true, mode: "Performance" });
  });

  it("LOD 2 mm con bit 1, ripple con bit 2, angle snapping con bit 3", () => {
    expect(parseSensor(0x02).lodMm).toBe(2);
    expect(parseSensor(0x01 | 0x04).rippleControl).toBe(true);
    expect(parseSensor(0x01 | 0x08).angleSnapping).toBe(true);
    expect(parseSensor(0x01 | 0x04).angleSnapping).toBe(false);
  });

  it("LOD con bit 0-1 non previsti (00 o 11) resta sconosciuto", () => {
    expect(parseSensor(0x00).lodMm).toBeNull();
    expect(parseSensor(0x03).lodMm).toBeNull();
  });

  it("modalita': bit 7 = Gaming, bit 7 e 6 = Extreme, altrimenti Performance", () => {
    expect(parseSensor(0x81).mode).toBe("Gaming");
    expect(parseSensor(0xc1).mode).toBe("Extreme");
    expect(parseSensor(0x41).mode).toBe("Performance");
  });
});

describe("supportsGameMode", () => {
  it("vero dal firmware 5.12.4.4 in su", () => {
    expect(supportsGameMode("5.12.4.4")).toBe(true);
    expect(supportsGameMode("5.12.5.0")).toBe(true);
    expect(supportsGameMode("5.13.0.0")).toBe(true);
    expect(supportsGameMode("6.0.0.0")).toBe(true);
  });

  it("falso sotto 5.12.4.4 o con testo non valido", () => {
    expect(supportsGameMode("5.12.4.3")).toBe(false);
    expect(supportsGameMode("5.11.9.9")).toBe(false);
    expect(supportsGameMode("")).toBe(false);
    expect(supportsGameMode("abc")).toBe(false);
  });
});

describe("buildSensorWrite (0x11 0x42, catture reali 10.14-10.18)", () => {
  const bytes = (b: Buffer) => head(b, 11);
  it("LOD 2 mm e 1 mm: solo il LOD, il resto a zero", () => {
    expect(bytes(buildSensorWrite(state, { lodMm: 2 }))).toBe("11 bd fd ff ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { lodMm: 1 }))).toBe("11 bd fe ff ff ff ff ff ff ff ff");
  });
  it("ripple, angle snapping e motion sync: 1 = acceso, 2 = spento, con il LOD attuale", () => {
    expect(bytes(buildSensorWrite(state, { rippleControl: true }))).toBe("11 bd fe fe ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { rippleControl: false }))).toBe("11 bd fe fd ff ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { angleSnapping: true }))).toBe("11 bd fe ff fe ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { angleSnapping: false }))).toBe("11 bd fe ff fd ff ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { motionSync: true }))).toBe("11 bd fe ff ff fe ff ff ff ff ff");
    expect(bytes(buildSensorWrite(state, { motionSync: false }))).toBe("11 bd fe ff ff fd ff ff ff ff ff");
  });
  it("rotate: rotateOpen sempre 1, angolo con segno", () => {
    const r = (deg: number) => head(buildSensorWrite(state, { rotate: deg }), 12);
    expect(r(0)).toBe("11 bd fe ff ff ff ff ff ff fe ff ff");
    expect(r(-1)).toBe("11 bd fe ff ff ff ff ff ff fe 00 ff");
    expect(r(-2)).toBe("11 bd fe ff ff ff ff ff ff fe 01 ff");
    expect(r(2)).toBe("11 bd fe ff ff ff ff ff ff fe fd ff");
    expect(r(-7)).toBe("11 bd fe ff ff ff ff ff ff fe 06 ff");
  });
  it("rifiuta rotate fuori da -30..30, LOD non valido e LOD sconosciuto con una scrittura che lo richiede", () => {
    expect(() => buildSensorWrite(state, { rotate: 31 })).toThrow();
    expect(() => buildSensorWrite(state, { rotate: -31 })).toThrow();
    expect(() => buildSensorWrite(state, { rotate: 1.5 })).toThrow();
    expect(() => buildSensorWrite(state, { lodMm: 3 as 1 })).toThrow();
    expect(() => buildSensorWrite({ ...state, sensor: 0x10 }, { motionSync: false })).toThrow(/LOD/);
  });
});

describe("buildDebounceWrite (0x11 0x43)", () => {
  it("un solo argomento in millisecondi", () => {
    expect(head(buildDebounceWrite(4), 4)).toBe("11 bc fb ff");
    expect(head(buildDebounceWrite(12), 4)).toBe("11 bc f3 ff");
  });
  it("rifiuta valori fuori da 1..20", () => {
    for (const v of [0, 21, -1, 4.5]) expect(() => buildDebounceWrite(v)).toThrow();
  });
});

describe("buildSleepWrite (0x11 0x0A)", () => {
  it("flag 1 e minuti; never sleep = flag 0 e minuti 0", () => {
    expect(head(buildSleepWrite(3), 5)).toBe("11 f5 fe fc ff");
    expect(head(buildSleepWrite(63), 5)).toBe("11 f5 fe c0 ff");
    expect(head(buildSleepWrite(0), 5)).toBe("11 f5 ff ff ff");
  });
  it("rifiuta valori fuori da 0 (never) e 1..63", () => {
    for (const v of [-1, 64, 2.5]) expect(() => buildSleepWrite(v)).toThrow();
  });
});

describe("parseProfileState: rotate", () => {
  it("legge rotate con segno dal byte 49", () => {
    const d = new Array(64).fill(0);
    d[49] = 0xfe;
    expect(parseProfileState(d).rotate).toBe(-2);
    d[49] = 5;
    expect(parseProfileState(d).rotate).toBe(5);
  });
});
