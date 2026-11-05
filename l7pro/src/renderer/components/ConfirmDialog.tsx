interface Props {
  title: string;
  lines: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, lines, onConfirm, onCancel }: Props) {
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <div className="actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
