import { describe, expect, it } from "vitest";
import { cleanText, exeFromPath, toOpenApps } from "../src/main/foreground.js";

const bs = String.fromCharCode(92);
const win = (path: string, name: string, title: string) => ({ title, owner: { path, name } });

describe("cleanText", () => {
  it("removes the invisible characters some games put in titles", () => {
    const messy = "T﻿​​H﻿﻿​﻿​​﻿E ​F​I​​N​ALS";
    expect(cleanText(messy)).toBe("THE FINALS");
  });

  it("removes extra spaces and does not throw on empty values", () => {
    expect(cleanText("  Apex   Legends ")).toBe("Apex Legends");
    expect(cleanText(undefined)).toBe("");
  });
});

describe("exeFromPath", () => {
  it("takes the lower-case file name from a Windows path", () => {
    expect(exeFromPath(["D:", "Games", "The Finals", "Discovery.exe"].join(bs))).toBe("discovery.exe");
  });

  it("returns null for empty paths or paths without .exe", () => {
    expect(exeFromPath("")).toBeNull();
    expect(exeFromPath(undefined)).toBeNull();
    expect(exeFromPath(["C:", "Windows", "notepad"].join(bs))).toBeNull();
  });
});

describe("toOpenApps", () => {
  const p = (...s: string[]) => s.join(bs);

  it("one program per exe, sorted by label, with clean title and label", () => {
    const list = toOpenApps(
      [
        win(p("C:", "Brave", "brave.exe"), "Brave", "Tab 1"),
        win(p("C:", "Brave", "brave.exe"), "Brave", "Tab 2"),
        win(p("D:", "Finals", "Discovery.exe"), "THE​ FINALS", "T​H​E FINALS"),
        win(p("C:", "Code", "Code.exe"), "Visual Studio Code", "main.ts"),
      ],
      [],
    );
    expect(list).toEqual([
      { exe: "brave.exe", label: "Brave", title: "Tab 1" },
      { exe: "discovery.exe", label: "THE FINALS", title: "THE FINALS" },
      { exe: "code.exe", label: "Visual Studio Code", title: "main.ts" },
    ]);
  });

  it("drops windows without a path and the ones to exclude (the app itself)", () => {
    const list = toOpenApps(
      [
        win("", "Sconosciuto", "x"),
        win(p("C:", "e", "electron.exe"), "Electron", "L7 Pro"),
        win(p("C:", "Code", "Code.exe"), "Visual Studio Code", "main.ts"),
      ],
      ["electron.exe"],
    );
    expect(list.map((a) => a.exe)).toEqual(["code.exe"]);
  });

  it("uses the file name as the label if the name is empty", () => {
    expect(toOpenApps([win(p("C:", "x", "tool.exe"), "", "")], [])[0].label).toBe("tool.exe");
  });
});
