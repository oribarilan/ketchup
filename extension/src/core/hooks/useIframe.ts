import { useEffect, useState } from 'react';

export interface IframeState {
  ready: boolean;
  error: Error | null;
  contentDocument: Document | null;
  retry: () => void;
}

export interface IframeOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  url: string;
  /** Total time budget for waiting same-origin access. */
  timeoutMs?: number;
  /** Poll interval while waiting. */
  pollMs?: number;
}

/**
 * Manages the in-card iframe's load + same-origin readiness.
 *
 * Flow:
 *   1. Set `iframe.src = url`.
 *   2. Wait for the `load` event (fires AFTER navigation completes — without
 *      this gate we'd grab `about:blank`'s document, which has no body).
 *   3. Read `iframe.contentDocument`. If access throws (cross-origin auth
 *      redirect mid-load), poll briefly until the iframe settles back on the
 *      target origin.
 *   4. Verify the document is on the expected origin (defends against the rare
 *      case where load fires for a non-target URL like an SSO landing page).
 */
export function useIframe({
  iframeRef,
  url,
  timeoutMs = 30_000,
  pollMs = 250,
}: IframeOptions): IframeState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    setDoc(null);

    const iframe = iframeRef.current;
    if (!iframe) return;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const targetHost = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    })();

    function tryReady() {
      if (cancelled || settled) return;
      try {
        const d = iframe!.contentDocument || iframe!.contentWindow?.document || null;
        if (d && d.body && d.location && d.location.href !== 'about:blank') {
          // Verify we landed on the target host (or a subdomain). If we're
          // mid-redirect through SSO, keep polling until the final hop.
          const host = (() => {
            try {
              return new URL(d.location.href).hostname;
            } catch {
              return null;
            }
          })();
          if (
            !targetHost ||
            !host ||
            host === targetHost ||
            host.endsWith('.' + targetHost) ||
            targetHost.endsWith('.' + host)
          ) {
            settled = true;
            if (deadlineTimer) clearTimeout(deadlineTimer);
            setDoc(d);
            setReady(true);
            return;
          }
        }
      } catch {
        // Cross-origin during redirect — keep polling.
      }
      pollTimer = setTimeout(tryReady, pollMs);
    }

    function onLoad() {
      // Once load fires, the navigation completed. Start the readiness check.
      tryReady();
    }

    iframe.addEventListener('load', onLoad);

    deadlineTimer = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setError(new Error('Could not access app iframe within time budget.'));
    }, timeoutMs);

    try {
      iframe.src = url;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }

    return () => {
      cancelled = true;
      iframe.removeEventListener('load', onLoad);
      if (pollTimer) clearTimeout(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [iframeRef, url, attempt, timeoutMs, pollMs]);

  return {
    ready,
    error,
    contentDocument: doc,
    retry: () => setAttempt((n) => n + 1),
  };
}
