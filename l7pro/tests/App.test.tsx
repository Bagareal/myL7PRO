// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { absentSnapshot, connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

describe("App: header", () => {
  it("shows mouse, battery and active profile when connected", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    expect(await screen.findByText("myL7PRO")).toBeTruthy();
    expect(screen.getByText("Battery 93%")).toBeTruthy();
    expect(screen.getByText("Active profile: Default1")).toBeTruthy();
  });

  it("without a mouse it shows 'Mouse not found' and no battery", async () => {
    installFakeApi(absentSnapshot());
    render(<App />);
    expect(await screen.findByText("Mouse not found")).toBeTruthy();
    expect(screen.queryByText(/Battery/)).toBeNull();
  });

  it("when asleep it shows 'Mouse asleep, retrying'", async () => {
    installFakeApi(connectedSnapshot({ connection: "sleep" }));
    render(<App />);
    expect(await screen.findByText("Mouse asleep, retrying")).toBeTruthy();
  });

  it("updates when a new snapshot arrives", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByText("Battery 93%");
    act(() => api.emit(connectedSnapshot({ battery: 80 })));
    expect(screen.getByText("Battery 80%")).toBeTruthy();
  });
});

describe("App: side menu", () => {
  it("has the profiles, Triggers and Settings in the decided order", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    const nav = await screen.findByRole("navigation");
    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["Default1", "TheFinals", "Default3", "Triggers", "Settings"]);
  });
});
