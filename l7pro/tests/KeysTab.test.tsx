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

describe("Keys tab: reading", () => {
  it("shows the five buttons with their current function", async () => {
    await open();
    expect(key("Left button").textContent).toContain("Default (Left button)");
    expect(key("Middle button").textContent).toContain("Default (Middle button)");
    expect(key("Right button").textContent).toContain("Default (Right button)");
    expect(key("Advance").textContent).toContain("Default (Advance)");
    expect(key("Back").textContent).toContain("Default (Back)");
  });

  it("names the assigned functions, including unknown ones", async () => {
    await open(withKey(3, 3, [0xe2, 0, 0]));
    expect(key("Advance").textContent).toContain("Mute");
    cleanup();
    await open(withKey(4, 2, [0x03, 0x29, 0]));
    expect(key("Back").textContent).toContain("Ctrl + Shift + Esc");
    cleanup();
    await open(withKey(4, 10, [1, 0, 0]));
    expect(key("Back").textContent).toContain("Other (type 10)");
  });

  it("opening it writes nothing", async () => {
    const api = await open();
    expect(api.calls).toEqual([]);
  });
});

describe("Keys tab: writes", () => {
  it("starts on Advance: choosing a function assigns it right away, without a dialog", async () => {
    const api = await open();
    fireEvent.click(fnButton("Mute"));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, functionById("mute").action]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Back is assigned right away like Advance", async () => {
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
  ])("%s asks for confirmation before writing", async (name, index) => {
    const api = await open();
    fireEvent.click(key(name));
    fireEvent.click(fnButton("Mute"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(api.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", index, functionById("mute").action]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel in the dialog writes nothing", async () => {
    const api = await open();
    fireEvent.click(key("Left button"));
    fireEvent.click(fnButton("Disabled"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("keyboard: key and modifiers chosen, then Assign", async () => {
    const api = await open();
    fireEvent.change(screen.getByLabelText("Keyboard key"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ctrl" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign key" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, keyboardAction(0x06, 0x01)]]));
  });

  it("keyboard: two modifiers", async () => {
    const api = await open();
    fireEvent.change(screen.getByLabelText("Keyboard key"), { target: { value: "Esc" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ctrl" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shift" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign key" }));
    await waitFor(() => expect(api.calls).toEqual([["setKey", 3, keyboardAction(0x29, 0x03)]]));
  });

  it("the function shows right away, before the mouse confirms", async () => {
    await open();
    window.l7.setKey = () => new Promise<void>(() => {});
    fireEvent.click(fnButton("Mute"));
    expect(key("Advance").textContent).toContain("Mute");
  });

  it("a write error is shown and the button goes back to how it was", async () => {
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
  it("restores the buttons to default, without a dialog if only the side ones are touched", async () => {
    const api = await open(withKey(3, 3, [0xe2, 0, 0]));
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    await waitFor(() => expect(api.calls).toEqual([["restoreKeyDefaults"]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for confirmation if a main button was changed", async () => {
    const api = await open(withKey(2, 9, [0xff, 0xff, 0xff]));
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(api.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.calls).toEqual([["restoreKeyDefaults"]]));
  });

  it("is disabled when everything is already default", async () => {
    await open();
    expect((screen.getByRole("button", { name: "Restore defaults" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
