import { useEffect, useState } from "react";
import type { AutomationView, OpenApp, Snapshot } from "../../shared/api.js";
import { cleanError } from "../errors.js";

function AddAppPanel({
  added,
  onPick,
  onBrowse,
  onClose,
}: {
  added: Set<string>;
  onPick: (app: OpenApp) => void;
  onBrowse: () => void;
  onClose: () => void;
}) {
  const [apps, setApps] = useState<OpenApp[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void window.l7.automation.listApps().then((a) => alive && setApps(a));
    return () => {
      alive = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (apps ?? []).filter(
    (a) => !q || a.label.toLowerCase().includes(q) || a.exe.includes(q) || a.title.toLowerCase().includes(q),
  );

  return (
    <div className="overlay">
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Add app">
        <h3>Add app</h3>
        <input
          aria-label="Search programs"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="app-list">
          {apps === null && <p className="muted">Loading...</p>}
          {apps !== null && shown.length === 0 && <p className="muted">No programs found. Use Browse to pick a file.</p>}
          {shown.map((a) => {
            const done = added.has(a.exe);
            return (
              <button key={a.exe} disabled={done} onClick={() => onPick(a)}>
                <strong>{a.label}</strong> <span className="muted">{a.exe}</span>
                {done && <span className="muted"> already added</span>}
                {a.title && !done && <span className="muted title">{a.title}</span>}
              </button>
            );
          })}
        </div>
        <div className="actions">
          <button onClick={onBrowse}>Browse...</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function Automation({ snap }: { snap: Snapshot }) {
  const [view, setView] = useState<AutomationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.l7.automation.get().then((v) => alive && setView(v));
    const off = window.l7.automation.onChange(setView);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const nameOf = (slot: number) => snap.profileNames?.[slot] ?? `Profile ${slot + 1}`;
  const slots = [0, 1, 2];

  async function run(job: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      await job();
      return true;
    } catch (e) {
      setError(cleanError(e));
      return false;
    }
  }

  if (!view) return <section><h2>Triggers</h2><p className="muted">Loading...</p></section>;
  const { settings, state } = view;
  const api = window.l7.automation;

  const addApp = async (exe: string, label: string) => {
    if (await run(() => api.addRule({ exe, label, slot: 0 }))) setPanel(false);
  };

  return (
    <section>
      <h2>Triggers</h2>
      {snap.connection === "absent" && (
        <p>
          <span className="note">Mouse not found</span>{" "}
          <span className="muted">- rules can still be edited and apply when the mouse is back.</span>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <label className="dpi-row default-row">
        <span>When no rule matches, use:</span>
        <select
          aria-label="Default profile"
          value={settings.defaultSlot}
          onChange={(e) => void run(() => api.setDefaultSlot(Number(e.target.value)))}
        >
          {slots.map((s) => (
            <option key={s} value={s}>
              {nameOf(s)}
            </option>
          ))}
        </select>
      </label>

      <p className="note">
        {`Right now: ${state.foreground ?? "-"}${state.foreground ? ` -> ${nameOf(state.match.slot)}` : ""}`}
        {state.hold && <span className="muted"> (manual change, waiting for the next app)</span>}
      </p>

      <h3>Rules</h3>
      <p className="muted">The first rule that matches wins.</p>
      {settings.rules.length === 0 && (
        <p className="muted">No rules yet. Triggers do nothing until you add one.</p>
      )}
      <div className="rules">
        {settings.rules.map((r, i) => (
          <div key={r.id} className="rule" role="listitem">
            <div className="rule-name">
              <strong>{r.label}</strong>
              <span className="muted">{r.exe}</span>
            </div>
            <select
              aria-label={`Profile for ${r.label}`}
              value={r.slot}
              onChange={(e) => void run(() => api.setRuleSlot(r.id, Number(e.target.value)))}
            >
              {slots.map((s) => (
                <option key={s} value={s}>
                  {nameOf(s)}
                </option>
              ))}
            </select>
            <button
              className="icon"
              aria-label={`Move ${r.label} up`}
              disabled={i === 0}
              onClick={() => void run(() => api.moveRule(r.id, "up"))}
            >
              ^
            </button>
            <button
              className="icon"
              aria-label={`Move ${r.label} down`}
              disabled={i === settings.rules.length - 1}
              onClick={() => void run(() => api.moveRule(r.id, "down"))}
            >
              v
            </button>
            <button className="icon" aria-label={`Remove rule ${r.label}`} onClick={() => void run(() => api.removeRule(r.id))}>
              x
            </button>
          </div>
        ))}
      </div>
      <button className="primary-action" onClick={() => setPanel(true)}>
        Add app
      </button>

      {panel && (
        <AddAppPanel
          added={new Set(settings.rules.map((r) => r.exe))}
          onPick={(a) => void addApp(a.exe, a.label)}
          onBrowse={() =>
            void run(async () => {
              const picked = await api.pickExe();
              if (picked) await addApp(picked.exe, picked.label);
            })
          }
          onClose={() => setPanel(false)}
        />
      )}
    </section>
  );
}
