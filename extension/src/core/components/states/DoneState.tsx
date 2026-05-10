interface DoneStateProps {
  count: number;
  onClose: () => void;
  onReload: () => void;
}

export function DoneState({ count, onClose, onReload }: DoneStateProps) {
  return (
    <div className="done-overlay">
      <div className="done-emoji">🎉</div>
      <div className="done-title">All caught up!</div>
      <div className="done-sub">Triaged {count} items</div>
      <div className="done-actions">
        <button className="done-btn" onClick={onReload}>
          ↻ Restart from top
        </button>
        <button className="done-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
