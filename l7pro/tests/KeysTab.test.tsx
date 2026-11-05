// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { functionById, keyboardAction } from "../src/core/keys.js";
import { connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

async function open(snapshot = connectedSnapshot()) {
  const api = installFakeApi(snapshot);
  render(<App />);
  fireEvent.click(await screen.findByRole("tab", { name: "Keys" }));
  return api;
}
const key = (name: string) => screen.getByRole("button", { name: `Key ${name}` });
const fnButton = (label: string) => within(screen.getByRole("group", { name: "Functions" })).getByRole("button", { name: label });

function withKey(index: number, type: number, value: [number, number, number]) {
  const s = connectedSnapshot();
  const keys = s.state!.keys.map((k) => ({ ...k }));
  keys[index] = { type, value };
  s.state = { ...s.state!, keys };
  return s;
}

describe("Keys tab: lettura", () => {
  it("mostra i cinque tasti con la funzione attuale", async () => {
    await open();
    expect(key("Left button").textContent).toContain("Default (Left button)");
    expect(key("Middle button").textContent).toContain("Default (Middle button)");
    expect(key("Right button").textContent).toContain("Default (Right button)");
    expect(key("Advance").textContent).toContain("Default (Advance)");
    expect(key("Back").textContent).toContain("Default (Back)");
  });

  it("nomina le funzioni assegnate, anche quelle sconosciute", async () => {
    await open(withKey(3, 3, [0xe2, 0, 0]));
    expect(key("Advance").textContent).toContain("Mute");
    cleanup();
    await open(withKey(4, 2, [0x03, 0x29, 0]));
    expect(key("Back").textContent).toContain("Ctrl + Shift + Esc");
    cleanup();
    await open(withKey(4, 10, [1, 0, 0]));
    expect(key("Back").textContent).toContain("Other (type 10)");
  });

  it("aprirla non scrive niente", async () => {
    const api = await open();
    expect(api.calls).toEqual([]);
  });
});

describe("Keys tab: scritture", () => {
  it("parte da Advance: scegliere una funzione la assegna subito, senza dialogo", async () => {
    const api = await open();
    fireEvent.click(fnButton("Mute"));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, functionById("mute").action]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Back si assegna subito come Advance", async () => {
    const api = await open();
    fireEvent.click(key("Back"));
    fireEvent.click(fnButton("Play/Pause"));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 4, functionById("play-pause").action]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["Left button", 0],
    ["Middle button", 1],
    ["Right button", 2],
  ])("%s chiede conferma prima di scrivere", async (name, index) => {
    const api = await open();
    fireEvent.click(key(name));
    fireEvent.click(fnButton("Mute"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(api.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", index, functionById("mute").action]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel nel dialogo non scrive niente", async () => {
    const api = await open();
    fireEvent.click(key("Left button"));
    fireEvent.click(fnButton("Disabled"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("tastiera: tasto e modificatori scelti, poi Assign", async () => {
    const api = await open();
    fireEvent.change(screen.getByLabelText("Keyboard key"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ctrl" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign key" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, keyboardAction(0x06, 0x01)]]));
  });

  it("tastiera: due modificatori", async () => {
    const api = await open();
    fireEvent.change(screen.getByLabelText("Keyboard key"), { target: { value: "Esc" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ctrl" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shift" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign key" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, keyboardAction(0x29, 0x03)]]));
  });

  it("la funzione si vede subito, prima della conferma del mouse", async () => {
    await open();
    window.l7.setKey = () => new Promise<void>(() => {});
    fireEvent.click(fnButton("Mute"));
    expect(key("Advance").textContent).toContain("Mute");
  });

  it("un errore di scrittura viene mostrato e il tasto torna com'era", async () => {
    await open();
    window.l7.setKey = async () => {
      throw new Error("At least one button must keep the left click");
    };
    fireEvent.click(fnButton("Mute"));
    expect((await screen.findByRole("alert")).textContent).toContain("left click");
    expect(key("Advance").textContent).toContain("Default (Advance)");
  });
});

describe("Keys tab: Restore defaults", () => {
  it("rimette predefiniti i tasti, senza dialogo se toccano solo i laterali", async () => {
    const api = await open(withKey(3, 3, [0xe2, 0, 0]));
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    await waitFor(() => expect(api.calls).toEqual([["restoreKeyDefaults"]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chiede conferma se un tasto principale e' stato cambiato", async () => {
    const api = await open(withKey(2, 9, [0xff, 0xff, 0xff]));
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(api.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.calls).toEqual([["restoreKeyDefaults"]]));
  });

  it("e' disabilitato se tutto e' gia' predefinito", async () => {
    await open();
    expect((screen.getByRole("button", { name: "Restore defaults" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
