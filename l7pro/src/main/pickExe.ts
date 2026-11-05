import { dialog, type BrowserWindow } from "electron";
import { exeFromPath } from "./foreground.js";

/** Windows dialog to choose an .exe file. Returns the file name and a label, or null if cancelled. */
export async function pickExe(parent: BrowserWindow | null): Promise<{ exe: string; label: string } | null> {
  const options = { properties: ["openFile" as const], filters: [{ name: "Programs", extensions: ["exe"] }] };
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  const path = res.canceled ? undefined : res.filePaths[0];
  const exe = exeFromPath(path);
  return exe ? { exe, label: exe.replace(/\.exe$/, "") } : null;
}
