import type { Plugin, UnreadItem } from './types';
import { ItemDetachedError } from './types';
import teamsMeta from './teams.meta';

const UNREAD_PREFIX = /^Unread\s*(message\s*)?/;

function getStableId(el: Element, idx: number): string {
  // Teams chat list items typically expose a `data-tid` or `id` attribute.
  // Fall back to a positional id within the list root — fragile but bounded
  // to a single render frame; `resolve` will return null after re-render and
  // core will skip the stale item.
  return el.getAttribute('data-tid') || el.getAttribute('id') || `idx:${idx}`;
}

const teams: Plugin = {
  ...teamsMeta,

  async waitForReady(doc: Document): Promise<void> {
    // Teams' iframe may land on whatever tab the user last viewed (Calendar,
    // Activity, etc.). Click the Chat rail button so the chat tree is rendered,
    // then poll for tree items.
    const deadline = Date.now() + 15_000;
    let chatClicked = false;
    while (Date.now() < deadline) {
      if (!chatClicked) {
        const btns = Array.from(doc.querySelectorAll('button[aria-label]'));
        const chatBtn = btns.find((b) => /^Chat\b/i.test(b.getAttribute('aria-label') ?? '')) as
          | HTMLElement
          | undefined;
        if (chatBtn) {
          chatBtn.click();
          chatClicked = true;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      // Look for at least one tree item whose text starts with "Unread" — that
      // proves the chat list (not just the nav rail) is rendered.
      const items = doc.querySelectorAll('.fui-TreeItem[role="treeitem"]');
      for (const it of items) {
        if ((it.textContent ?? '').trim().startsWith('Unread')) return;
      }
      // Or, if no unread chats, accept any tree item once we've clicked Chat.
      if (chatClicked && items.length > 5) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  },

  scrapeUnread(doc: Document): UnreadItem[] {
    // Match what Teams' "Unread" filter surfaces — every chat-list tree item
    // whose label starts with "Unread", regardless of section (Chats, Channels,
    // pinned, etc.). Section-specific filtering is intentionally NOT applied.
    const items = doc.querySelectorAll('.fui-TreeItem[role="treeitem"]');
    const result: UnreadItem[] = [];
    items.forEach((item, idx) => {
      if (result.length >= 100) return;
      const text = (item.textContent ?? '').trim();
      if (!text.startsWith('Unread')) return;
      if (item.querySelector('[role="group"]')) return;
      const clean = text.replace(UNREAD_PREFIX, '');
      if (clean.length < 3) return;
      const name = clean.split(/\d/)[0]?.trim() ?? clean;
      const id = getStableId(item, idx);
      result.push({
        id,
        name,
        resolve(d: Document): HTMLElement | null {
          if (id.startsWith('idx:')) {
            const n = Number(id.slice(4));
            const all = d.querySelectorAll<HTMLElement>('.fui-TreeItem[role="treeitem"]');
            return all[n] ?? null;
          }
          return (
            d.querySelector<HTMLElement>(`[data-tid="${CSS.escape(id)}"]`) || d.getElementById(id)
          );
        },
      });
    });
    return result;
  },

  async openItem(doc: Document, item: UnreadItem): Promise<void> {
    const el = item.resolve(doc);
    if (!el) throw new ItemDetachedError(item.id);
    el.click();
  },

  // Teams marks chats read on view. openItem already clicks the chat to show
  // it in the iframe, so the left action ("Mark Read") is implicitly done.
  // Defining actionLeft as a no-op makes the contract explicit.
  async actionLeft(_doc: Document, _item: UnreadItem): Promise<void> {
    // no-op
  },

  // NOTE: Teams' chat-rail counter badge is computed server-side and does not
  // reliably equal the number of unread items in the DOM (it appears to
  // exclude muted/non-priority chats in ways we can't see). Surfacing it as
  // "total" misled users, so we don't expose it. The progress counter just
  // shows "X of N" where N is what fs actually has to triage — the same set
  // Teams' "Unread" filter would surface. Outlook keeps `getTotalUnread`
  // because its folder badge IS faithful.
};

export default teams;
