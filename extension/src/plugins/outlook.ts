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
  /**
   * Per-id snapshot of where each row was when it was scraped. `openItem`
   * uses this to scroll back to a row that has been virtualized out of the
   * DOM since scraping (which it always is, because `scrapeUnread` scrolls
   * the list to the end while collecting batches).
   */
  snaps: Map<string, OutlookSnap>;
}

const docState = new WeakMap<Document, DocState>();

const outlook: Plugin = {
  ...outlookMeta,

  async waitForReady(doc: Document): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      // Inbox-zero mode: any conversation row is enough — we no longer
      // require an unread row to be present (some inboxes have only read
      // mail in view).
      if (doc.querySelector('div[role="option"][data-convid]')) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  },

  async scrapeUnread(doc: Document): Promise<UnreadItem[]> {
    // Reset cross-batch state for this document — a fresh scrape starts a
    // brand new triage session.
    const state: DocState = { lastScrollPos: 0, seen: new Set(), snaps: new Map() };
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
      state = { lastScrollPos: 0, seen: new Set(), snaps: new Map() };
      docState.set(doc, state);
    }
    // Merge externally-tracked ids so we don't re-emit anything the queue
    // already holds.
    for (const id of opts.seenIds) state.seen.add(id);
    return collectFrom(doc, state, opts.targetCount ?? PREFETCH_TARGET);
  },

  async openItem(doc: Document, item: UnreadItem): Promise<void> {
    // After `scrapeUnread` scrolls through the list, the row for an early
    // item is almost always virtualized out of the DOM. Use the saved
    // per-row scroll position to bring it back before clicking.
    //
    // Then await selection — Outlook updates `aria-selected` and rebinds its
    // command bar asynchronously after the click. If we don't wait, follow-up
    // actions (the user's swipe-to-archive) can fire against a toolbar still
    // bound to the previous message and archive the wrong thing.
    const snap = docState.get(doc)?.snaps.get(item.id);
    const el = await ensureRow(doc, item, snap?.scrollPos ?? 0);
    el.click();
    await waitForSelection(el, SELECTION_TIMEOUT_MS);
  },

  /**
   * Outlook exposes the inbox total in the folder element's `title`
   * attribute, e.g. `"Inbox - 4,176 items (3,455 unread)"`. We surface the
   * total items count (not the unread count) — for the inbox-zero workflow
   * the user wants to see how big the backlog is overall.
   */
  getInboxTotal(doc: Document): number | null {
    const candidates = doc.querySelectorAll<HTMLElement>('[title*="items" i]');
    for (const el of candidates) {
      const t = el.getAttribute('title') ?? '';
      const m = /([\d,]+)\s+items\b/i.exec(t);
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
    // Inbox-zero mode: snapshot every row, not just unread. Each row is
    // tagged with read-state so per-item action overrides can keep "Keep
    // unread" semantics for unread rows and "Keep" (no-op) for read rows.
    const rows = doc.querySelectorAll<HTMLElement>('div[role="option"][data-convid]');
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

  for (const [id, snap] of newSnapshots.entries()) {
    state.seen.add(id);
    state.snaps.set(id, snap);
  }

  return Array.from(newSnapshots.entries())
    .slice(0, target)
    .map(([id, snap]) => buildItem(id, snap));
}

function buildItem(id: string, snap: OutlookSnap): UnreadItem {
  // Read state is encoded in the aria-label: unread rows start with "Unread ".
  const isUnread = /^unread\b/i.test(snap.label);
  const isMeeting = /\bmeeting\b/i.test(snap.label);
  const kind = isMeeting ? 'meeting' : isUnread ? 'email' : 'email-read';

  const item: UnreadItem = {
    id,
    name: parseName(snap.label),
    kind,
    resolve(d: Document): HTMLElement | null {
      return d.querySelector<HTMLElement>(`div[role="option"][data-convid="${cssEscape(id)}"]`);
    },
  };
  if (kind === 'meeting') {
    item.actionLeftLabel = '✕ Decline';
    item.actionRightLabel = '✓ Accept';
    item.actionSkipLabel = 'Tentative';
    item.actionHint = 'Invite will be archived after Accept/Decline. Skip leaves it Tentative.';
    // Same selection-convergence requirement as the email flow: the global
    // RSVP button binds to whatever Outlook currently considers selected, so
    // we must wait until OUR row is the active selection before clicking it.
    // Otherwise a streak of meeting RSVPs will RSVP the previously-selected
    // (auto-selected after the prior archive) meeting.
    item.actionLeftFn = async (d) => {
      await ensureRowSelected(d, item, snap.scrollPos);
      await rsvp(d, 'decline');
      await archive(d);
    };
    item.actionRightFn = async (d) => {
      await ensureRowSelected(d, item, snap.scrollPos);
      await rsvp(d, 'accept');
      await archive(d);
    };
  } else if (kind === 'email-read') {
    // Already-read email. Inbox-zero workflow: surface it for triage but
    // don't change its read-state on Keep — the user already read it. Left
    // swipe still archives (same selection-convergence flow).
    item.actionRightLabel = '→ Keep';
    item.tag = 'Read';
    item.actionLeftFn = async (d) => {
      await ensureRowSelected(d, item, snap.scrollPos);
      const btn = await waitForToolbarButton(d, /^archive$/i, /\barchive\b/i);
      if (btn) btn.click();
      else dispatchShortcut(d, 'e', 'KeyE');
    };
    // Pure no-op — the queue will advance.
    item.actionRightFn = async () => {};
  } else {
    // Inbox email.
    //
    // Left swipe = Archive. Critical: we must wait until OUR row is the
    // active selection before clicking the toolbar Archive button. Outlook's
    // command bar binds to whatever Outlook currently considers selected,
    // and selection updates asynchronously after a row click. If we click
    // Archive too early we end up archiving the previously-selected message
    // (the one Outlook auto-selected after the previous archive). Symptom:
    // first archive works, second silently archives the wrong message.
    item.actionLeftFn = async (d) => {
      await ensureRowSelected(d, item, snap.scrollPos);
      const btn = await waitForToolbarButton(d, /^archive$/i, /\barchive\b/i);
      if (btn) btn.click();
      else dispatchShortcut(d, 'e', 'KeyE');
    };

    // Right swipe = Keep in inbox, but unread.
    //
    // openItem clicks the row to render it in the iframe — Outlook treats
    // that as "read". To honor "keep unread" we must explicitly mark-unread
    // afterward. Same selection-convergence requirement as Archive.
    item.actionRightFn = async (d) => {
      await ensureRowSelected(d, item, snap.scrollPos);
      const btn = await waitForToolbarButton(d, /^mark as unread$/i, /\bmark.*unread\b/i);
      if (btn) btn.click();
      else dispatchShortcut(d, 'u', 'KeyU', { ctrl: true });
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

async function rsvp(doc: Document, choice: 'accept' | 'decline'): Promise<void> {
  // Caller (`ensureRowSelected`) has already made our row the active
  // selection and let the command bar settle, so the RSVP button we find
  // here is bound to OUR meeting.
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
  // Give the RSVP menu a moment to dismiss before we look for Archive.
  await new Promise((r) => setTimeout(r, 200));
  const btn = await waitForToolbarButton(doc, /^archive$/i, /\barchive\b/i);
  if (btn) {
    btn.click();
    return;
  }
  dispatchShortcut(doc, 'e', 'KeyE');
}

function isSelected(el: HTMLElement): boolean {
  return el.getAttribute('aria-selected') === 'true';
}

const SELECTION_TIMEOUT_MS = 1500;
const SELECTION_POLL_MS = 30;
/** Settle gap after selection converges so Outlook's command bar can rebind to the new row. */
const SELECTION_SETTLE_MS = 120;

/**
 * Resolve the row, ensure it is the actively-selected row in Outlook, and
 * return it. Used by `actionLeftFn` / `actionRightFn` so the toolbar buttons
 * (Archive, Mark as unread) target our row and not whatever Outlook
 * auto-selected after the previous action.
 *
 * Outlook's selection update is asynchronous: a click flips `aria-selected`
 * and rebinds the command bar a frame or two later. We click only when the
 * row isn't already selected (re-clicking a selected row toggles it off),
 * then poll `aria-selected="true"` and add a small settle.
 */
async function ensureRowSelected(
  doc: Document,
  item: UnreadItem,
  scrollPos: number,
): Promise<HTMLElement> {
  const el = await ensureRow(doc, item, scrollPos);
  if (!isSelected(el)) el.click();
  const ok = await waitForSelection(el, SELECTION_TIMEOUT_MS);
  if (!ok) {
    // First click didn't take — try once more before giving up.
    el.click();
    await waitForSelection(el, SELECTION_TIMEOUT_MS / 2);
  }
  await new Promise((r) => setTimeout(r, SELECTION_SETTLE_MS));
  return el;
}

async function waitForSelection(el: HTMLElement, timeoutMs: number): Promise<boolean> {
  if (isSelected(el)) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SELECTION_POLL_MS));
    if (isSelected(el)) return true;
  }
  return false;
}

const TOOLBAR_BUTTON_TIMEOUT_MS = 1500;
const TOOLBAR_BUTTON_POLL_MS = 60;

/**
 * Poll for a visible, enabled toolbar button matching `exact` (preferred) or
 * `loose`. Returns the button or null after the timeout. The selection-driven
 * Outlook command bar can take a beat to (re)render after a row click — this
 * keeps actions reliable across slow renders without inflating the happy-path
 * latency.
 */
async function waitForToolbarButton(
  doc: Document,
  exact: RegExp,
  loose: RegExp,
): Promise<HTMLButtonElement | null> {
  const find = (): HTMLButtonElement | null => {
    const candidates = Array.from(doc.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
    const visible = candidates.filter((b) => {
      const label = b.getAttribute('aria-label') ?? '';
      if (b.getAttribute('aria-disabled') === 'true' || b.disabled) return false;
      if ((b as HTMLElement).offsetParent === null) return false;
      return exact.test(label) || loose.test(label);
    });
    const exactMatch = visible.find((b) => exact.test(b.getAttribute('aria-label') ?? ''));
    return exactMatch ?? visible[0] ?? null;
  };
  let found = find();
  if (found) return found;
  const deadline = Date.now() + TOOLBAR_BUTTON_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, TOOLBAR_BUTTON_POLL_MS));
    found = find();
    if (found) return found;
  }
  return null;
}

