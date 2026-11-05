// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { absentSnapshot, connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

describe("App: intestazione", () => {
  it("mostra mouse, batteria e profilo attivo quando e' connesso", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    expect(await screen.findByText("L7 Pro")).toBeTruthy();
    expect(screen.getByText("Battery 93%")).toBeTruthy();
    expect(screen.getByText("Active profile: Default1")).toBeTruthy();
  });

  it("senza mouse mostra 'Mouse not found' e nessuna batteria", async () => {
    installFakeApi(absentSnapshot());
    render(<App />);
    expect(await screen.findByText("Mouse not found")).toBeTruthy();
    expect(screen.queryByText(/Battery/)).toBeNull();
  });

  it("in sleep mostra 'Mouse asleep, retrying'", async () => {
    installFakeApi(connectedSnapshot({ connection: "sleep" }));
    render(<App />);
    expect(await screen.findByText("Mouse asleep, retrying")).toBeTruthy();
  });

  it("si aggiorna quando arriva un nuovo snapshot", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByText("Battery 93%");
    act(() => api.emit(connectedSnapshot({ battery: 80 })));
    expect(screen.getByText("Battery 80%")).toBeTruthy();
  });
});

describe("App: menu laterale", () => {
  it("ha i profili, Trigger e Settings nell'ordine deciso", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    const nav = await screen.findByRole("navigation");
    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["Default1", "TheFinals", "Default3", "Trigger", "Settings"]);
  });
});
