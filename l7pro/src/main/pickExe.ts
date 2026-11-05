import { dialog, type BrowserWindow } from "electron";
import { exeFromPath } from "./foreground.js";

/** Finestra di Windows per scegliere un file .exe. Restituisce il nome del file e un'etichetta, o null se annulla. */
export async function pickExe(parent: BrowserWindow | null): Promise<{ exe: string; label: string } | null> {
  const options = { properties: ["openFile" as const], filters: [{ name: "Programs", extensions: ["exe"] }] };
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  const path = res.canceled ? undefined : res.filePaths[0];
  const exe = exeFromPath(path);
  return exe ? { exe, label: exe.replace(/\.exe$/, "") } : null;
}
