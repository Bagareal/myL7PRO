// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { SLIDER_MAX, dpiToSlider, sliderToDpi } from "../src/renderer/dpiScale.js";
import { absentSnapshot, connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

async function open(snapshot = connectedSnapshot()) {
  const api = installFakeApi(snapshot);
  render(<App />);
  await screen.findByRole("tab", { name: "DPI" });
  return api;
}
const slider = (n: number) => screen.getByRole("slider", { name: `Level ${n}` }) as HTMLInputElement;
const applyDpi = () => screen.getByRole("button", { name: "Apply DPI" }) as HTMLButtonElement;
const move = (n: number, pos: number) => fireEvent.change(slider(n), { target: { value: String(pos) } });

describe("DPI tab: livelli", () => {
  it("mostra solo gli slider dei livelli attivi, con il valore attuale", async () => {
    await open();
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect([0, 1, 2].map((n) => slider(n).value)).toEqual([400, 800, 1229].map((d) => String(dpiToSlider(d))));
    expect(screen.queryByRole("slider", { name: "Level 3" })).toBeNull();
    expect(screen.getByText("Levels in use: 3")).toBeTruthy();
    expect(slider(2).min).toBe("0");
    expect(slider(2).max).toBe(String(SLIDER_MAX));
    expect(screen.getByText("1229")).toBeTruthy();
    expect(applyDpi().disabled).toBe(true);
  });

  it("il livello attivo del mouse e' evidenziato e gli altri no", async () => {
    await open();
    const rows = [0, 1, 2].map((n) => slider(n).closest("label")!);
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(rows[2].textContent).toContain("Active");
    expect(rows[0].textContent).not.toContain("Active");
  });

  it("sotto gli slider ci sono i segni delle tacche, una per valore", async () => {
    await open();
    const listId = slider(2).getAttribute("list");
    expect(listId).toBeTruthy();
    const ticks = document.getElementById(listId!)!;
    expect(ticks.tagName).toBe("DATALIST");
    expect(Array.from(ticks.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toEqual(
      Array.from({ length: SLIDER_MAX + 1 }, (_, i) => String(i)),
    );
  });

  it("muovendo lo slider il numero accanto si aggiorna", async () => {
    await open();
    move(2, 6);
    expect(screen.getByText(String(sliderToDpi(6)))).toBeTruthy();
  });

  it("dopo una modifica Apply DPI scrive subito, senza dialogo di conferma", async () => {
    const api = await open();
    move(2, 6);
    expect(applyDpi().disabled).toBe(false);
    fireEvent.click(applyDpi());
    await waitFor(() => expect(api.calls).toEqual([["setDpiLevel", 2, sliderToDpi(6)]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("piu' livelli modificati partono in ordine, uno per scrittura", async () => {
    const api = await open();
    move(0, 9);
    move(2, 6);
    fireEvent.click(applyDpi());
    await waitFor(() =>
      expect(api.calls).toEqual([
        ["setDpiLevel", 0, sliderToDpi(9)],
        ["setDpiLevel", 2, sliderToDpi(6)],
      ]),
    );
  });

  it("un errore di scrittura viene mostrato", async () => {
    await open();
    window.l7.setDpiLevel = async () => {
      throw new Error("Mouse not connected");
    };
    move(2, 6);
    await waitFor(() => expect(applyDpi().disabled).toBe(false));
    fireEvent.click(applyDpi());
    expect((await screen.findByRole("alert")).textContent).toContain("Mouse not connected");
  });
});

describe("DPI tab: numero di livelli", () => {
  const add = () => screen.getByRole("button", { name: "Add level" }) as HTMLButtonElement;
  const remove = (n: number) => screen.getByRole("button", { name: `Remove level ${n}` }) as HTMLButtonElement;

  it("Add level aggiunge subito un livello, senza dialogo", async () => {
    const api = await open();
    fireEvent.click(add());
    await waitFor(() => expect(api.calls).toEqual([["setLevelCount", 4]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Restore defaults ripristina subito i DPI di fabbrica, senza dialogo", async () => {
    const api = await open();
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    await waitFor(() => expect(api.calls).toEqual([["restoreDpiDefaults"]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("senza mouse non c'e' il pulsante Restore defaults", async () => {
    installFakeApi(absentSnapshot());
    render(<App />);
    expect(await screen.findByText("Mouse not connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore defaults" })).toBeNull();
  });

  it("ogni slider ha il suo pulsante e toglie proprio quel livello, subito", async () => {
    const api = await open();
    expect([0, 1, 2].map((n) => remove(n).disabled)).toEqual([false, false, false]);
    fireEvent.click(remove(1));
    await waitFor(() => expect(api.calls).toEqual([["removeLevel", 1]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("i limiti sono 1 e 6 livelli", async () => {
    const one = connectedSnapshot();
    one.state = { ...one.state!, activeLevels: 1 };
    await open(one);
    expect(remove(0).disabled).toBe(true);
    expect(add().disabled).toBe(false);
    cleanup();
    const six = connectedSnapshot();
    six.state = { ...six.state!, activeLevels: 6 };
    await open(six);
    expect(add().disabled).toBe(true);
    expect(remove(0).disabled).toBe(false);
  });

});
