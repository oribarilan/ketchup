/**
 * Visual theming hints applied per-plugin.
 */
export interface PluginTheme {
  /** Primary accent color, used by the overlay and (optionally) the sidepanel tile. */
  accent: string;
  /** Optional hex color for the sidepanel tile background. */
  tileBg?: string;
}

/**
 * Node-safe plugin metadata.
 *
 * Imported by the background service worker, the sidepanel, `manifest.config.ts`,
 * and `scripts/gen-rules.ts`. Must NOT depend on DOM types.
 */
export interface PluginMetadata {
  /** Stable string id, e.g. 'teams'. Used in messages and registry lookups. */
  id: string;
  /** Human-readable label shown in the sidepanel. */
  label: string;
  /**
   * Path under `public/` for the tile/action icon, e.g. 'icons/teams.svg'.
   * **Prefer SVG** — they scale crisply for the sidepanel tile (any DPR) and
   * the build pipeline ships them as-is. PNG is accepted but discouraged.
   */
  iconPath: string;
  theme: PluginTheme;
  /** Host suffixes this plugin matches (no protocol, no path). */
  matches: string[];
  /** URL the in-card iframe points at. Must stay same-origin once signed in. */
  iframeUrl: string;
  /**
   * Domains for which `declarativeNetRequest` strips frame headers
   * (`X-Frame-Options`, `Content-Security-Policy`, …) on `sub_frame` requests.
   */
  headerStripDomains: string[];
  /** Optional swipe button labels. Defaults applied by the overlay. */
  swipeLabels?: { left: string; right: string };
  /**
   * Optional card dimensions. Defaults to a phone-sized 420×780 card suited
   * for chat. Email apps usually want a wider card (e.g. 640×820) so subject
   * lines and message bodies fit without horizontal squeeze.
   */
  cardSize?: { width: number; height: number };
}

/**
 * Browser-only plugin behavior. Imported only by content-script entries
 * and `src/core/`. Safe to use DOM types.
 */
export interface PluginBehavior {
  /** Resolve once the in-iframe app is ready to be scraped. */
  waitForReady(doc: Document): Promise<void>;
  /**
   * Find the unread items currently visible in the iframe document.
   *
   * May return a Promise — plugins backed by virtualized lists (e.g. Outlook)
   * use this to scroll-and-snapshot multiple batches before returning.
   */
  scrapeUnread(doc: Document): UnreadItem[] | Promise<UnreadItem[]>;
  /** Optional: open a specific item (e.g. focus a chat or message row). */
  openItem?(doc: Document, item: UnreadItem): void | Promise<void>;
  /**
   * Optional: action triggered by a left swipe.
   * Semantics are plugin-defined — Teams uses "mark read", Outlook uses "archive".
   * Pair with `swipeLabels.left` so users see the right verb on the button.
   */
  actionLeft?(doc: Document, item: UnreadItem): Promise<void>;
  /**
   * Optional: action triggered by a right swipe.
   * Defaults to no-op ("keep" semantics).
   */
  actionRight?(doc: Document, item: UnreadItem): Promise<void>;
  /**
   * Optional: total unread count across the whole inbox/app, not just the
   * scraped batch. Most apps virtualize their lists, so `scrapeUnread` only
   * sees what's currently rendered. This returns the "real" total when the
   * app exposes it (e.g. Outlook's folder badge), or `null` when unknown.
   */
  getTotalUnread?(doc: Document): number | null;
  /**
   * Optional: fetch the next batch of unread items beyond what `scrapeUnread`
   * has already returned. Plugins backed by virtualized lists implement this
   * to support continuous triage of large backlogs.
   *
   * Receives the set of item ids already loaded so it can skip duplicates.
   * Returns an empty array when there is nothing more to load.
   */
  fetchMore?(
    doc: Document,
    opts: { seenIds: ReadonlySet<string>; targetCount?: number },
  ): UnreadItem[] | Promise<UnreadItem[]>;
}

export type Plugin = PluginMetadata & PluginBehavior;

/**
 * An unread item discovered by `scrapeUnread`.
 *
 * Holds a `resolve(doc)` re-resolver instead of a live `HTMLElement` reference,
 * so SPA re-renders and list virtualization don't strand stale DOM nodes.
 * Core re-resolves before each `openItem` / action call.
 *
 * Per-item action overrides (`kind`, `actionLeftLabel`, `actionLeftFn`, etc.)
 * let a plugin customize the card's verbs and behavior on a per-row basis —
 * e.g. Outlook tags meeting rows with `kind: 'meeting'` and overrides actions
 * to Accept / Decline instead of the inbox-default Archive / Keep.
 */
export interface UnreadItem {
  /** Stable id (chat id, message id, conv id). Used for the `resolve` lookup. */
  id: string;
  /** Display name shown on the card (sender, subject, etc.). */
  name: string;
  /** Optional preview line (snippet). */
  preview?: string;
  /** Re-resolves the live element by id. Returns null if no longer in the DOM. */
  resolve(doc: Document): HTMLElement | null;
  /** Optional kind tag (e.g. 'email' | 'meeting'). Plugins may use any string. */
  kind?: string;
  /** Per-item button label override for the left action. */
  actionLeftLabel?: string;
  /** Per-item button label override for the right action. */
  actionRightLabel?: string;
  /** Per-item action override for the left swipe. */
  actionLeftFn?(doc: Document): Promise<void>;
  /** Per-item action override for the right swipe. */
  actionRightFn?(doc: Document): Promise<void>;
  /**
   * Optional one-line hint shown subtly on the card (e.g. "Invite will be
   * archived after responding"). Used to disclose side-effects of an action
   * that aren't obvious from the button label.
   */
  actionHint?: string;
  /**
   * Optional label for the keyboard skip action (Cmd/Ctrl+↓). Defaults to
   * "Skip". Outlook meetings override to "Tentative" — a no-action skip on a
   * meeting invite naturally leaves the calendar event as Tentative.
   */
  actionSkipLabel?: string;
}

/**
 * Thrown by `markRead` / `openItem` when an item's element can no longer be
 * resolved (e.g. virtualized out of view). Core advances past the item.
 */
export class ItemDetachedError extends Error {
  constructor(public itemId: string) {
    super(`Item detached: ${itemId}`);
    this.name = 'ItemDetachedError';
  }
}

/**
 * Validates plugin metadata at registry load and from `gen-rules.ts`.
 * The single source of truth for "is this metadata shaped correctly?".
 */
export function validatePluginMetadata(m: PluginMetadata): void {
  const missing: string[] = [];
  if (!m.id) missing.push('id');
  if (!m.label) missing.push('label');
  if (!m.iconPath) missing.push('iconPath');
  if (!m.iframeUrl) missing.push('iframeUrl');
  if (!m.matches?.length) missing.push('matches');
  if (!m.headerStripDomains?.length) missing.push('headerStripDomains');
  if (missing.length) {
    throw new Error(
      `Invalid PluginMetadata for "${m.id || '<unknown>'}": missing ${missing.join(', ')}`,
    );
  }
}
