import { describe, expect, it } from "vitest";
import { cleanText, exeFromPath, toOpenApps } from "../src/main/foreground.js";

const bs = String.fromCharCode(92);
const win = (path: string, name: string, title: string) => ({ title, owner: { path, name } });

describe("cleanText", () => {
  it("toglie i caratteri invisibili che alcuni giochi mettono nei titoli", () => {
    const messy = "T﻿​​H﻿﻿​﻿​​﻿E ​F​I​​N​ALS";
    expect(cleanText(messy)).toBe("THE FINALS");
  });

  it("toglie gli spazi in eccesso e non lancia errori su valori vuoti", () => {
    expect(cleanText("  Apex   Legends ")).toBe("Apex Legends");
    expect(cleanText(undefined)).toBe("");
  });
});

describe("exeFromPath", () => {
  it("prende il nome del file in minuscolo da un percorso Windows", () => {
    expect(exeFromPath(["D:", "Games", "The Finals", "Discovery.exe"].join(bs))).toBe("discovery.exe");
  });

  it("restituisce null per percorsi vuoti o senza .exe", () => {
    expect(exeFromPath("")).toBeNull();
    expect(exeFromPath(undefined)).toBeNull();
    expect(exeFromPath(["C:", "Windows", "notepad"].join(bs))).toBeNull();
  });
});

describe("toOpenApps", () => {
  const p = (...s: string[]) => s.join(bs);

  it("un programma per exe, ordinato per etichetta, con titolo e etichetta puliti", () => {
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

  it("scarta le finestre senza percorso e quelle da escludere (l'app stessa)", () => {
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

  it("usa il nome del file come etichetta se il nome e' vuoto", () => {
    expect(toOpenApps([win(p("C:", "x", "tool.exe"), "", "")], [])[0].label).toBe("tool.exe");
  });
});
