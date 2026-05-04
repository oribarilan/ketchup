import type { Plugin, UnreadItem } from './types';
import { ItemDetachedError } from './types';
import outlookMeta from './outlook.meta';

/**
 * Outlook (Office 365 / outlook.cloud.microsoft Web) plugin behavior.
 *
 * Selector strategy (validated against live DOM 2026-05):
 *  - Each row in the message list is a `div[role="option"]` with an
 *    `aria-label` starting with "Unread …" and a `data-convid` attribute.
 *  - Rows whose aria-label contains "Meeting" are treated as calendar invites
 *    and get RSVP semantics (Accept / Decline) overriding the inbox defaults
 *    (Archive / Keep).
 *  - Use `data-convid` as the stable id; aria-label gives the friendly name.
 *
 * Virtualization handling:
 *  - Outlook's message list is virtualized — only ~10 rows live in the DOM at
 *    a time, and scrolling RECYCLES rows (no accumulation). We collect a
 *    larger batch by scrolling progressively and snapshotting each visible
 *    set into a Map keyed by `data-convid`. Each snapshot stores the
 *    `scrollTop` at which the row was seen, so actions can scroll back.
 *  - `resolve(doc)` first tries the current DOM; per-item action overrides
 *    use `ensureRow` which scrolls back to the snapshot position if needed.
 *  - `fetchMore` resumes from the scroll position where the last batch ended,
 *    so the user can keep swiping through a multi-thousand-item inbox.
 *
 * Actions:
 *  - Inbox emails: actionLeftFn = archive (E shortcut). actionRight = no-op.
 *  - Calendar invites: actionLeftFn = decline. actionRightFn = accept.
 *    Both archive afterwards.
 */

const PREFETCH_TARGET = 50;
const PREFETCH_TIMEOUT_MS = 12_000;
const SCROLL_SETTLE_MS = 400;

interface OutlookSnap {
  label: string;
  scrollPos: number;
}

interface DocState {
  /** Where the scroller ended after the last batch — fetchMore resumes here. */
  lastScrollPos: number;
  /** All ids ever surfaced for this document — kept for cross-batch dedupe. */
  seen: Set<string>;
}

const docState = new WeakMap<Document, DocState>();

const outlook: Plugin = {
  ...outlookMeta,

  async waitForReady(doc: Document): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (
        doc.querySelector('div[role="option"][data-convid]') ||
        doc.querySelector('div[role="option"][aria-label^="Unread" i]')
      ) {
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  },

  async scrapeUnread(doc: Document): Promise<UnreadItem[]> {
    // Reset cross-batch state for this document — a fresh scrape starts a
    // brand new triage session.
    const state: DocState = { lastScrollPos: 0, seen: new Set() };
    docState.set(doc, state);
    const sc = findScroller(doc);
    if (sc) sc.scrollTop = 0;
    return collectFrom(doc, state, PREFETCH_TARGET);
  },

  async fetchMore(
    doc: Document,
    opts: { seenIds: ReadonlySet<string>; targetCount?: number },
  ): Promise<UnreadItem[]> {
    let state = docState.get(doc);
    if (!state) {
      state = { lastScrollPos: 0, seen: new Set() };
      docState.set(doc, state);
    }
    // Merge externally-tracked ids so we don't re-emit anything the queue
    // already holds.
    for (const id of opts.seenIds) state.seen.add(id);
    return collectFrom(doc, state, opts.targetCount ?? PREFETCH_TARGET);
  },

  async openItem(doc: Document, item: UnreadItem): Promise<void> {
    const el = item.resolve(doc);
    if (!el) throw new ItemDetachedError(item.id);
    el.click();
  },

  /**
   * Outlook exposes the inbox unread count in the folder element's `title`
   * attribute, e.g. `"Inbox - 4,176 items (3,455 unread)"`. Parse it.
   */
  getTotalUnread(doc: Document): number | null {
    const candidates = doc.querySelectorAll<HTMLElement>('[title*="unread" i]');
    for (const el of candidates) {
      const t = el.getAttribute('title') ?? '';
      const m = /\(([\d,]+)\s+unread\)/i.exec(t);
      if (m && m[1]) {
        const n = Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  },
};

/**
 * Scroll-and-collect up to `target` new unread snapshots. Resumes from
 * `state.lastScrollPos`. Updates state in place when done.
 */
async function collectFrom(doc: Document, state: DocState, target: number): Promise<UnreadItem[]> {
  const sc = findScroller(doc);
  const newSnapshots = new Map<string, OutlookSnap>();

  // Resume scroll position.
  if (sc) {
    sc.scrollTop = state.lastScrollPos;
    await new Promise((r) => setTimeout(r, 200));
  }

  function snapshotVisible() {
    const rows = doc.querySelectorAll<HTMLElement>('div[role="option"][aria-label^="Unread" i]');
    rows.forEach((row) => {
      const id = row.getAttribute('data-convid');
      if (!id || state.seen.has(id) || newSnapshots.has(id)) return;
      newSnapshots.set(id, {
        label: row.getAttribute('aria-label') ?? '',
        scrollPos: sc?.scrollTop ?? 0,
      });
    });
  }

  snapshotVisible();
  if (sc) {
    const deadline = Date.now() + PREFETCH_TIMEOUT_MS;
    let lastTop = -1;
    while (newSnapshots.size < target && Date.now() < deadline) {
      if (sc.scrollTop === lastTop) break;
      lastTop = sc.scrollTop;
      sc.scrollTop = sc.scrollTop + sc.clientHeight * 0.8;
      await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
      snapshotVisible();
    }
    state.lastScrollPos = sc.scrollTop;
  }

  for (const id of newSnapshots.keys()) state.seen.add(id);

  return Array.from(newSnapshots.entries())
    .slice(0, target)
    .map(([id, snap]) => buildItem(id, snap));
}

function buildItem(id: string, snap: OutlookSnap): UnreadItem {
  const item: UnreadItem = {
    id,
    name: parseName(snap.label),
    kind: /\bmeeting\b/i.test(snap.label) ? 'meeting' : 'email',
    resolve(d: Document): HTMLElement | null {
      return d.querySelector<HTMLElement>(`div[role="option"][data-convid="${cssEscape(id)}"]`);
    },
  };
  if (item.kind === 'meeting') {
    item.actionLeftLabel = '✕ Decline';
    item.actionRightLabel = '✓ Accept';
    item.actionSkipLabel = 'Tentative';
    item.actionHint = 'Invite will be archived after Accept/Decline. Skip leaves it Tentative.';
    item.actionLeftFn = async (d) => {
      const el = await ensureRow(d, item, snap.scrollPos);
      await rsvp(d, el, 'decline');
      await archive(d);
    };
    item.actionRightFn = async (d) => {
      const el = await ensureRow(d, item, snap.scrollPos);
      await rsvp(d, el, 'accept');
      await archive(d);
    };
  } else {
    item.actionLeftFn = async (d) => {
      const el = await ensureRow(d, item, snap.scrollPos);
      el.click();
      await new Promise((r) => setTimeout(r, 120));
      d.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
    };
  }
  return item;
}

function findScroller(doc: Document): HTMLElement | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('.customScrollBar'));
  for (const el of candidates) {
    if (el.scrollHeight > el.clientHeight + 20 && el.querySelector('[data-convid]')) {
      return el;
    }
  }
  return null;
}

