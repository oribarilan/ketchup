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
  /** Plugin-reported total backlog size if available (e.g. Outlook folder badge). */
  inboxTotal: number | null;
  /**
   * True while `plugin.openItem` is in flight (initial load + every advance /
   * markRead). The overlay uses this to mask the iframe so the user never sees
   * the inbox-list → message transition that openItem causes inside the app.
   */
  opening: boolean;
  /** Mark current as read (fires plugin.markRead) then advance. */
  markCurrentRead(): Promise<void>;
  /** Skip current (no markRead) and advance. */
  advance(): Promise<void>;
  /** Skip current with no plugin action — just move to the next item. */
  skip(): Promise<void>;
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
  const [inboxTotal, setInboxTotal] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [opening, setOpening] = useState(false);
  const inFlight = useRef(false);

  // Centralized openItem wrapper that flips the `opening` flag so the UI can
  // mask the iframe through the click → in-app navigation transition. Catches
  // ItemDetachedError silently (queue advances), warns on others.
  const openWithMask = useCallback(
    async (doc: Document, target: UnreadItem) => {
      setOpening(true);
      try {
        await plugin.openItem?.(doc, target);
      } catch (e) {
        if (!(e instanceof ItemDetachedError)) {
          console.warn('ketchup: openItem failed', e);
        }
      } finally {
        setOpening(false);
      }
    },
    [plugin],
  );

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
        const scraped = await Promise.resolve(plugin.scrapeUnread(contentDocument));
        if (cancelled) return;
        setItems(scraped);
        setIndex(0);
        try {
          setInboxTotal(plugin.getInboxTotal?.(contentDocument) ?? null);
        } catch (e) {
          console.warn('ketchup: getInboxTotal failed', e);
        }
        if (scraped.length === 0) {
          setState('empty');
        } else {
          setPhase('opening');
          setState('ready');
          await openWithMask(contentDocument, scraped[0]!);
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
  }, [plugin, contentDocument, iframeReady, reloadKey, openWithMask]);

  const fetching = useRef(false);

  const fetchNext = useCallback(async (): Promise<UnreadItem[]> => {
    if (!plugin.fetchMore || !contentDocument) return [];
    if (fetching.current) return [];
    fetching.current = true;
    try {
      const seenIds = new Set(items.map((i) => i.id));
      const more = await Promise.resolve(plugin.fetchMore(contentDocument, { seenIds }));
      if (more.length > 0) {
        setItems((prev) => [...prev, ...more]);
      }
      return more;
    } catch (e) {
      console.warn('ketchup: fetchMore failed', e);
      return [];
    } finally {
      fetching.current = false;
    }
  }, [plugin, contentDocument, items]);

  // Pre-fetch the next batch as soon as the user is within 5 items of the end.
  // Runs in the background; the user keeps swiping and new items land in the
  // queue before they hit "done".
  useEffect(() => {
    if (state !== 'ready') return;
    if (!plugin.fetchMore) return;
    const remaining = items.length - index;
    if (remaining > 5) return;
    void fetchNext();
  }, [state, items.length, index, plugin, fetchNext]);

  const advanceTo = useCallback(
    async (next: number) => {
      if (next >= items.length) {
        // Last-ditch fetch before declaring done — the user may have raced
        // ahead of the background pre-fetch.
        if (plugin.fetchMore) {
          setState('loading');
          setPhase('scraping');
          const more = await fetchNext();
          if (more.length > 0) {
            setIndex(next);
            setState('ready');
            if (contentDocument && more[0]) {
              await openWithMask(contentDocument, more[0]);
            }
            return;
          }
        }
        setIndex(items.length);
        setState('done');
        return;
      }
      setIndex(next);
      const target = items[next];
      if (target && contentDocument) {
        await openWithMask(contentDocument, target);
      }
    },
    [items, contentDocument, plugin, fetchNext, openWithMask],
  );

  const markCurrentRead = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const cur = items[index];
      if (cur && contentDocument) {
        const fn = cur.actionLeftFn
          ? () => cur.actionLeftFn!(contentDocument)
          : plugin.actionLeft
            ? () => plugin.actionLeft!(contentDocument, cur)
            : null;
        if (fn) {
          try {
            await fn();
          } catch (e) {
            if (!(e instanceof ItemDetachedError)) {
              console.warn('ketchup: actionLeft failed', e);
            }
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
      const cur = items[index];
      if (cur && contentDocument) {
        const fn = cur.actionRightFn
          ? () => cur.actionRightFn!(contentDocument)
          : plugin.actionRight
            ? () => plugin.actionRight!(contentDocument, cur)
            : null;
        if (fn) {
          try {
            await fn();
          } catch (e) {
            if (!(e instanceof ItemDetachedError)) {
              console.warn('ketchup: actionRight failed', e);
            }
          }
        }
      }
      await advanceTo(index + 1);
    } finally {
      inFlight.current = false;
    }
  }, [advanceTo, items, index, contentDocument, plugin]);

  return {
    state,
    phase,
    items,
    index,
    current: items[index] ?? null,
    error,
    inboxTotal,
    opening,
    markCurrentRead,
    advance,
    skip: async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await advanceTo(index + 1);
      } finally {
        inFlight.current = false;
      }
    },
    reload: () => setReloadKey((k) => k + 1),
  };
}
