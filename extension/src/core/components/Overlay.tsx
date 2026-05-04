import { useCallback, useEffect, useRef } from 'react';
import type { Plugin } from '../../plugins/types';
import { Card, type CardHandle } from './Card';
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
  const cardRef = useRef<CardHandle>(null);
  const labels = plugin.swipeLabels ?? DEFAULT_LABELS;

  const iframe = useIframe({ iframeRef, url: plugin.iframeUrl });
  const queue = useTriageQueue({
    plugin,
    contentDocument: iframe.contentDocument,
    iframeReady: iframe.ready,
  });

  // Latest queue ref so the swipe callbacks below can read current state
  // without re-binding (which would re-render Card and interrupt animations).
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  });

  // Card.onSwipeLeft / onSwipeRight fire AFTER the fly-off animation completes.
  // That's where we mutate the queue.
  const handleSwipeLeft = useCallback(() => {
    void queueRef.current.markCurrentRead();
  }, []);
  const handleSwipeRight = useCallback(() => {
    void queueRef.current.advance();
  }, []);

  // Keyboard / button handlers trigger Card.fling() so they get the same
  // animation as a real drag-swipe.
  const fling = useCallback((dir: 'left' | 'right') => {
    cardRef.current?.fling(dir);
  }, []);

  useKeyboard({
    onLeft: () => fling('left'),
    onRight: () => fling('right'),
    onSkip: () => void queueRef.current.skip(),
    onEscape: onTeardown,
    iframe: iframeRef.current,
    enabled: queue.state === 'ready',
  });

  const cardSize = plugin.cardSize ?? { width: 420, height: 780 };
  const accentStyle = {
    ['--fs-accent' as string]: plugin.theme.accent,
    ['--fs-card-w' as string]: `${cardSize.width}px`,
    ['--fs-card-h' as string]: `${cardSize.height}px`,
  } as React.CSSProperties;

  // Per-item label overrides take precedence over plugin defaults.
  const itemLabels = {
    left: queue.current?.actionLeftLabel ?? labels.left,
    right: queue.current?.actionRightLabel ?? labels.right,
  };
  const showCard = queue.state === 'ready';
  const masked = queue.state === 'loading';

  return (
    <div className="root" style={accentStyle}>
      <div className="backdrop" onClick={onTeardown} />
      <Card
        ref={cardRef}
        itemKey={queue.current?.id ?? 'pending'}
        iframeRef={iframeRef}
        masked={masked}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
        disabled={!showCard}
      />
      {showCard && (
        <>
          <ProgressBadge
            index={queue.index}
            total={queue.items.length}
            totalUnread={queue.totalUnread}
          />
          <Controls
            labels={itemLabels}
            index={queue.index}
            total={queue.items.length}
            hint={queue.current?.actionHint}
            skipLabel={queue.current?.actionSkipLabel}
            onLeft={() => fling('left')}
            onRight={() => fling('right')}
            onClose={onTeardown}
          />
        </>
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
          status={statusFor(plugin.label, iframe.ready, queue.phase)}
          progress={progressFor(iframe.ready, queue.phase)}
        />
      )}
    </div>
  );
}

function statusFor(
  appLabel: string,
  iframeReady: boolean,
  phase: 'waiting-iframe' | 'waiting-app' | 'scraping' | 'opening',
): string {
  if (!iframeReady || phase === 'waiting-iframe') return `Loading ${appLabel}…`;
  if (phase === 'waiting-app') return 'Waiting for app to be ready…';
  if (phase === 'scraping') return 'Finding unread items…';
  return 'Opening first item…';
}

function progressFor(iframeReady: boolean, phase: string): number {
  if (!iframeReady) return 0.25;
  if (phase === 'waiting-app') return 0.55;
  if (phase === 'scraping') return 0.8;
  return 0.95;
}

interface ProgressBadgeProps {
  index: number;
  total: number;
  totalUnread: number | null;
}

/**
 * Prominent counter pill anchored above the card showing triage progress.
 *
 * Two truths shown:
 *  - Position in the loaded batch ("Card X of N").
 *  - Real backlog size when the plugin reports it ("M unread in inbox" — for
 *    Outlook this comes from the folder badge; Teams doesn't expose a reliable
 *    total so this line is omitted).
 *
 * The progress bar reflects position WITHIN the loaded batch (i.e. progress
 * through this triage sitting), not progress through the whole inbox — that
 * would be misleadingly slow for thousands of unread items.
 */
function ProgressBadge({ index, total, totalUnread }: ProgressBadgeProps) {
  const current = Math.min(index + 1, total);
  const pct = total === 0 ? 0 : Math.min(index / total, 1);
  // "Loaded" makes it explicit that N is what fs preloaded, not the total.
  const loadedSuffix = totalUnread != null && totalUnread > total ? ' loaded' : '';
  return (
    <div className="progress-badge" role="status" aria-live="polite">
      <span className="progress-badge-text">
        <b>{current}</b> of {total}
        {loadedSuffix}
      </span>
      <div className="progress-badge-track" aria-hidden>
        <div className="progress-badge-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      {totalUnread != null && totalUnread > total && (
        <span className="progress-badge-sub">{totalUnread.toLocaleString()} unread in inbox</span>
      )}
    </div>
  );
}
