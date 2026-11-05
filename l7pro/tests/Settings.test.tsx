// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { absentSnapshot, connectedSnapshot, defaultAutomationView, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

async function open(autostart: boolean) {
  const view = defaultAutomationView();
  view.settings.autostart = autostart;
  const api = installFakeApi(connectedSnapshot(), { automation: view });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  return api;
}
const box = () => screen.getByRole("checkbox", { name: "Start with Windows" }) as HTMLInputElement;

describe("Settings", () => {
  it("la casella riflette l'impostazione salvata", async () => {
    await open(true);
    await waitFor(() => expect(box().checked).toBe(true));
    cleanup();
    await open(false);
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it("spuntarla scrive subito, senza dialogo", async () => {
    const api = await open(false);
    await waitFor(() => expect(box().disabled).toBe(false));
    fireEvent.click(box());
    await waitFor(() => expect(api.calls).toEqual([["setAutostart", true]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("spiega che parte nascosta nella barra di sistema", async () => {
    await open(false);
    expect(await screen.findByText("The app starts hidden in the system tray.")).toBeTruthy();
  });

  it("un errore viene mostrato", async () => {
    await open(false);
    window.l7.setAutostart = async () => {
      throw new Error("Invalid value");
    };
    await waitFor(() => expect(box().disabled).toBe(false));
    fireEvent.click(box());
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid value");
  });

  it("About mostra firmware e batteria", async () => {
    await open(false);
    const about = within(await screen.findByRole("region", { name: "About" }));
    expect(about.getByText("Mouse firmware 5.12.5.0")).toBeTruthy();
    expect(about.getByText("Receiver firmware 5.7.6.0")).toBeTruthy();
    expect(about.getByText("Battery 93%")).toBeTruthy();
  });

  it("About senza mouse mostra un trattino", async () => {
    installFakeApi(absentSnapshot(), { automation: defaultAutomationView() });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const about = within(await screen.findByRole("region", { name: "About" }));
    expect(about.getByText("Mouse firmware -")).toBeTruthy();
    expect(about.getByText("Receiver firmware -")).toBeTruthy();
    expect(about.getByText("Battery -")).toBeTruthy();
  });
});