async function ensureRow(doc: Document, item: UnreadItem, scrollPos: number): Promise<HTMLElement> {
  let el = item.resolve(doc);
  if (el) return el;
  const sc = findScroller(doc);
  if (sc) {
    sc.scrollTop = scrollPos;
    await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
    el = item.resolve(doc);
  }
  if (!el) throw new ItemDetachedError(item.id);
  return el;
}

async function rsvp(
  doc: Document,
  rowEl: HTMLElement,
  choice: 'accept' | 'decline',
): Promise<void> {
  rowEl.click();
  const targetAria = choice === 'accept' ? /^accept the meeting$/i : /^decline the meeting$/i;

  const rsvpBtn = await waitForElement<HTMLButtonElement>(() => {
    const btns = Array.from(doc.querySelectorAll('button'));
    return (
      btns.find(
        (b) => (b.textContent ?? '').trim() === 'RSVP' && (b as HTMLElement).offsetParent !== null,
      ) ?? null
    );
  });
  if (!rsvpBtn) throw new Error('RSVP button not found');
  rsvpBtn.click();

  const menuItem = await waitForElement<HTMLElement>(() => {
    const items = Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    return items.find((m) => targetAria.test(m.getAttribute('aria-label') ?? '')) ?? null;
  });
  if (!menuItem) throw new Error(`RSVP menu item for "${choice}" not found`);
  menuItem.click();
}

async function waitForElement<T>(
  finder: () => T | null,
  timeoutMs = 4_000,
  pollMs = 100,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = finder();
    if (found) return found;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

async function archive(doc: Document): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
}

const NOISE = [
  /^Meeting\s+/i,
  /^Collapsed\s+/i,
  /^Marked as (low|high|normal) priority by Copilot\s+/i,
  /^Marked as important\s+/i,
  /^Has attachments?\s+/i,
  /^start time [^,]+,?\s*/i,
];

function parseName(label: string): string {
  let s = label.replace(/^Unread\s+/i, '');
  for (const re of NOISE) s = s.replace(re, '');
  const m = /\s\d{1,2}:\d{2}(?:\s|$)/.exec(s);
  if (m) s = s.slice(0, m.index);
  const m2 = /\s\d{1,2}\/\d{1,2}(?:\s|$)/.exec(s);
  if (m2 && !m) s = s.slice(0, m2.index);
  s = s.trim();
  return s.length > 140 ? s.slice(0, 137) + '…' : s || label;
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}

export default outlook;
