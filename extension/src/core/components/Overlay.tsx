import { useCallback, useRef } from 'react';
import type { Plugin } from '../../plugins/types';
import { Card } from './Card';
import { Controls } from './Controls';
import { LoadingState } from './states/LoadingState';
import { ErrorState } from './states/ErrorState';
import { DoneState } from './states/DoneState';
import { useIframe } from '../hooks/useIframe';
import { useTriageQueue } from '../hooks/useTriageQueue';
import { useKeyboard } from '../hooks/useKeyboard';

export interface OverlayProps {
  plugin: Plugin;
  onTeardown: () => void;
}

const DEFAULT_LABELS = { left: '← Mark Read', right: 'Keep →' };

export function Overlay({ plugin, onTeardown }: OverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const labels = plugin.swipeLabels ?? DEFAULT_LABELS;

  const iframe = useIframe({ iframeRef, url: plugin.iframeUrl });
  const queue = useTriageQueue({
    plugin,
    contentDocument: iframe.contentDocument,
    iframeReady: iframe.ready,
  });

  useKeyboard({
    onLeft: () => void queue.markCurrentRead(),
    onRight: () => void queue.advance(),
    onEscape: onTeardown,
    iframe: iframeRef.current,
    enabled: queue.state === 'ready',
  });

  const handleLeft = useCallback(() => void queue.markCurrentRead(), [queue]);
  const handleRight = useCallback(() => void queue.advance(), [queue]);

  const accentStyle = { ['--fs-accent' as string]: plugin.theme.accent } as React.CSSProperties;
  const showCard = queue.state === 'ready';
  const masked = queue.state === 'loading';

  return (
    <div className="root" style={accentStyle}>
      <div className="backdrop" onClick={onTeardown} />
      <Card
        itemKey={queue.current?.id ?? 'pending'}
        iframeRef={iframeRef}
        masked={masked}
        onSwipeLeft={handleLeft}
        onSwipeRight={handleRight}
        disabled={!showCard}
      />
      {showCard && (
        <Controls
          labels={labels}
          index={queue.index}
          total={queue.items.length}
          onLeft={handleLeft}
          onRight={handleRight}
          onClose={onTeardown}
        />
      )}
      {(iframe.error || queue.state === 'error') && (
        <ErrorState
          error={iframe.error ?? queue.error ?? new Error('Unknown error')}
          onRetry={() => {
            iframe.retry();
            queue.reload();
          }}
          onClose={onTeardown}
        />
      )}
      {queue.state === 'empty' && (
        <ErrorState error={new Error('No unread items found.')} onClose={onTeardown} />
      )}
      {queue.state === 'done' && <DoneState count={queue.items.length} onClose={onTeardown} />}
      {(queue.state === 'loading' || !iframe.ready) && (
        <LoadingState
          label={plugin.label}
          status={!iframe.ready ? `Connecting to ${plugin.label}…` : 'Finding unread items…'}
        />
      )}
    </div>
  );
}
