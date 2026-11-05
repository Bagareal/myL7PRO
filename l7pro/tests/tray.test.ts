import { describe, expect, it, vi } from "vitest";
import { trayTemplate, trayTooltip } from "../src/main/trayTemplate.js";
import { absentSnapshot, connectedSnapshot } from "./snapshots.js";

const actions = () => ({ open: vi.fn(), setProfile: vi.fn(), quit: vi.fn() });

describe("trayTemplate", () => {
  it("has Open, the three profiles and Quit, split by separators", () => {
    const t = trayTemplate(connectedSnapshot(), actions());
    expect(t.map((i) => i.type === "separator" ? "---" : i.label)).toEqual([
      "Open myL7PRO",
      "---",
      "Default1",
      "TheFinals",
      "Default3",
      "---",
      "Quit",
    ]);
  });

  it("puts the checkmark only on the active profile", () => {
    const t = trayTemplate(connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 1 } }), actions());
    const profiles = t.filter((i) => i.type === "radio");
    expect(profiles.map((p) => p.checked)).toEqual([false, true, false]);
  });

  it("clicks call the right actions", () => {
    const a = actions();
    const t = trayTemplate(connectedSnapshot(), a);
    t.find((i) => i.label === "Open myL7PRO")!.click!();
    t.find((i) => i.label === "Default3")!.click!();
    t.find((i) => i.label === "Quit")!.click!();
    expect(a.open).toHaveBeenCalledTimes(1);
    expect(a.setProfile).toHaveBeenCalledWith(2);
    expect(a.quit).toHaveBeenCalledTimes(1);
  });

  it("without a mouse the profiles are disabled but Open and Quit stay enabled", () => {
    const t = trayTemplate(absentSnapshot(), actions());
    expect(t.filter((i) => i.type === "radio").every((p) => p.enabled === false)).toBe(true);
    expect(t.find((i) => i.label === "Open myL7PRO")!.enabled).not.toBe(false);
    expect(t.find((i) => i.label === "Quit")!.enabled).not.toBe(false);
  });

  it("uses fallback names if the profile names are not known yet", () => {
    const t = trayTemplate(connectedSnapshot({ profileNames: null }), actions());
    expect(t.filter((i) => i.type === "radio").map((p) => p.label)).toEqual(["Profile 1", "Profile 2", "Profile 3"]);
  });
});

describe("trayTooltip", () => {
  it("shows battery and active profile", () => {
    expect(trayTooltip(connectedSnapshot())).toBe("myL7PRO - Battery 93% - Default1");
  });

  it("without a mouse it says it was not found", () => {
    expect(trayTooltip(absentSnapshot())).toBe("myL7PRO - Mouse not found");
  });

  it("says so when asleep", () => {
    expect(trayTooltip(connectedSnapshot({ connection: "sleep" }))).toBe("myL7PRO - Mouse asleep");
  });
});
