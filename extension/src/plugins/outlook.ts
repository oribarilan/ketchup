import type { Plugin, UnreadItem } from './types';
import { ItemDetachedError } from './types';
import outlookMeta from './outlook.meta';

/**
 * Outlook (Office 365 / outlook.cloud.microsoft Web) plugin behavior.
 *
 * Selector strategy (validated against live DOM 2026-05):
 *  - Each row in the message list is a `div[role="option"]` with both an
 *    `aria-label` starting with "Unread …" and a `data-convid` attribute.
 *  - Use `data-convid` as the stable id; aria-label gives us a friendly name.
 *  - The label looks like "Unread [modifiers] [Sender] [Subject] [HH:MM] [preview]".
 *    We strip the leading "Unread", drop common modifier phrases, and take the
 *    text up to the first time pattern as the friendly name.
 *  - Mark-read uses Outlook's keyboard `Q` shortcut.
 */
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

  scrapeUnread(doc: Document): UnreadItem[] {
    const rows = doc.querySelectorAll<HTMLElement>('div[role="option"][aria-label^="Unread" i]');
    const result: UnreadItem[] = [];
    const seen = new Set<string>();
    rows.forEach((row) => {
      if (result.length >= 50) return;
      const id = row.getAttribute('data-convid') ?? row.getAttribute('aria-label');
      if (!id || seen.has(id)) return;
      seen.add(id);

      const label = row.getAttribute('aria-label') ?? '';
      const name = parseName(label);
      const item: UnreadItem = {
        id,
        name,
        resolve(d: Document): HTMLElement | null {
          if (id.length < 40) {
            // Fallback path: id was the aria-label string.
            return d.querySelector<HTMLElement>(
              `div[role="option"][aria-label="${cssEscape(id)}"]`,
            );
          }
          return d.querySelector<HTMLElement>(`div[role="option"][data-convid="${cssEscape(id)}"]`);
        },
      };
      result.push(item);
    });
    return result;
  },

  async openItem(doc: Document, item: UnreadItem): Promise<void> {
    const el = item.resolve(doc);
    if (!el) throw new ItemDetachedError(item.id);
    el.click();
  },

  async markRead(doc: Document, item: UnreadItem): Promise<void> {
    const el = item.resolve(doc);
    if (!el) throw new ItemDetachedError(item.id);
    el.click();
    await new Promise((r) => setTimeout(r, 150));
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true }));
  },
};

/** Drop noise tokens that appear between "Unread" and the actual sender. */
const NOISE = [
  /^Meeting\s+/i,
  /^Collapsed\s+/i,
  /^Marked as (low|high|normal) priority by Copilot\s+/i,
  /^Marked as important\s+/i,
  /^Has attachments?\s+/i,
];

/**
 * Build a friendly name from the row's aria-label.
 *
 * Format observed:
 *   "Unread [Meeting] [Marked as ... by Copilot] <Sender> <Subject> <HH:MM> <preview>"
 *
 * Strategy: strip "Unread", strip noise prefixes, then take everything before
 * the first time stamp (HH:MM or H:MM) as the meaningful header.
 */
function parseName(label: string): string {
  let s = label.replace(/^Unread\s+/i, '');
  for (const re of NOISE) s = s.replace(re, '');
  // Cut at first time pattern.
  const m = /\s\d{1,2}:\d{2}(?:\s|$)/.exec(s);
  if (m) s = s.slice(0, m.index);
  // Cut at first M/D date (e.g. "5/4") if no HH:MM matched.
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
