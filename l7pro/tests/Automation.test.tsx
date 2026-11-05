// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import type { AutomationView } from "../src/shared/api.js";
import { absentSnapshot, connectedSnapshot, defaultAutomationView, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

const view = (patch: Partial<AutomationView["settings"]> = {}, state: Partial<AutomationView["state"]> = {}): AutomationView => {
  const v = defaultAutomationView();
  return { settings: { ...v.settings, ...patch }, state: { ...v.state, ...state } };
};
const rules = [
  { id: "r1", exe: "r5apex.exe", label: "Apex Legends", slot: 2 },
  { id: "r2", exe: "discovery.exe", label: "THE FINALS", slot: 1 },
];
const apps = [
  { exe: "brave.exe", label: "Brave Browser", title: "New tab" },
  { exe: "discovery.exe", label: "THE FINALS", title: "THE FINALS" },
  { exe: "code.exe", label: "Visual Studio Code", title: "main.ts - myL7PRO" },
];

async function open(automation = view(), snap = connectedSnapshot(), extra: Parameters<typeof installFakeApi>[1] = {}) {
  const api = installFakeApi(snap, { automation, apps, ...extra });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Triggers" }));
  await screen.findByRole("heading", { name: "Triggers" });
  return api;
}
const select = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;

describe("Automation: normal profile", () => {
  it("shows the three profiles and the current normal one, and changing it writes right away", async () => {
    const api = await open(view({ defaultSlot: 0 }));
    const s = (await screen.findByRole("combobox", { name: "Default profile" })) as HTMLSelectElement;
    expect(Array.from(s.options).map((o) => o.textContent)).toEqual(["Default1", "TheFinals", "Default3"]);
    expect(s.value).toBe("0");
    fireEvent.change(s, { target: { value: "2" } });
    await waitFor(() => expect(api.calls).toEqual([["setDefaultSlot", 2]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Automation: rules", () => {
  it("without rules it explains that automation does nothing", async () => {
    await open(view());
    expect(await screen.findByText("No rules yet. Triggers do nothing until you add one.")).toBeTruthy();
  });

  it("shows every rule with label, program and profile", async () => {
    await open(view({ rules }));
    expect(await screen.findByText("Apex Legends")).toBeTruthy();
    expect(screen.getByText("r5apex.exe")).toBeTruthy();
    expect(select("Profile for Apex Legends").value).toBe("2");
    expect(select("Profile for THE FINALS").value).toBe("1");
  });

  it("changing the profile, moving and removing a rule writes right away", async () => {
    const api = await open(view({ rules }));
    await screen.findByText("Apex Legends");
    fireEvent.change(select("Profile for Apex Legends"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Move THE FINALS up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Apex Legends down" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove rule Apex Legends" }));
    await waitFor(() =>
      expect(api.calls).toEqual([
        ["setRuleSlot", "r1", 0],
        ["moveRule", "r2", "up"],
        ["moveRule", "r1", "down"],
        ["removeRule", "r1"],
      ]),
    );
  });

  it("the first rule cannot move up and the last cannot move down", async () => {
    await open(view({ rules }));
    await screen.findByText("Apex Legends");
    expect((screen.getByRole("button", { name: "Move Apex Legends up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move THE FINALS down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("updates when the settings change", async () => {
    const api = await open(view());
    await screen.findByText("No rules yet. Triggers do nothing until you add one.");
    act(() => api.emitAutomation(view({ rules })));
    expect(await screen.findByText("Apex Legends")).toBeTruthy();
  });
});

describe("Automation: Add app", () => {
  const openPanel = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Add app" }));
    return screen.findByRole("dialog", { name: "Add app" });
  };

  it("lists the open programs and choosing one adds a rule right away on profile 0", async () => {
    const api = await open(view());
    const panel = await openPanel();
    expect(await within(panel).findByText("Brave Browser")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: /Visual Studio Code/ }));
    await waitFor(() => expect(api.calls).toEqual([["addRule", "code.exe", "Visual Studio Code", 0]]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the search filters by label, program or title", async () => {
    await open(view());
    const panel = await openPanel();
    await within(panel).findByText("Brave Browser");
    fireEvent.change(within(panel).getByRole("textbox", { name: "Search programs" }), { target: { value: "myl7pro" } });
    expect(within(panel).queryByText("Brave Browser")).toBeNull();
    expect(within(panel).getByText("Visual Studio Code")).toBeTruthy();
  });

  it("programs that already have a rule cannot be added", async () => {
    await open(view({ rules }));
    const panel = await openPanel();
    const finals = (await within(panel).findByRole("button", { name: /THE FINALS/ })) as HTMLButtonElement;
    expect(finals.disabled).toBe(true);
    expect(within(panel).getByText("already added")).toBeTruthy();
  });

  it("Browse adds the program chosen in the Windows dialog", async () => {
    const api = await open(view(), connectedSnapshot(), { picked: { exe: "r5apex.exe", label: "r5apex" } });
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Browse..." }));
    await waitFor(() => expect(api.calls).toEqual([["addRule", "r5apex.exe", "r5apex", 0]]));
  });

  it("if you cancel the file choice nothing happens and the panel stays open", async () => {
    const api = await open(view(), connectedSnapshot(), { picked: null });
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Browse..." }));
    await new Promise((r) => setTimeout(r, 30));
    expect(api.calls).toEqual([]);
    expect(screen.getByRole("dialog", { name: "Add app" })).toBeTruthy();
  });

  it("Close closes the panel without writing", async () => {
    const api = await open(view());
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("a write error is shown", async () => {
    await open(view());
    window.l7.automation.addRule = async () => {
      throw new Error("code.exe already has a rule");
    };
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: /Visual Studio Code/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("already has a rule");
  });
});

describe("Automation: current state", () => {
  it("shows the foreground program and the profile that follows from it", async () => {
    await open(view({ rules }, { foreground: "discovery.exe", match: { slot: 1, rule: rules[1] } }));
    expect(await screen.findByText("Right now: discovery.exe -> TheFinals")).toBeTruthy();
  });

  it("says so when a manual change is in effect", async () => {
    await open(view({ rules }, { foreground: "discovery.exe", match: { slot: 1, rule: rules[1] }, hold: true }));
    expect(await screen.findByText(/manual change, waiting for the next app/)).toBeTruthy();
  });

  it("without a mouse it warns but the rules stay editable", async () => {
    const api = await open(view({ rules }), absentSnapshot());
    expect(await screen.findByText("Mouse not found", { selector: ".note" })).toBeTruthy();
    fireEvent.change(select("Default profile"), { target: { value: "1" } });
    await waitFor(() => expect(api.calls).toEqual([["setDefaultSlot", 1]]));
  });
});
