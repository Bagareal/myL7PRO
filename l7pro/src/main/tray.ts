import { Menu, Tray, nativeImage } from "electron";
import type { Snapshot } from "../shared/api.js";
import { TRAY_ICON_PNG_BASE64 } from "./trayIcon.js";
import { trayTemplate, trayTooltip, type TrayActions } from "./trayTemplate.js";

/** System tray icon, with a menu that follows the mouse state. */
export function createTray(actions: TrayActions, initial: Snapshot) {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, "base64"));
  const tray = new Tray(icon);
  const update = (snap: Snapshot) => {
    tray.setToolTip(trayTooltip(snap));
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(snap, actions)));
  };
  tray.on("double-click", actions.open);
  update(initial);
  return { update, destroy: () => tray.destroy() };
}
