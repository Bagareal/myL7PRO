import { useEffect, useState } from "react";
import type { Snapshot } from "../../shared/api.js";
import { cleanError } from "../errors.js";
import { PRESET_ACCENTS, loadAccent, saveAccent } from "../theme.js";

export function Settings({ snap }: { snap: Snapshot | null }) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accent, setAccent] = useState(loadAccent);

  function pick(hex: string) {
    const v = hex.toLowerCase();
    setAccent(v);
    saveAccent(v);
  }

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
      <section aria-labelledby="appearance-title">
        <h3 id="appearance-title">Appearance</h3>
        <div className="swatches" role="group" aria-label="Accent color">
          {PRESET_ACCENTS.map((c) => (
            <button
              key={c}
              className={c === accent ? "swatch sel" : "swatch"}
              style={{ background: c }}
              aria-label={`Accent ${c}`}
              aria-pressed={c === accent}
              onClick={() => pick(c)}
            />
          ))}
          <input type="color" aria-label="Custom accent color" value={accent} onChange={(e) => pick(e.target.value)} />
          <span className="mono">{accent.toUpperCase()}</span>
        </div>
      </section>
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
