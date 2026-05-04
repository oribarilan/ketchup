interface LoadingStateProps {
  label: string;
  status?: string;
}

export function LoadingState({ label, status }: LoadingStateProps) {
  return (
    <div className="progress-loader">
      <div className="progress-logo">✦ fs</div>
      <div className="spinner" />
      <div className="progress-status">{status ?? `Connecting to ${label}…`}</div>
    </div>
  );
}
