import { useEffect, useRef, useState } from "react";
import { DEBOUNCE_MAX, DEBOUNCE_MIN, ROTATE_LIMIT, SLEEP_MAX, parseSensor, type SensorChange } from "../../core/protocol.js";
import type { Snapshot } from "../../shared/api.js";
import topUrl from "../assets/l7_top.png";
import { cleanError } from "../errors.js";

const HEAVY_RATES = [4000, 8000];

const CLICK_DELAY_MS = 400;
const SWEEP = 4; // dial degrees per degree of rotation

/** Dial: the dot slides along the arc, the mouse rotates by the real angle. */
function Dial({ angle }: { angle: number }) {
  const c = { x: 110, y: 110 };
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  };
  const ticks = Array.from({ length: ROTATE_LIMIT * 2 + 1 }, (_, i) => i - ROTATE_LIMIT);
  const dot = at(angle * SWEEP, 84);
  return (
    <svg className="dial" viewBox="0 0 220 220" role="img" aria-label={`Sensor angle ${angle} degrees`}>
      {ticks.map((t) => {
        const major = t % 15 === 0;
        const a = at(t * SWEEP, 84);
        const b = at(t * SWEEP, major ? 74 : 79);
        return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={major ? "tick major" : "tick"} />;
      })}
      {[-30, -15, 0, 15, 30].map((t) => {
        const p = at(t * SWEEP, 98);
        return (
          <text key={t} x={p.x} y={p.y} className="dial-label" textAnchor="middle" dominantBaseline="middle">
            {`${t}°`}
          </text>
        );
      })}
      <circle cx={dot.x} cy={dot.y} r="6" className="dial-dot" />
      <g transform={`rotate(${angle} ${c.x} ${c.y})`}>
        <image href={topUrl} x="76" y="46" width="68" height="128" preserveAspectRatio="xMidYMid meet" />
      </g>
      <text x={c.x} y={c.y + 6} className="dial-value" textAnchor="middle">{`${angle}°`}</text>
    </svg>
  );
}

