interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
  onClose: () => void;
}

export function ErrorState({ error, onRetry, onClose }: ErrorStateProps) {
  return (
    <div className="error-overlay" role="alert">
      <div className="error-emoji">⚠️</div>
      <div className="error-msg">{error.message}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {onRetry && (
          <button className="retry-btn" onClick={onRetry}>
            Retry
          </button>
        )}
        <button className="done-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
