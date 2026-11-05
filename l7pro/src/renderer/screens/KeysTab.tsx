import { useState } from "react";
import {
  BUTTONS,
  FUNCTIONS,
  KEYBOARD_KEYS,
  MODIFIERS,
  RISKY_BUTTONS,
  describeAction,
  isDefaultAction,
  keyboardAction,
  type KeyGroup,
} from "../../core/keys.js";
import type { KeyAction } from "../../core/protocol.js";
import type { Snapshot } from "../../shared/api.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { cleanError } from "../errors.js";
import sideUrl from "../assets/l7_black_side.jpg";
import topUrl from "../assets/l7_black.jpg";

const GROUPS: KeyGroup[] = ["Mouse", "DPI", "Edit", "Multimedia", "Other"];

// Riquadro con la foto dall'alto: coordinate in pixel del riquadro. `dot` = punto sul tasto, `label` = angolo in alto a sinistra
// dell'etichetta, `edge` = punto dell'etichetta da cui parte la linea.
const STAGE = { width: 460, height: 420, label: { width: 110, height: 50 } };
const SPOTS: Record<number, { dot: [number, number]; label: [number, number]; edge: [number, number] }> = {
  0: { dot: [178, 113], label: [0, 36], edge: [110, 61] },
  2: { dot: [282, 113], label: [350, 36], edge: [350, 61] },
  1: { dot: [227, 92], label: [350, 106], edge: [350, 131] },
  3: { dot: [129, 165], label: [0, 140], edge: [110, 165] },
  4: { dot: [129, 220], label: [0, 205], edge: [110, 230] },
};
// Vista laterale (angolo in basso a destra): i due tasti laterali.
const SIDE = { left: 350, top: 232, width: 100, height: 180, dots: { 3: [30, 71], 4: [33, 98] } as Record<number, [number, number]> };

type Pending = { kind: "assign"; button: number; action: KeyAction } | { kind: "restore" };

/** Scheda Keys del profilo attivo: tasti del mouse a sinistra, funzioni a destra (PROTOCOL.md 10.19). */
export function KeysTab({ snap }: { snap: Snapshot }) {
  const state = snap.state;
  const [selected, setSelected] = useState(3);
  const [shown, setShown] = useState<Record<number, KeyAction>>({});
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyboardKey, setKeyboardKey] = useState("A");
  const [modifiers, setModifiers] = useState(0);

  if (!state) return null;
  const actionOf = (button: number) => shown[button] ?? state.keys[button];
  const buttonName = (button: number) => BUTTONS[button].name;

  async function write(button: number, action: KeyAction) {
    setError(null);
    setShown((s) => ({ ...s, [button]: action }));
    try {
      await window.l7.setKey(button, action);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setShown((s) => {
        const { [button]: _gone, ...rest } = s;
        return rest;
      });
    }
  }

  function assign(action: KeyAction) {
    if (RISKY_BUTTONS.includes(selected)) setConfirm({ kind: "assign", button: selected, action });
    else void write(selected, action);
  }

  const needsRestore = BUTTONS.some((b) => !isDefaultAction(state.keys[b.index]));
  const restoreTouchesMain = RISKY_BUTTONS.some((i) => !isDefaultAction(state.keys[i]));

  async function restore() {
    setError(null);
    try {
      await window.l7.restoreKeyDefaults();
    } catch (e) {
      setError(cleanError(e));
    }
  }

  function onConfirm() {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    if (pending.kind === "assign") void write(pending.button, pending.action);
    else void restore();
  }

  const keyButton = (index: number) => (
    <button
      key={index}
      className={index === selected ? "key-btn active" : "key-btn"}
      style={{ left: SPOTS[index].label[0], top: SPOTS[index].label[1], width: STAGE.label.width, minHeight: STAGE.label.height }}
      aria-label={`Key ${buttonName(index)}`}
      aria-pressed={index === selected}
      onClick={() => setSelected(index)}
    >
      <strong>{buttonName(index)}</strong>
      <span>{describeAction(actionOf(index), index)}</span>
    </button>
  );

  const usage = KEYBOARD_KEYS.find((k) => k.label === keyboardKey)?.usage ?? 0x04;

  return (
    <div className="keys">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="keys-layout">
        <div className="keys-stage" style={{ width: STAGE.width, height: STAGE.height }}>
          <img className="stage-top" src={topUrl} alt="" />
          <svg className="stage-lines" width={STAGE.width} height={STAGE.height} aria-hidden="true">
            {BUTTONS.map((b) => (
              <g key={b.index} className={b.index === selected ? "spot active" : "spot"} onClick={() => setSelected(b.index)}>
                <line x1={SPOTS[b.index].edge[0]} y1={SPOTS[b.index].edge[1]} x2={SPOTS[b.index].dot[0]} y2={SPOTS[b.index].dot[1]} />
                <circle cx={SPOTS[b.index].dot[0]} cy={SPOTS[b.index].dot[1]} r="6" />
              </g>
            ))}
          </svg>
          {BUTTONS.map((b) => keyButton(b.index))}
          <div className="stage-side" style={{ left: SIDE.left, top: SIDE.top, width: SIDE.width, height: SIDE.height }}>
            <img src={sideUrl} alt="" />
            <svg width={SIDE.width} height={SIDE.height} aria-hidden="true">
              {[3, 4].map((i) => (
                <g key={i} className={i === selected ? "spot active" : "spot"} onClick={() => setSelected(i)}>
                  <circle cx={SIDE.dots[i][0]} cy={SIDE.dots[i][1]} r="6" />
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div className="keys-picker">
          <h3>{`Function for ${buttonName(selected)}`}</h3>
          <div role="group" aria-label="Functions">
            {GROUPS.map((g) => (
              <div key={g} className="fn-group">
                <h4>{g}</h4>
                <div className="fn-list">
                  {FUNCTIONS.filter((f) => f.group === g).map((f) => (
                    <button key={f.id} onClick={() => assign(f.action)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="fn-group">
            <h4>Keyboard</h4>
            <div className="kbd-row">
              <select aria-label="Keyboard key" value={keyboardKey} onChange={(e) => setKeyboardKey(e.target.value)}>
                {KEYBOARD_KEYS.map((k) => (
                  <option key={k.label} value={k.label}>
                    {k.label}
                  </option>
                ))}
              </select>
              {MODIFIERS.map((m) => (
                <label key={m.name}>
                  <input
                    type="checkbox"
                    aria-label={m.name}
                    checked={(modifiers & m.bit) !== 0}
                    onChange={(e) => setModifiers(e.target.checked ? modifiers | m.bit : modifiers & ~m.bit)}
                  />
                  {m.name}
                </label>
              ))}
              <button aria-label="Assign key" onClick={() => assign(keyboardAction(usage, modifiers))}>
                Assign
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        className="keys-restore"
        disabled={!needsRestore}
        onClick={() => (restoreTouchesMain ? setConfirm({ kind: "restore" }) : void restore())}
      >
        Restore defaults
      </button>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "assign" ? `Change ${buttonName(confirm.button)}?` : "Restore default keys?"}
          lines={
            confirm.kind === "assign"
              ? [
                  `${buttonName(confirm.button)} will become: ${describeAction(confirm.action, confirm.button)}.`,
                  "A wrong assignment can make the mouse hard to use. The app always keeps at least one left click.",
                ]
              : ["All buttons go back to their default function."]
          }
          onConfirm={onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
