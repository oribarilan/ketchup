import { useState } from 'react';
import type { PluginMetadata } from '../../plugins/types';
import type { TabStatus } from '../../shared/messages';
import { sendMessage } from '../../shared/messages';
import { StatusBadge } from './StatusBadge';

interface AppTileProps {
  metadata: PluginMetadata;
  status: TabStatus | undefined;
  loading: boolean;
}

export function AppTile({ metadata, status, loading }: AppTileProps) {
  const [pending, setPending] = useState(false);
  const iconUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(metadata.iconPath)
      : metadata.iconPath;

  async function handleOpen() {
    if (pending) return;
    setPending(true);
    try {
      await sendMessage<'OPEN_AND_TOGGLE'>({ type: 'OPEN_AND_TOGGLE', pluginId: metadata.id });
    } catch (e) {
      console.error('ketchup: OPEN_AND_TOGGLE failed', e);
    } finally {
      setPending(false);
    }
  }

  const tileStyle = metadata.theme.tileBg
    ? ({ ['--tile-bg' as string]: metadata.theme.tileBg } as React.CSSProperties)
    : undefined;

  return (
    <li className="tile" style={tileStyle}>
      <img src={iconUrl} alt="" className="tile-icon" />
      <div className="tile-meta">
        <div className="tile-label">{metadata.label}</div>
        <StatusBadge status={status} loading={loading} />
      </div>
      <button
        className="tile-open"
        onClick={handleOpen}
        disabled={pending || loading}
        aria-label={`Open ${metadata.label}`}
      >
        {pending ? 'Opening…' : 'Open'}
      </button>
    </li>
  );
}
