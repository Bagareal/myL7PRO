import { afterEach, describe, expect, it } from "vitest";
import { MouseService } from "../src/core/mouseService.js";
import { functionById, keyboardAction } from "../src/core/keys.js";
import { FakeLink } from "./fakeLink.js";

const until = async (cond: () => boolean, ms = 1000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout in attesa della condizione");
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

describe("MouseService: connessione", () => {
  it("senza dispositivo resta 'assente' e si connette quando compare", async () => {
    let link: FakeLink | null = null;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "assente");
    expect(s.snapshot().state).toBeNull();

    link = new FakeLink();
    await until(() => s.snapshot().connection === "connesso");
    const snap = s.snapshot();
    expect(snap.battery).toBe(93);
    expect(snap.wireless).toBe(true);
    expect(snap.profileNames).toEqual(["Default1", "TheFinals", "Default3"]);
    expect(snap.state?.profile).toBe(0);
    expect(snap.pollingRates).toEqual([125, 500, 1000, 2000, 4000, 8000]);
    expect(snap.firmware).toEqual({ mouse: "5.12.5.0", receiver: "5.7.6.0" });
  });

  it("con PID 0x1021 offre solo 125, 500, 1000", async () => {
    const link = new FakeLink();
    link.pid = 0x1021;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    expect(s.snapshot().pollingRates).toEqual([125, 500, 1000]);
  });

  it("se le letture falliscono passa a 'sleep' senza scrivere nulla, poi si riprende", async () => {
    const link = new FakeLink();
    link.failReads = true;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "sleep");
    await expect(s.setDpiLevel(2, 1164)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);

    link.failReads = false;
    await until(() => s.snapshot().connection === "connesso");
  });
});

