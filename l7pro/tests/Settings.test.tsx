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
  it("the checkbox reflects the saved setting", async () => {
    await open(true);
    await waitFor(() => expect(box().checked).toBe(true));
    cleanup();
    await open(false);
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it("checking it writes right away, without a dialog", async () => {
    const api = await open(false);
    await waitFor(() => expect(box().disabled).toBe(false));
    fireEvent.click(box());
    await waitFor(() => expect(api.calls).toEqual([["setAutostart", true]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains that it starts hidden in the system tray", async () => {
    await open(false);
    expect(await screen.findByText("The app starts hidden in the system tray.")).toBeTruthy();
  });

  it("an error is shown", async () => {
    await open(false);
    window.l7.setAutostart = async () => {
      throw new Error("Invalid value");
    };
    await waitFor(() => expect(box().disabled).toBe(false));
    fireEvent.click(box());
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid value");
  });

  it("About shows the firmware versions and no battery line", async () => {
    await open(false);
    const about = within(await screen.findByRole("region", { name: "About" }));
    expect(about.getByText("Mouse firmware 5.12.5.0")).toBeTruthy();
    expect(about.getByText("Receiver firmware 5.7.6.0")).toBeTruthy();
    expect(about.queryByText(/Battery/)).toBeNull();
  });

  it("About without a mouse shows dashes", async () => {
    installFakeApi(absentSnapshot(), { automation: defaultAutomationView() });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const about = within(await screen.findByRole("region", { name: "About" }));
    expect(about.getByText("Mouse firmware -")).toBeTruthy();
    expect(about.getByText("Receiver firmware -")).toBeTruthy();
    expect(about.queryByText(/Battery/)).toBeNull();
  });

  it("Check for updates says so when the app is current", async () => {
    const api = await open(false);
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect((await screen.findByRole("status")).textContent).toContain("You have the latest version (1.0.0)");
    expect(api.calls).toContainEqual(["checkUpdate"]);
  });

  it("a newer version offers the download page", async () => {
    const view = defaultAutomationView();
    const api = installFakeApi(connectedSnapshot(), {
      automation: view,
      update: { current: "1.0.0", latest: "1.0.5", available: true, url: "https://github.com/Bagareal/myL7PRO/releases/tag/v1.0.5" },
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect((await screen.findByRole("status")).textContent).toContain("Version 1.0.5 is available");
    fireEvent.click(screen.getByRole("button", { name: "Open download page" }));
    await waitFor(() => expect(api.calls).toContainEqual(["openReleases"]));
  });

  it("a failed check shows the error and the button works again", async () => {
    await open(false);
    window.l7.checkUpdate = async () => {
      throw new Error("Could not reach GitHub. Check your connection and try again.");
    };
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach GitHub");
    await waitFor(() => expect((screen.getByRole("button", { name: "Check for updates" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
