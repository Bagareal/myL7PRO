import type { Snapshot } from "../shared/api.js";

export interface TrayItem {
  label?: string;
  type?: "radio" | "separator";
  checked?: boolean;
  enabled?: boolean;
  click?: () => void;
}

export interface TrayActions {
  open(): void;
  setProfile(slot: number): void;
  quit(): void;
}

const nameOf = (s: Snapshot, slot: number) => s.profileNames?.[slot] ?? `Profile ${slot + 1}`;

/** Menu entries of the system tray icon. */
export function trayTemplate(snap: Snapshot, actions: TrayActions): TrayItem[] {
  const connected = snap.connection === "connected" && snap.state !== null;
  const active = snap.state?.profile ?? -1;
  return [
    { label: "Open myL7PRO", click: actions.open },
    { type: "separator" },
    ...[0, 1, 2].map(
      (slot): TrayItem => ({
        label: nameOf(snap, slot),
        type: "radio",
        checked: slot === active,
        enabled: connected,
        click: () => actions.setProfile(slot),
      }),
    ),
    { type: "separator" },
    { label: "Quit", click: actions.quit },
  ];
}

/** Text shown when hovering the icon. */
export function trayTooltip(snap: Snapshot): string {
  if (snap.connection === "absent") return "myL7PRO - Mouse not found";
  if (snap.connection === "sleep") return "myL7PRO - Mouse asleep";
  const profile = snap.state ? nameOf(snap, snap.state.profile) : "-";
  return `myL7PRO - Battery ${snap.battery ?? "-"}% - ${profile}`;
}
