import { describe, expect, it, vi } from "vitest";
import { trayTemplate, trayTooltip } from "../src/main/trayTemplate.js";
import { absentSnapshot, connectedSnapshot } from "./snapshots.js";

const actions = () => ({ open: vi.fn(), setProfile: vi.fn(), quit: vi.fn() });

describe("trayTemplate", () => {
  it("ha Open, i tre profili e Quit, divisi da separatori", () => {
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

  it("segna con la spunta solo il profilo attivo", () => {
    const t = trayTemplate(connectedSnapshot({ state: { ...connectedSnapshot().state!, profile: 1 } }), actions());
    const profiles = t.filter((i) => i.type === "radio");
    expect(profiles.map((p) => p.checked)).toEqual([false, true, false]);
  });

  it("i clic chiamano le azioni giuste", () => {
    const a = actions();
    const t = trayTemplate(connectedSnapshot(), a);
    t.find((i) => i.label === "Open myL7PRO")!.click!();
    t.find((i) => i.label === "Default3")!.click!();
    t.find((i) => i.label === "Quit")!.click!();
    expect(a.open).toHaveBeenCalledTimes(1);
    expect(a.setProfile).toHaveBeenCalledWith(2);
    expect(a.quit).toHaveBeenCalledTimes(1);
  });

  it("senza mouse i profili sono disabilitati ma Open e Quit restano attivi", () => {
    const t = trayTemplate(absentSnapshot(), actions());
    expect(t.filter((i) => i.type === "radio").every((p) => p.enabled === false)).toBe(true);
    expect(t.find((i) => i.label === "Open myL7PRO")!.enabled).not.toBe(false);
    expect(t.find((i) => i.label === "Quit")!.enabled).not.toBe(false);
  });

  it("usa nomi di riserva se i nomi dei profili non sono ancora noti", () => {
    const t = trayTemplate(connectedSnapshot({ profileNames: null }), actions());
    expect(t.filter((i) => i.type === "radio").map((p) => p.label)).toEqual(["Profile 1", "Profile 2", "Profile 3"]);
  });
});

describe("trayTooltip", () => {
  it("mostra batteria e profilo attivo", () => {
    expect(trayTooltip(connectedSnapshot())).toBe("myL7PRO - Battery 93% - Default1");
  });

  it("senza mouse dice che non e' stato trovato", () => {
    expect(trayTooltip(absentSnapshot())).toBe("myL7PRO - Mouse not found");
  });

  it("in sleep lo dice", () => {
    expect(trayTooltip(connectedSnapshot({ connection: "sleep" }))).toBe("myL7PRO - Mouse asleep");
  });
});
