interface LoadingStateProps {
  label: string;
  status?: string;
  /** 0..1, drives the indeterminate progress fill. Optional. */
  progress?: number;
}

export function LoadingState({ label, status, progress }: LoadingStateProps) {
  return (
    <div className="progress-loader">
      <div className="progress-logo">✦ fs</div>
      <div className="spinner" />
      <div className="progress-status">{status ?? `Connecting to ${label}…`}</div>
      <div className="progress-bar" aria-hidden>
        <div
          className="progress-bar-fill"
          style={{ width: progress != null ? `${Math.round(progress * 100)}%` : undefined }}
        />
      </div>
    </div>
  );
}
