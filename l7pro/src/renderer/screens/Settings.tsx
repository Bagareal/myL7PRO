import { useEffect, useState } from "react";
import type { Snapshot } from "../../shared/api.js";
import { cleanError } from "../errors.js";

export function Settings({ snap }: { snap: Snapshot | null }) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.l7.automation.get().then((v) => alive && setAutostart(v.settings.autostart));
    const off = window.l7.automation.onChange((v) => setAutostart(v.settings.autostart));
    return () => {
      alive = false;
      off();
    };
  }, []);

  async function toggle(on: boolean) {
    setError(null);
    try {
      await window.l7.setAutostart(on);
    } catch (e) {
      setError(cleanError(e));
    }
  }

  return (
    <section>
      <h2>Settings</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          aria-label="Start with Windows"
          checked={autostart === true}
          disabled={autostart === null}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>Start with Windows</span>
      </label>
      <p className="muted">The app starts hidden in the system tray.</p>
      <section aria-labelledby="about-title">
        <h3 id="about-title">About</h3>
        <p>Mouse firmware {snap?.firmware?.mouse ?? "-"}</p>
        <p>Receiver firmware {snap?.firmware?.receiver ?? "-"}</p>
        <p>{snap?.battery == null ? "Battery -" : `Battery ${snap.battery}%`}</p>
      </section>
    </section>
  );
}
