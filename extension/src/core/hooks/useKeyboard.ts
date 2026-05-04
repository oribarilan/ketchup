import { useEffect } from 'react';

export interface KeyboardOptions {
  onLeft: () => void;
  onRight: () => void;
  onEscape: () => void;
  /** Optional iframe whose contentDocument should also receive listeners. */
  iframe?: HTMLIFrameElement | null;
  enabled?: boolean;
}

function classify(e: KeyboardEvent): 'left' | 'right' | 'escape' | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'ArrowLeft') return 'left';
  if (mod && e.key === 'ArrowRight') return 'right';
  if (e.key === 'Escape') return 'escape';
  const inInput = (e.target as Element | null)?.closest?.(
    'input, textarea, [contenteditable], [role="textbox"]',
  );
  if (!inInput) {
    if (e.key === 'ArrowLeft' || e.key === 'h') return 'left';
    if (e.key === 'ArrowRight' || e.key === 'l') return 'right';
  }
  return null;
}

/**
 * Registers keydown listeners on `window` and (best-effort) on the same-origin
 * iframe's `contentDocument`, so hotkeys work regardless of focus location.
 */
export function useKeyboard(opts: KeyboardOptions): void {
  const { onLeft, onRight, onEscape, iframe, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const action = classify(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (action === 'left') onLeft();
      else if (action === 'right') onRight();
      else onEscape();
    };
    document.addEventListener('keydown', handler, true);
    let iframeDoc: Document | null = null;
    try {
      iframeDoc = iframe?.contentDocument ?? iframe?.contentWindow?.document ?? null;
      iframeDoc?.addEventListener('keydown', handler, true);
    } catch {
      /* cross-origin */
    }
    return () => {
      document.removeEventListener('keydown', handler, true);
      try {
        iframeDoc?.removeEventListener('keydown', handler, true);
      } catch {
        /* ignore */
      }
    };
  }, [enabled, iframe, onLeft, onRight, onEscape]);
}
