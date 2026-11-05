import { useEffect, useState } from "react";
import type { Snapshot } from "../shared/api.js";
import { Automation } from "./screens/Automation.js";
import { ProfilePage } from "./screens/ProfilePage.js";
import { profileLabel } from "./screens/ProfileHeader.js";
import { Settings } from "./screens/Settings.js";
import { applyAccent, loadAccent } from "./theme.js";

type View = { kind: "profile"; slot: number } | { kind: "trigger" } | { kind: "settings" };

const SLOTS = [0, 1, 2];

function profileName(s: Snapshot): string {
  const p = s.state?.profile;
  if (p === undefined) return "-";
  return s.profileNames?.[p] ?? `Profile ${p + 1}`;
}

function Header({ snap }: { snap: Snapshot | null }) {
  let status: React.ReactNode;
  if (!snap) status = <span className="muted">Connecting...</span>;
  else if (snap.connection === "assente") status = <span className="warn">Mouse not found</span>;
  else if (snap.connection === "sleep") status = <span className="warn">Mouse asleep, retrying</span>;
  else
    status = (
      <>
        <span>{snap.battery === null ? "Battery -" : `Battery ${snap.battery}%`}</span>
        <span>{`Active profile: ${profileName(snap)}`}</span>
      </>
    );
  return (
    <header className="header">
      <strong>myL7PRO</strong>
      <div className="status">{status}</div>
    </header>
  );
}

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [chosen, setChosen] = useState<View | null>(null);

  useEffect(() => applyAccent(loadAccent()), []);

  useEffect(() => {
    let alive = true;
    void window.l7.get().then((s) => alive && setSnap(s));
    const off = window.l7.onSnapshot(setSnap);
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Finche' non si sceglie nulla si segue il profilo attivo del mouse.
  const view: View = chosen ?? { kind: "profile", slot: snap?.state?.profile ?? 0 };
  const names = SLOTS.map((i) => (snap ? profileLabel(snap, i) : `Profile ${i + 1}`));
  const activeSlot = snap?.state?.profile;

  return (
    <div className="app">
      <Header snap={snap} />
      <div className="body">
        <nav className="sidebar">
          {SLOTS.map((i) => (
            <div key={i} className="navrow">
              <button
                className={view.kind === "profile" && view.slot === i ? "active" : ""}
                aria-current={view.kind === "profile" && view.slot === i ? "page" : undefined}
                onClick={() => setChosen({ kind: "profile", slot: i })}
              >
                {names[i]}
              </button>
              {activeSlot === i && <span className="dot" role="img" aria-label="Active on mouse" />}
            </div>
          ))}
          <hr />
          <button className={view.kind === "trigger" ? "active" : ""} onClick={() => setChosen({ kind: "trigger" })}>
            Trigger
          </button>
          <button className={view.kind === "settings" ? "active" : ""} onClick={() => setChosen({ kind: "settings" })}>
            Settings
          </button>
        </nav>
        <main className="content">
          {view.kind === "settings" ? (
            <Settings snap={snap} />
          ) : !snap ? null : view.kind === "trigger" ? (
            <Automation snap={snap} />
          ) : (
            <ProfilePage snap={snap} slot={view.slot} />
          )}
        </main>
      </div>
    </div>
  );
}