function Switch({ label, text, checked, onChange }: { label: string; text: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="perf-row">
      <span>
        <strong>{label}</strong>
        <span className="muted">{text}</span>
      </span>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Value shown right at the click; it realigns to the mouse when the new state arrives (or if the write fails). */
function useLocal<T>(fromMouse: T): [T, (v: T) => void] {
  const [value, setValue] = useState(fromMouse);
  useEffect(() => setValue(fromMouse), [fromMouse]);
  return [value, setValue];
}

/** Performance tab of the active profile, with the M HUB layout (PROTOCOL.md 10.14-10.18). */
export function PerformanceTab({ snap }: { snap: Snapshot }) {
  const state = snap.state;
  const [error, setError] = useState<string | null>(null);
  const [debounce, setDebounce] = useState(state?.debounce ?? DEBOUNCE_MIN);
  const [sleep, setSleep] = useState(state?.sleep ?? 0);
  const [rotate, setRotate] = useState(state?.rotate ?? 0);
  const sensor = state ? parseSensor(state.sensor) : null;
  const rateIndex = state ? (snap.wireless ? state.wirelessRateIndex : state.usbRateIndex) : 0;
  const mouseRate = snap.pollingRates[rateIndex];
  const [rate, setRate] = useLocal(mouseRate);
  const [lod, setLod] = useLocal(sensor?.lodMm ?? null);
  const [motionSync, setMotionSync] = useLocal(sensor?.motionSync ?? false);
  const [ripple, setRipple] = useLocal(sensor?.rippleControl ?? false);
  const [angleSnap, setAngleSnap] = useLocal(sensor?.angleSnapping ?? false);
  const lastSleep = useRef(3);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state) setDebounce(state.debounce);
  }, [state?.debounce]);
  useEffect(() => {
    if (!state) return;
    setSleep(state.sleep);
    if (state.sleep > 0) lastSleep.current = state.sleep;
  }, [state?.sleep]);
  useEffect(() => {
    if (state) setRotate(state.rotate);
  }, [state?.rotate]);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  if (!state) return null;

  async function run(job: () => Promise<void>, undo?: () => void) {
    setError(null);
    try {
      await job();
    } catch (e) {
      undo?.();
      setError(cleanError(e));
    }
  }
  const sensorWrite = (change: SensorChange, undo?: () => void) => run(() => window.l7.setSensor(change), undo);

  function nudge(delta: number) {
    const next = Math.max(-ROTATE_LIMIT, Math.min(ROTATE_LIMIT, rotate + delta));
    setRotate(next);
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => void sensorWrite({ rotate: next }), CLICK_DELAY_MS);
  }

  return (
    <div className="perf">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="perf-grid">
        <div className="perf-card">
          <h3>Performance &amp; Response</h3>
          <h4>Polling Rate Setting (Hz)</h4>
          <div className="rates" role="radiogroup" aria-label="Polling rate">
            {snap.pollingRates.map((hz) => (
              <label key={hz} className={hz === rate ? "rate active" : "rate"}>
                <input
                  type="radio"
                  name="polling"
                  aria-label={`${hz} Hz`}
                  checked={hz === rate}
                  onChange={() => {
                    setRate(hz);
                    void run(() => window.l7.setPolling(hz), () => setRate(mouseRate));
                  }}
                />
                {hz}
              </label>
            ))}
          </div>
          {HEAVY_RATES.includes(rate) && <p className="warn">Higher power use and CPU load</p>}
          <h4>Key debounce time (milliseconds)</h4>
          <p className="muted">Lower values mean faster mouse response; higher ones offer better stability. Don&apos;t set it too low to avoid double-clicking.</p>
          <div className="perf-slider">
            <input
              type="range"
              aria-label="Key debounce time"
              min={DEBOUNCE_MIN}
              max={DEBOUNCE_MAX}
              step={1}
              value={debounce}
              onChange={(e) => setDebounce(Number(e.target.value))}
              onPointerUp={() => void run(() => window.l7.setDebounce(debounce))}
              onKeyUp={() => void run(() => window.l7.setDebounce(debounce))}
            />
            <span>{`${debounce} ms`}</span>
          </div>
        </div>

        <div className="perf-card">
          <h3>Tracking &amp; Calibration</h3>
          <h4>Rotate</h4>
          <p className="muted">Adjust sensor angle to match grip for more precise control</p>
          <div className="rotate">
            <button aria-label="Rotate -1" disabled={rotate <= -ROTATE_LIMIT} onClick={() => nudge(-1)}>
              {"−"}
            </button>
            <Dial angle={rotate} />
            <button aria-label="Rotate +1" disabled={rotate >= ROTATE_LIMIT} onClick={() => nudge(1)}>
              +
            </button>
          </div>
          <input
            type="range"
            aria-label="Rotate"
            className="rotate-slider"
            min={-ROTATE_LIMIT}
            max={ROTATE_LIMIT}
            step={1}
            value={rotate}
            onChange={(e) => setRotate(Number(e.target.value))}
            onPointerUp={() => void sensorWrite({ rotate })}
            onKeyUp={() => void sensorWrite({ rotate })}
          />
          <h4>Lift-off Distance (mm)</h4>
          <p className="muted">The distance at which the mouse stops tracking after being lifted.</p>
          <div className="lod">
            {([1, 2] as const).map((mm) => (
              <label key={mm}>
                <input type="radio" name="lod" aria-label={`${mm} mm`} checked={lod === mm}
                  onChange={() => {
                    setLod(mm);
                    void sensorWrite({ lodMm: mm }, () => setLod(sensor?.lodMm ?? null));
                  }}
                />
                {`${mm}mm`}
              </label>
            ))}
          </div>
        </div>

        <div className="perf-card">
          <h3>Power &amp; System</h3>
          <h4>Sleep Timer (min)</h4>
          <p className="muted">After being idle for a specified time in 2.4G and Bluetooth modes, the device will automatically enter sleep mode.</p>
          <div className="perf-slider">
            <input
              type="range"
              aria-label="Sleep timer"
              min={1}
              max={SLEEP_MAX}
              step={1}
              value={Math.max(1, sleep)}
              disabled={sleep === 0}
              onChange={(e) => {
                setSleep(Number(e.target.value));
                lastSleep.current = Number(e.target.value);
              }}
              onPointerUp={() => void run(() => window.l7.setSleep(sleep))}
              onKeyUp={() => void run(() => window.l7.setSleep(sleep))}
            />
            <span>{sleep === 0 ? "-" : sleep}</span>
            <label className="never">
              <input
                type="checkbox"
                aria-label="Never sleep"
                checked={sleep === 0}
                onChange={(e) => {
                  const next = e.target.checked ? 0 : lastSleep.current;
                  setSleep(next);
                  void run(() => window.l7.setSleep(next), () => setSleep(state?.sleep ?? 0));
                }}
              />
              Never sleep
            </label>
          </div>
        </div>

        <div className="perf-card">
          <h3>Motion Optimization</h3>
          <Switch
            label="Motion Sync"
            text="The accuracy of the sensor refresh cycle and the discreteness of the sensor movement data."
            checked={motionSync}
            onChange={(on) => {
              setMotionSync(on);
              void sensorWrite({ motionSync: on }, () => setMotionSync(!on));
            }}
          />
          <Switch
            label="Ripple Control"
            text="The mouse will perform algorithm adjustments at high speeds to eliminate wave-like jitters."
            checked={ripple}
            onChange={(on) => {
              setRipple(on);
              void sensorWrite({ rippleControl: on }, () => setRipple(!on));
            }}
          />
          <Switch
            label="Angle Snapping"
            text="The mouse will make linear corrections when moving."
            checked={angleSnap}
            onChange={(on) => {
              setAngleSnap(on);
              void sensorWrite({ angleSnapping: on }, () => setAngleSnap(!on));
            }}
          />
        </div>
      </div>
    </div>
  );
}