describe("MouseService: scritture", () => {
  it("setProfile invia il cambio profilo, rilegge e aggiorna lo snapshot", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.setProfile(1);
    expect(hex(link.writes[0], 4)).toBe("11 a7 fe ff");
    expect(s.snapshot().state?.profile).toBe(1);
  });

  it("renameProfile invia 0x12 0x59, rilegge i nomi e aggiorna lo snapshot", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3"]);

    await s.renameProfile(2, "Default3x");
    expect(hex(link.writes[0], 6)).toBe("12 a6 fd bb 9a 99");
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3x"]);
  });

  it("renameProfile con nome o slot non validi rifiuta senza inviare", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    await expect(s.renameProfile(2, "")).rejects.toThrow();
    await expect(s.renameProfile(5, "ok")).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
    expect(s.snapshot().profileNames).toEqual(["Default1", "TheFinals", "Default3"]);
  });

  it("setProfile fuori da 0..2 rifiuta senza inviare", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    await expect(s.setProfile(5)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
  });

  it("due setProfile senza await partono in ordine e vince l'ultimo", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    const a = s.setProfile(1);
    const b = s.setProfile(2);
    await Promise.all([a, b]);
    expect(link.writes.map((w) => hex(w, 4))).toEqual(["11 a7 fe ff", "11 a7 fd ff"]);
    expect(s.snapshot().state?.profile).toBe(2);
  });

  it("setDpiLevel cambia solo quel livello e lascia il resto com'era", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.setDpiLevel(2, 1164);
    expect(link.dpi).toEqual([400, 800, 1164, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(3);
    expect(link.usbDpiIndex).toBe(2);
    expect(s.snapshot().state?.dpi[2]).toBe(1164);
  });

  it.each([[2, 100], [2, 26001], [6, 800], [-1, 800]])("setDpiLevel(%s, %s) rifiuta senza inviare", async (level, dpi) => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    await expect(s.setDpiLevel(level, dpi)).rejects.toThrow();
    expect(link.writes).toHaveLength(0);
  });

  it("setLevelCount cambia solo il numero di livelli attivi e tiene l'indice attivo valido", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.setLevelCount(2);
    expect(link.activeLevels).toBe(2);
    expect(link.dpi).toEqual([400, 800, 1229, 3200, 6400, 26000]);
    expect(link.usbDpiIndex).toBe(1);
    expect(s.snapshot().state?.activeLevels).toBe(2);
    await expect(s.setLevelCount(0)).rejects.toThrow();
    await expect(s.setLevelCount(7)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("restoreDpiDefaults scrive i sei valori di fabbrica con sei livelli in uso, in una sola scrittura", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.restoreDpiDefaults();
    expect(link.dpi).toEqual([400, 800, 1600, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(6);
    expect(link.usbDpiIndex).toBe(2);
    expect(link.writes).toHaveLength(1);
    expect(s.snapshot().state?.activeLevels).toBe(6);
  });

  it("removeLevel toglie quel livello, fa scalare gli altri e tiene valido l'indice attivo", async () => {
    const link = new FakeLink();
    link.usbDpiIndex = 2;
    link.wirelessDpiIndex = 2;
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.removeLevel(0);
    expect(link.dpi).toEqual([800, 1229, 400, 3200, 6400, 26000]);
    expect(link.activeLevels).toBe(2);
    expect(link.usbDpiIndex).toBe(1);
    expect(s.snapshot().state?.dpi.slice(0, 2)).toEqual([800, 1229]);
    await expect(s.removeLevel(5)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("setSensor scrive solo cio' che cambia, tiene il LOD e rilegge lo stato", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

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

  it("setDebounce e setSleep scrivono e rileggono; never sleep = 0", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

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

  it("setKey scrive il tasto e rilegge lo stato; restoreKeyDefaults rimette solo quelli cambiati", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

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

  it("setKey rifiuta senza scrivere se toglie l'ultimo click sinistro o se i dati non sono validi", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

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

  it("setPolling scrive freeRate in wireless e rifiuta valori fuori lista", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    await s.setPolling(500);
    expect(hex(link.writes[0], 4)).toBe("11 be ff fe");
    expect(s.snapshot().state?.wirelessRateIndex).toBe(1);
    await expect(s.setPolling(3000)).rejects.toThrow();
    expect(link.writes).toHaveLength(1);
  });

  it("se la rilettura dopo la scrittura fallisce segnala errore e passa a 'sleep', poi si riprende", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    link.failReadsAfterWrite = true;
    await expect(s.setProfile(2)).rejects.toThrow(/not verified/i);
    expect(s.snapshot().connection).toBe("sleep");
    expect(s.snapshot().error).toBeTruthy();

    link.failReads = false;
    link.failReadsAfterWrite = false;
    await until(() => s.snapshot().connection === "connesso");
    expect(s.snapshot().state?.profile).toBe(2);
    expect(s.snapshot().error).toBeNull();
  });
});

describe("MouseService: controllo continuo della connessione", () => {
  it("dopo lo scollegamento passa ad 'assente', chiude il vecchio canale e si riconnette al ritorno", async () => {
    const old = new FakeLink();
    let current: FakeLink | null = old;
    const s = make(() => current);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    old.failReads = true;
    current = null;
    await until(() => s.snapshot().connection === "assente");
    expect(old.closed).toBe(true);
    expect(s.snapshot().state).toBeNull();

    const fresh = new FakeLink();
    fresh.battery = 80;
    current = fresh;
    await until(() => s.snapshot().connection === "connesso");
    expect(s.snapshot().battery).toBe(80);
  });

  it("con il dongle presente ma il mouse muto passa a 'sleep' e poi riprende", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    link.failReads = true;
    await until(() => s.snapshot().connection === "sleep");
    link.failReads = false;
    await until(() => s.snapshot().connection === "connesso");
  });

  it("aggiorna la batteria e il profilo cambiati dal mouse stesso", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

    link.battery = 50;
    link.profile = 2;
    await until(() => s.snapshot().battery === 50 && s.snapshot().state?.profile === 2);
  });

  it("non rinotifica i listener quando nulla e' cambiato", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    let n = 0;
    s.onSnapshot(() => n++);
    await new Promise((r) => setTimeout(r, 60));
    expect(n).toBe(0);
  });
});

describe("MouseService: guardia di connessione", () => {
  it("con lo stato gia' letto ma il mouse in sleep non invia nessuna scrittura", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    s.start();
    await until(() => s.snapshot().connection === "connesso");

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

describe("MouseService: notifiche", () => {
  it("inoltra gli snapshot ai listener e smette dopo l'annullamento", async () => {
    const link = new FakeLink();
    const s = make(() => link);
    const seen: string[] = [];
    const off = s.onSnapshot((x) => seen.push(x.connection));
    s.start();
    await until(() => s.snapshot().connection === "connesso");
    expect(seen).toContain("connesso");
    off();
    const n = seen.length;
    await s.setProfile(1);
    expect(seen.length).toBe(n);
  });
});
