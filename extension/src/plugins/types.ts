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
  /** Path under `public/` for the tile/action icon, e.g. 'icons/teams.png'. */
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
}

/**
 * Browser-only plugin behavior. Imported only by content-script entries
 * and `src/core/`. Safe to use DOM types.
 */
export interface PluginBehavior {
  /** Resolve once the in-iframe app is ready to be scraped. */
  waitForReady(doc: Document): Promise<void>;
  /** Find the unread items currently visible in the iframe document. */
  scrapeUnread(doc: Document): UnreadItem[];
  /** Optional: open a specific item (e.g. focus a chat or message row). */
  openItem?(doc: Document, item: UnreadItem): void | Promise<void>;
  /** Optional: mark the item as read. */
  markRead?(doc: Document, item: UnreadItem): Promise<void>;
}

export type Plugin = PluginMetadata & PluginBehavior;

/**
 * An unread item discovered by `scrapeUnread`.
 *
 * Holds a `resolve(doc)` re-resolver instead of a live `HTMLElement` reference,
 * so SPA re-renders and list virtualization don't strand stale DOM nodes.
 * Core re-resolves before each `openItem` / `markRead` call.
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
