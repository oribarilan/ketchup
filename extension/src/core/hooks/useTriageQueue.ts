import { useCallback, useEffect, useRef, useState } from 'react';
import type { Plugin, UnreadItem } from '../../plugins/types';
import { ItemDetachedError } from '../../plugins/types';

export type QueueState = 'loading' | 'ready' | 'done' | 'error' | 'empty';

/** Granular phase shown in the loading UI. */
export type LoadingPhase = 'waiting-iframe' | 'waiting-app' | 'scraping' | 'opening';

export interface TriageQueue {
  state: QueueState;
  phase: LoadingPhase;
  items: readonly UnreadItem[];
  index: number;
  current: UnreadItem | null;
  error: Error | null;
  /** Mark current as read (fires plugin.markRead) then advance. */
  markCurrentRead(): Promise<void>;
  /** Skip current (no markRead) and advance. */
  advance(): Promise<void>;
  /** Force a fresh scrape. */
  reload(): void;
}

export interface QueueOptions {
  plugin: Plugin;
  contentDocument: Document | null;
  /** Set true once the iframe is loaded and `waitForReady` should run. */
  iframeReady: boolean;
}

/**
 * Queue state machine over `plugin.scrapeUnread`. Runs scrape exactly once per
 * (plugin, iframeReady) cycle. Re-resolves items before each plugin action and
 * skips silently past detached items.
 */
export function useTriageQueue(opts: QueueOptions): TriageQueue {
  const { plugin, contentDocument, iframeReady } = opts;
  const [state, setState] = useState<QueueState>('loading');
  const [phase, setPhase] = useState<LoadingPhase>('waiting-iframe');
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!iframeReady || !contentDocument) {
      setPhase('waiting-iframe');
      return;
    }
    let cancelled = false;
    setState('loading');
    setPhase('waiting-app');
    setError(null);
    (async () => {
      try {
        await plugin.waitForReady(contentDocument);
        if (cancelled) return;
        setPhase('scraping');
        const scraped = plugin.scrapeUnread(contentDocument);
        if (cancelled) return;
        setItems(scraped);
        setIndex(0);
        if (scraped.length === 0) {
          setState('empty');
        } else {
          setPhase('opening');
          setState('ready');
          try {
            await plugin.openItem?.(contentDocument, scraped[0]!);
          } catch (e) {
            if (!(e instanceof ItemDetachedError)) {
              console.warn('fs: openItem failed', e);
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plugin, contentDocument, iframeReady, reloadKey]);

  const advanceTo = useCallback(
    async (next: number) => {
      if (next >= items.length) {
        setIndex(items.length);
        setState('done');
        return;
      }
      setIndex(next);
      const target = items[next];
      if (target && contentDocument) {
        try {
          await plugin.openItem?.(contentDocument, target);
        } catch (e) {
          if (!(e instanceof ItemDetachedError)) {
            console.warn('fs: openItem failed', e);
          }
        }
      }
    },
    [items, contentDocument, plugin],
  );

  const markCurrentRead = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const cur = items[index];
      if (cur && contentDocument && plugin.markRead) {
        try {
          await plugin.markRead(contentDocument, cur);
        } catch (e) {
          if (!(e instanceof ItemDetachedError)) {
            console.warn('fs: markRead failed', e);
          }
        }
      }
      await advanceTo(index + 1);
    } finally {
      inFlight.current = false;
    }
  }, [items, index, contentDocument, plugin, advanceTo]);

  const advance = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await advanceTo(index + 1);
    } finally {
      inFlight.current = false;
    }
  }, [advanceTo, index]);

  return {
    state,
    phase,
    items,
    index,
    current: items[index] ?? null,
    error,
    markCurrentRead,
    advance,
    reload: () => setReloadKey((k) => k + 1),
  };
}