interface ShortcutModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/**
 * Dispatch a keyboard shortcut. Targets `document.activeElement` when present
 * (Outlook's keyboard shortcuts listen on the focused message pane), falling
 * back to `defaultView` and finally `doc` itself. Includes both `key` and
 * `code` so apps that match on either form pick it up.
 */
function dispatchShortcut(
  doc: Document,
  key: string,
  code: string,
  mods: ShortcutModifiers = {},
): void {
  const init: KeyboardEventInit = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: !!mods.meta,
  };
  const targets: EventTarget[] = [];
  const active = doc.activeElement;
  if (active && active !== doc.body) targets.push(active);
  const view = doc.defaultView;
  if (view) targets.push(view);
  targets.push(doc);
  if (doc.body) targets.push(doc.body);
  for (const t of targets) {
    try {
      t.dispatchEvent(new KeyboardEvent('keydown', init));
      t.dispatchEvent(new KeyboardEvent('keyup', init));
    } catch {
      // Some targets (e.g. Window in jsdom) may reject KeyboardEvent — keep going.
    }
  }
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
  // Read-row format: "From <sender>, Subject: <subject>, Received: <when>".
  // Parse it cleanly into "<sender> — <subject>" so the card stays scannable.
  const read = /^From\s+(.+?),\s*Subject:\s*(.+?),\s*Received:/i.exec(label);
  if (read && read[1] && read[2]) {
    const merged = `${read[1].trim()} — ${read[2].trim()}`;
    return merged.length > 140 ? merged.slice(0, 137) + '…' : merged;
  }

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
