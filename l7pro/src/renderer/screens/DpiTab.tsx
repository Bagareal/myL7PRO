import { useEffect, useRef, useState } from "react";
import { DPI_LEVELS } from "../../core/protocol.js";
import type { Snapshot } from "../../shared/api.js";
import { SLIDER_MAX, dpiToSlider, sliderToDpi } from "../dpiScale.js";
import { cleanError } from "../errors.js";

export function DpiTab({ snap }: { snap: Snapshot }) {
  const state = snap.state;
  const connected = snap.connection === "connected" && state !== null;
  const current = state?.dpi ?? [];
  const currentKey = current.join(",");
  const inUse = state?.activeLevels ?? 0;
  // Active level of the wireless link (the dongle); the mouse reports it in every state read.
  const active = state?.wirelessDpiIndex ?? -1;

  const currentY = state?.dpiY ?? [];
  const currentKeyY = currentY.join(",");
  const levelCount = state?.activeLevels ?? 0;
  // Y is "separate" on the mouse when a level in use has a Y different from X (there is no flag).
  const mouseSeparate = current.slice(0, levelCount).some((x, i) => currentY[i] !== x);

  const [values, setValues] = useState<number[]>(() => [...current]);
  const [valuesY, setValuesY] = useState<number[]>(() => [...currentY]);
  const [separate, setSeparate] = useState(mouseSeparate);
  const [error, setError] = useState<string | null>(null);

  // When the mouse reports different values (after a write or a profile change) the edit in progress realigns.
  // Not on first render (the values are already right): a late effect would cancel a slider that was just moved.
  const shownKey = useRef(currentKey + "|" + currentKeyY);
  useEffect(() => {
    const key = currentKey + "|" + currentKeyY;
    if (shownKey.current === key) return;
    shownKey.current = key;
    setValues([...current]);
    setValuesY([...currentY]);
    setSeparate(mouseSeparate);
  }, [currentKey, currentKeyY]);

  const levels = Array.from({ length: inUse }, (_, i) => i);
  // With "Separate X/Y" off, Y follows X (that is also how a separate Y is cleared).
  const targetY = (i: number) => (separate ? valuesY[i] ?? currentY[i] : values[i]);
  const changed = levels.filter(
    (i) => values[i] !== undefined && (values[i] !== current[i] || targetY(i) !== currentY[i]),
  );

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
      for (const i of changed) await window.l7.setDpiLevel(i, values[i], targetY(i));
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
      <label className="xy-toggle">
        <input
          type="checkbox"
          aria-label="Separate X/Y"
          checked={separate}
          disabled={!connected}
          onChange={(e) => {
            setSeparate(e.target.checked);
            if (e.target.checked) setValuesY([...values]);
          }}
        />
        Separate X/Y
      </label>
      <datalist id="dpi-ticks">
        {Array.from({ length: SLIDER_MAX + 1 }, (_, n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="dpi-grid">
        {levels.map((i) => (
          <label key={i} className={i === active ? "dpi-row current" : "dpi-row"} aria-current={i === active ? "true" : undefined}>
            <span className="dpi-name">
              {`Level ${i}`}
              {i === active && <em className="active-tag">Active</em>}
            </span>
            <span className="dpi-axes">
              <span className="dpi-axis">
                {separate && <em>X</em>}
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
              </span>
              {separate && (
                <span className="dpi-axis">
                  <em>Y</em>
                  <input
                    type="range"
                    aria-label={`Level ${i} Y`}
                    min={0}
                    max={SLIDER_MAX}
                    list="dpi-ticks"
                    value={dpiToSlider(valuesY[i] ?? values[i] ?? 200)}
                    disabled={!connected}
                    onChange={(e) =>
                      setValuesY(values.map((x, n) => (n === i ? sliderToDpi(Number(e.target.value)) : valuesY[n] ?? x)))
                    }
                  />
                  <span className="dpi-value">{valuesY[i] ?? ""}</span>
                </span>
              )}
            </span>
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
