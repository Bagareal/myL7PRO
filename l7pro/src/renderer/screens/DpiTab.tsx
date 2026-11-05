import { useEffect, useState } from "react";
import { DPI_LEVELS } from "../../core/protocol.js";
import type { Snapshot } from "../../shared/api.js";
import { SLIDER_MAX, dpiToSlider, sliderToDpi } from "../dpiScale.js";
import { cleanError } from "../errors.js";

export function DpiTab({ snap }: { snap: Snapshot }) {
  const state = snap.state;
  const connected = snap.connection === "connesso" && state !== null;
  const current = state?.dpi ?? [];
  const currentKey = current.join(",");
  const inUse = state?.activeLevels ?? 0;

  const [values, setValues] = useState<number[]>(() => [...current]);
  const [error, setError] = useState<string | null>(null);

  // Quando il mouse riporta valori diversi (dopo una scrittura o un cambio profilo) la modifica in corso si riallinea.
  useEffect(() => setValues([...current]), [currentKey]);

  const levels = Array.from({ length: inUse }, (_, i) => i);
  const changed = levels.filter((i) => values[i] !== undefined && values[i] !== current[i]);

  async function run(job: () => Promise<void>) {
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(cleanError(e));
    }
  }

  const applyDpi = () =>
    run(async () => {
      for (const i of changed) await window.l7.setDpiLevel(i, values[i]);
    });
  const addLevel = () => run(() => window.l7.setLevelCount(inUse + 1));
  const restoreDefaults = () => run(() => window.l7.restoreDpiDefaults());
  const removeLevel = (index: number) => run(() => window.l7.removeLevel(index));

  return (
    <section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h3>DPI levels</h3>
      <datalist id="dpi-ticks">
        {Array.from({ length: SLIDER_MAX + 1 }, (_, n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="dpi-grid">
        {levels.map((i) => (
          <label key={i} className="dpi-row">
            <span>{`Level ${i}`}</span>
            <input
              type="range"
              aria-label={`Level ${i}`}
              min={0}
              max={SLIDER_MAX}
              list="dpi-ticks"
              value={dpiToSlider(values[i] ?? current[i] ?? 200)}
              disabled={!connected}
              onChange={(e) => setValues(values.map((v, n) => (n === i ? sliderToDpi(Number(e.target.value)) : v)))}
            />
            <span className="dpi-value">{values[i] ?? ""}</span>
            <button
              className="icon"
              aria-label={`Remove level ${i}`}
              title="Remove this level"
              disabled={!connected || inUse <= 1}
              onClick={(e) => {
                e.preventDefault();
                void removeLevel(i);
              }}
            >
              x
            </button>
          </label>
        ))}
      </div>
      <div className="level-count">
        <span>{`Levels in use: ${inUse}`}</span>
        <button disabled={!connected || inUse >= DPI_LEVELS} onClick={() => void addLevel()}>
          Add level
        </button>
      </div>
      <button disabled={!connected || changed.length === 0} onClick={() => void applyDpi()}>
        Apply DPI
      </button>
      <button disabled={!connected} onClick={() => void restoreDefaults()}>
        Restore defaults
      </button>
    </section>
  );
}
