interface DoneStateProps {
  count: number;
  onClose: () => void;
}

export function DoneState({ count, onClose }: DoneStateProps) {
  return (
    <div className="done-overlay">
      <div className="done-emoji">🎉</div>
      <div className="done-title">All caught up!</div>
      <div className="done-sub">Triaged {count} items</div>
      <button className="done-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
