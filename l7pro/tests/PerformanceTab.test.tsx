// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

async function open(snapshot = connectedSnapshot()) {
  const api = installFakeApi(snapshot);
  render(<App />);
  fireEvent.click(await screen.findByRole("tab", { name: "Performance" }));
  return api;
}
const toggle = (name: string) => screen.getByRole("switch", { name }) as HTMLInputElement;
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;
const release = (el: Element) => fireEvent.pointerUp(el);

describe("Performance tab: valori letti", () => {
  it("mostra i valori del profilo attivo con le descrizioni", async () => {
    await open();
    expect(radio("1 mm").checked).toBe(true);
    expect(radio("2 mm").checked).toBe(false);
    expect(toggle("Motion Sync").checked).toBe(true);
    expect(toggle("Ripple Control").checked).toBe(false);
    expect(toggle("Angle Snapping").checked).toBe(false);
    expect(slider("Key debounce time").value).toBe("6");
    expect(slider("Sleep timer").value).toBe("3");
    expect((screen.getByRole("checkbox", { name: "Never sleep" }) as HTMLInputElement).checked).toBe(false);
    expect(slider("Rotate").value).toBe("0");
    expect(screen.getByText("Lift-off Distance (mm)")).toBeTruthy();
    expect(screen.getByText(/The mouse will make linear corrections when moving/)).toBeTruthy();
    expect(screen.getByText(/The distance at which the mouse stops tracking/)).toBeTruthy();
  });

  it("sleep 0 = Never sleep spuntato e slider fermo", async () => {
    const s = connectedSnapshot();
    s.state = { ...s.state!, sleep: 0 };
    await open(s);
    expect((screen.getByRole("checkbox", { name: "Never sleep" }) as HTMLInputElement).checked).toBe(true);
    expect(slider("Sleep timer").disabled).toBe(true);
  });

  it("non mostra la selezione della modalita'", async () => {
    await open();
    expect(screen.queryByText("Performance Mode")).toBeNull();
    expect(screen.queryByText(/Mode selection/)).toBeNull();
  });

  it("aprirla non scrive niente", async () => {
    const api = await open();
    expect(api.calls).toEqual([]);
  });
});

describe("Performance tab: polling rate", () => {
  const rate = (hz: number) => screen.getByRole("radio", { name: `${hz} Hz` }) as HTMLInputElement;

  it("offre solo le frequenze del dongle e segna quella attuale", async () => {
    await open(connectedSnapshot({ pollingRates: [125, 500, 1000] }));
    expect(screen.getAllByRole("radio", { name: /Hz$/ }).map((r) => r.getAttribute("aria-label"))).toEqual(["125 Hz", "500 Hz", "1000 Hz"]);
    expect(rate(1000).checked).toBe(true);
    expect(rate(500).checked).toBe(false);
  });

  it("scegliere una frequenza la scrive subito, senza dialogo", async () => {
    const api = await open();
    fireEvent.click(rate(500));
    await waitFor(() => expect(api.calls).toEqual([["setPolling", 500]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("la selezione si sposta subito, senza aspettare la conferma del mouse", async () => {
    await open();
    window.l7.setPolling = () => new Promise<void>(() => {});
    fireEvent.click(rate(500));
    expect(rate(500).checked).toBe(true);
    expect(rate(1000).checked).toBe(false);
  });

  it("se la scrittura fallisce la selezione torna al valore del mouse", async () => {
    await open();
    window.l7.setPolling = async () => {
      throw new Error("Mouse not connected");
    };
    fireEvent.click(rate(500));
    await screen.findByRole("alert");
    expect(rate(1000).checked).toBe(true);
  });

  it.each([4000, 8000])("avvisa quando la frequenza attuale e' %s Hz", async (hz) => {
    const s = connectedSnapshot();
    s.state = { ...s.state!, usbRateIndex: s.pollingRates.indexOf(hz), wirelessRateIndex: s.pollingRates.indexOf(hz) };
    await open(s);
    expect(screen.getByText("Higher power use and CPU load")).toBeTruthy();
  });

  it("nessun avviso a 2000 Hz", async () => {
    await open();
    expect(screen.queryByText("Higher power use and CPU load")).toBeNull();
  });
});

describe("Performance tab: scritture", () => {
  it("gli interruttori scrivono subito, senza dialogo", async () => {
    const api = await open();
    fireEvent.click(toggle("Ripple Control"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rippleControl: true }]]));
    fireEvent.click(toggle("Motion Sync"));
    await waitFor(() => expect(api.calls[1]).toEqual(["setSensor", { motionSync: false }]));
    fireEvent.click(toggle("Angle Snapping"));
    await waitFor(() => expect(api.calls[2]).toEqual(["setSensor", { angleSnapping: true }]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("interruttori e LOD si spostano subito, prima della conferma del mouse", async () => {
    await open();
    window.l7.setSensor = () => new Promise<void>(() => {});
    fireEvent.click(toggle("Ripple Control"));
    expect(toggle("Ripple Control").checked).toBe(true);
    fireEvent.click(radio("2 mm"));
    expect(radio("2 mm").checked).toBe(true);
  });

  it("il LOD scrive subito", async () => {
    const api = await open();
    fireEvent.click(radio("2 mm"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { lodMm: 2 }]]));
  });

  it("debounce: muovere non scrive, rilasciare scrive", async () => {
    const api = await open();
    fireEvent.change(slider("Key debounce time"), { target: { value: "9" } });
    expect(screen.getByText("9 ms")).toBeTruthy();
    expect(api.calls).toEqual([]);
    release(slider("Key debounce time"));
    await waitFor(() => expect(api.calls).toEqual([["setDebounce", 9]]));
  });

  it("sleep: rilasciare scrive i minuti; Never sleep scrive 0 e togliendolo torna all'ultimo valore", async () => {
    const api = await open();
    fireEvent.change(slider("Sleep timer"), { target: { value: "10" } });
    release(slider("Sleep timer"));
    await waitFor(() => expect(api.calls).toEqual([["setSleep", 10]]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Never sleep" }));
    await waitFor(() => expect(api.calls[1]).toEqual(["setSleep", 0]));
  });

  it("rotate: il rilascio dello slider scrive l'angolo", async () => {
    const api = await open();
    fireEvent.change(slider("Rotate"), { target: { value: "-7" } });
    expect(screen.getByText("-7°")).toBeTruthy();
    expect(api.calls).toEqual([]);
    release(slider("Rotate"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rotate: -7 }]]));
  });

  it("rotate: piu' clic su + e - diventano una sola scrittura", async () => {
    const api = await open();
    const plus = screen.getByRole("button", { name: "Rotate +1" });
    const minus = screen.getByRole("button", { name: "Rotate -1" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(minus);
    expect(screen.getByText("2°")).toBeTruthy();
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rotate: 2 }]]));
  });

  it("un errore di scrittura viene mostrato", async () => {
    await open();
    window.l7.setSensor = async () => {
      throw new Error("Mouse not connected");
    };
    fireEvent.click(toggle("Ripple Control"));
    expect((await screen.findByRole("alert")).textContent).toContain("Mouse not connected");
  });
});
