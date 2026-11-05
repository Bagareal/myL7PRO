import { useState } from "react";
import type { Snapshot } from "../../shared/api.js";
import { cleanError } from "../errors.js";
import { DpiTab } from "./DpiTab.js";
import { KeysTab } from "./KeysTab.js";
import { PerformanceTab } from "./PerformanceTab.js";
import { ProfileHeader, profileLabel } from "./ProfileHeader.js";

const TABS = ["DPI", "Performance", "Keys", "Macros"] as const;
type Tab = (typeof TABS)[number];

/**
 * Pagina di un profilo. Il mouse espone i parametri solo del profilo attivo: per un profilo non attivo
 * non si mostra nessun valore (sarebbero di un altro profilo) ma solo la fascia con Switch.
 */
export function ProfilePage({ snap, slot }: { snap: Snapshot; slot: number }) {
  const [tab, setTab] = useState<Tab>("DPI");
  const [error, setError] = useState<string | null>(null);
  const connected = snap.connection === "connesso" && snap.state !== null;
  const active = snap.state?.profile;

  async function switchHere() {
    setError(null);
    try {
      await window.l7.setProfile(slot);
    } catch (e) {
      setError(cleanError(e));
    }
  }

  return (
    <section>
      <ProfileHeader key={slot} snap={snap} slot={slot} />
      {!connected ? (
        <p className="muted">Mouse not connected</p>
      ) : active !== slot ? (
        <div className="switch-band">
          <p>{`The mouse is on ${profileLabel(snap, active ?? 0)}. Switch to ${profileLabel(snap, slot)} to edit it.`}</p>
          <button onClick={() => void switchHere()}>Switch</button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <div role="tablist" className="tabs">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "DPI" ? <DpiTab snap={snap} /> : tab === "Performance" ? <PerformanceTab snap={snap} /> : tab === "Keys" ? <KeysTab snap={snap} /> : <p className="muted">Not available yet</p>}
          </div>
        </>
      )}
    </section>
  );
}
