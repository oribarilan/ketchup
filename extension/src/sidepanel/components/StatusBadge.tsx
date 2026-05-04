import type { TabStatus } from '../../shared/messages';

interface StatusBadgeProps {
  status: TabStatus | undefined;
  loading: boolean;
}

export function StatusBadge({ status, loading }: StatusBadgeProps) {
  if (loading) return <span className="badge badge-loading">Loading…</span>;
  if (status?.tabId != null) return <span className="badge badge-open">Tab open</span>;
  return <span className="badge badge-none">No tab</span>;
}
