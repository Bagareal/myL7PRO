import { useState } from "react";
import { PROFILE_NAME_MAX } from "../../core/protocol.js";
import type { Snapshot } from "../../shared/api.js";
import { cleanError } from "../errors.js";

export function profileLabel(snap: Snapshot, slot: number): string {
  return snap.profileNames?.[slot] ?? `Profile ${slot + 1}`;
}

/** Nome del profilo aperto (chi lo usa lo rimonta con key={slot}, cosi' la modifica in corso non resta sul profilo sbagliato) con Rename (campo inline: Invio salva, Esc annulla) ed etichetta del profilo attivo. */
export function ProfileHeader({ snap, slot }: { snap: Snapshot; slot: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = snap.connection === "connesso";
  const name = profileLabel(snap, slot);

  async function save() {
    if (editing === null) return;
    setError(null);
    try {
      await window.l7.renameProfile(slot, editing);
      setEditing(null);
    } catch (e) {
      setError(cleanError(e));
    }
  }

  return (
    <div className="profile-header">
      <div className="profile-title">
        {editing === null ? (
          <h2>{name}</h2>
        ) : (
          <input
            aria-label="Profile name"
            autoFocus
            maxLength={PROFILE_NAME_MAX}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setEditing(null);
                setError(null);
              }
            }}
          />
        )}
        {snap.state?.profile === slot && <span className="badge">Active on mouse</span>}
        <button disabled={!connected || editing !== null} onClick={() => setEditing(name)}>
          Rename
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
