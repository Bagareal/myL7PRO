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
import sideUrl from "../assets/l7_side.png";
import topUrl from "../assets/l7_top.png";

const GROUPS: KeyGroup[] = ["Mouse", "DPI", "Edit", "Multimedia", "Other"];

// Box with the cut-out photos (no background): pixel coordinates. The photos are 778x1478 (top) and 507x1453 (side).
const STAGE = { width: 620, height: 400, label: { width: 128, height: 50 } };
const TOP = { left: 245, top: 8, width: 170, height: 323 };
const SIDE = { left: 520, top: 150, width: 80, height: 229 };
const onTop = (x: number, y: number): [number, number] => [TOP.left + TOP.width * x, TOP.top + TOP.height * y];
const onSide = (x: number, y: number): [number, number] => [SIDE.left + SIDE.width * x, SIDE.top + SIDE.height * y];
// `dot` = point on the button, `label` = top-left corner of the label, `edge` = point of the label where the
// line starts, `knee` = where the horizontal line bends toward the point. Middle sits above Right: the lines never cross.
const SPOTS: Record<number, { dot: [number, number]; label: [number, number]; edge: [number, number]; knee: [number, number] }> = {
  0: { dot: onTop(0.27, 0.3), label: [0, 26], edge: [128, 51], knee: [190, 51] },
  1: { dot: onTop(0.5, 0.16), label: [492, 26], edge: [492, 51], knee: [450, 51] },
  2: { dot: onTop(0.73, 0.3), label: [492, 96], edge: [492, 121], knee: [450, 121] },
  3: { dot: onTop(0.012, 0.36), label: [0, 150], edge: [128, 175], knee: [190, 175] },
  4: { dot: onTop(0.012, 0.49), label: [0, 230], edge: [128, 255], knee: [190, 255] },
};
// Side view: the two side buttons.
const SIDE_DOTS: Record<number, [number, number]> = { 3: onSide(0.45, 0.39), 4: onSide(0.5, 0.55) };

type Pending = { kind: "assign"; button: number; action: KeyAction } | { kind: "restore" };

/** Keys tab of the active profile: mouse buttons on the left, functions on the right (PROTOCOL.md 10.19). */
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
          <img className="stage-img" src={topUrl} alt="" style={{ left: TOP.left, top: TOP.top, width: TOP.width }} />
          <img className="stage-img" src={sideUrl} alt="" style={{ left: SIDE.left, top: SIDE.top, width: SIDE.width }} />
          <svg className="stage-lines" width={STAGE.width} height={STAGE.height} aria-hidden="true">
            {BUTTONS.map((b) => {
              const sp = SPOTS[b.index];
              return (
                <g key={b.index} className={b.index === selected ? "spot active" : "spot"} onClick={() => setSelected(b.index)}>
                  <polyline points={`${sp.edge.join(",")} ${sp.knee.join(",")} ${sp.dot.join(",")}`} />
                  <circle className="ring" cx={sp.dot[0]} cy={sp.dot[1]} r="9" />
                  <circle cx={sp.dot[0]} cy={sp.dot[1]} r="4.5" />
                </g>
              );
            })}
            {[3, 4].map((i) => (
              <g key={i} className={i === selected ? "spot active" : "spot"} onClick={() => setSelected(i)}>
                <circle className="ring" cx={SIDE_DOTS[i][0]} cy={SIDE_DOTS[i][1]} r="9" />
                <circle cx={SIDE_DOTS[i][0]} cy={SIDE_DOTS[i][1]} r="4.5" />
              </g>
            ))}
          </svg>
          {BUTTONS.map((b) => keyButton(b.index))}
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
