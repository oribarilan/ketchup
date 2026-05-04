interface ControlsProps {
  labels: { left: string; right: string };
  index: number;
  total: number;
  hint?: string | undefined;
  skipLabel?: string | undefined;
  onLeft: () => void;
  onRight: () => void;
  onClose: () => void;
}

function modKey(): string {
  const isMac =
    (navigator as unknown as { platform?: string }).platform?.includes('Mac') ||
    navigator.userAgent.includes('Mac');
  return isMac ? '⌘' : 'Ctrl';
}

export function Controls({
  labels,
  index,
  total,
  hint,
  skipLabel,
  onLeft,
  onRight,
  onClose,
}: ControlsProps) {
  const mod = modKey();
  return (
    <>
      {hint && <div className="action-hint">{hint}</div>}
      <div className="top-bar">
        <div className="logo">✦ fs</div>
        <div className="cnt">
          <b>{Math.min(index + 1, total)}</b> / {total}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="bottom-bar">
        <div className="bottom-bar-row">
          <button className="btn btn-read" onClick={onLeft}>
            <span className="btn-label">{labels.left}</span>
            <kbd className="keycap">{mod}</kbd>
            <kbd className="keycap">←</kbd>
          </button>
          <button className="btn btn-keep" onClick={onRight}>
            <span className="btn-label">{labels.right}</span>
            <kbd className="keycap">{mod}</kbd>
            <kbd className="keycap">→</kbd>
          </button>
          <button className="btn btn-esc" onClick={onClose} aria-label="Close (Esc)">
            <kbd className="keycap">Esc</kbd>
          </button>
        </div>
        {skipLabel && (
          <div className="skip-hint">
            <kbd className="keycap">{mod}</kbd>
            <kbd className="keycap">↓</kbd>
            <span>{skipLabel}</span>
          </div>
        )}
      </div>
    </>
  );
}
