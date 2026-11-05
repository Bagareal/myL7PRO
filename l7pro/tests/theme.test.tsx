// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { DEFAULT_ACCENT, isAccent, loadAccent, onAccent } from "../src/renderer/theme.js";
import { connectedSnapshot, installFakeApi } from "./snapshots.js";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});
afterEach(cleanup);

describe("accent color", () => {
  it("accepts only #rrggbb", () => {
    expect(isAccent("#00e5ff")).toBe(true);
    expect(isAccent("red")).toBe(false);
    expect(isAccent("#fff")).toBe(false);
    expect(isAccent(null)).toBe(false);
  });

  it("the text on top of the color is black on light colors and white on dark ones", () => {
    expect(onAccent("#ffffff")).toBe("#000000");
    expect(onAccent("#00e5ff")).toBe("#000000");
    expect(onAccent("#202060")).toBe("#ffffff");
  });

  it("an invalid saved value goes back to the default color", () => {
    localStorage.setItem("l7.accent", "javascript:1");
    expect(loadAccent()).toBe(DEFAULT_ACCENT);
  });

  it("in Settings a preset color applies right away and stays saved", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accent #ff9d2e" }));
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff9d2e");
    expect(localStorage.getItem("l7.accent")).toBe("#ff9d2e");
    expect(screen.getByRole("button", { name: "Accent #ff9d2e" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("on restart the saved color is applied again", async () => {
    localStorage.setItem("l7.accent", "#a678ff");
    installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByText("myL7PRO");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#a678ff");
  });

  it("the free picker changes the color", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Custom accent color"), { target: { value: "#123456" } });
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#123456");
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe("#ffffff");
  });
});
