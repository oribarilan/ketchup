# 05 — Outlook Plugin

## Goal

Add Outlook (`https://outlook.office.com/mail/`) as the second registered plugin to validate that the plugin contract holds with **zero edits to `src/core/` or `src/sidepanel/`**.

This is the real test of the architecture from tasks 1–4. If anything under `src/core/` or `src/sidepanel/` needs to change to make Outlook work, that's a contract bug — fix the contract, don't paper over it in the plugin.

## Scope

### Create

- `extension/src/plugins/outlook.meta.ts` — Node-safe `PluginMetadata` for Outlook:
  - `id: 'outlook'`
  - `label: 'Outlook'`
  - `iconPath: 'icons/outlook.png'`
  - `theme: { accent: '#0078d4', tileBg: '#0078d4' }`
  - `matches: ['outlook.office.com', 'outlook.live.com', 'outlook.office365.com']`
  - `iframeUrl: 'https://outlook.office.com/mail/'`
  - `headerStripDomains` — same as matches
  - `swipeLabels: { left: '← Mark Read', right: 'Keep →' }`

- `extension/src/plugins/outlook.ts` — full `Plugin` (metadata + behavior):
  - `waitForReady(doc)` — wait for the message-list root selector to appear, with retry/backoff for auth-redirect settling
  - `scrapeUnread(doc)` — find unread email rows, extract subject + sender into `name`, optional snippet into `preview`. Each item's `resolve(doc)` re-queries by stable identifier (Outlook uses `data-convid` / message ids on rows — capture at scrape, re-query at action time). Returns `[]` if list root absent. Handles virtualization implicitly via `resolve` returning `null` for items scrolled out of view.
  - `markRead(doc, item)` — calls `item.resolve(doc)` first; if null, throws `ItemDetachedError` (core advances). Outlook mark-read flow: see implementation note below.
  - `openItem(doc, item)` — calls `item.resolve(doc)` then explicitly clicks the row to focus it.

- `extension/src/entries/outlook.content.ts` — same shape as `teams.content.ts`:
  ```ts
  import { startTriage } from '../core';
  import outlook from '../plugins/outlook';

  let handle: { teardown(): void } | null = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!isToggleMessage(msg)) return;
    if (handle) { handle.teardown(); handle = null; }
    else { handle = startTriage(outlook); }
  });
  ```

- `extension/public/icons/outlook.png` — 128px brand icon.

- `extension/tests/fixtures/outlook-unread.html` — saved DOM snippet from a real Outlook inbox with 2–3 unread messages. Capture via DevTools → "Copy outerHTML" on the message list container, then trim non-essentials.

- `extension/tests/plugins/outlook.test.ts` — mirror of `teams.test.ts`: load fixture, call `outlook.scrapeUnread(doc)`, assert items + `resolve(doc)` round-trip. **Add markRead unit test:** stub `dispatchEvent` on the document, call `outlook.markRead(doc, item)`, assert `dispatchEvent` invoked with a `KeyboardEvent` of `key: 'q'`. Cover the detached-element path: `item.resolve` returns null → `markRead` throws `ItemDetachedError`.

### Modify

- `extension/src/plugins/registry.ts` — add Outlook to both arrays:
  ```ts
  import outlookMeta from './outlook.meta';
  import outlook from './outlook';

  export const PLUGIN_METADATA = [teamsMeta, outlookMeta] as const;
  export const PLUGINS = [teams, outlook] as const;
  ```
  **This single edit must trigger automatic propagation:** manifest content_scripts entry, host_permissions, generated `rules.json` entry, sidepanel tile.

### Verify (no edits required)

- `manifest.config.ts` — should produce a content_scripts entry for Outlook automatically. If it doesn't, the registry-driven manifest from task 2 is broken; fix there, not here.
- `scripts/gen-rules.ts` — should write an Outlook rule. Same as above.
- `src/sidepanel/App.tsx` — should render an Outlook tile with no edits. Same as above.
- `src/background/router.ts` — `findPluginByUrl` should match Outlook URLs. No edits.

## Implementation Notes

### Outlook same-origin caveat

Outlook's auth flow can redirect through `login.microsoftonline.com` mid-load. Once signed in, the user lands on `outlook.office.com/mail/` and the iframe sits same-origin with the parent. **Test only against an already-signed-in browser session.** If `iframe.contentDocument` access throws on first load, the page is mid-redirect — `waitForReady` should retry with a backoff (e.g., poll every 200ms up to 10s) before giving up.

### Selector strategy

Outlook's DOM is heavily virtualized — the message list re-renders as the user scrolls. `scrapeUnread` should:
1. Query a stable root container (e.g., `[role="list"]` near the message list).
2. Within it, find rows with the unread indicator (Microsoft uses an `aria-label` containing "Unread" or a class like `unreadIndicator`). **Inspect the live DOM during implementation** — selectors are not guessable from documentation.
3. Extract subject, sender, snippet from row's child elements.
4. Capture each row's stable id (`data-convid`, message id from `aria-labelledby`, or similar) into the `UnreadItem.resolve` closure. The re-resolver does `doc.querySelector(\`[data-convid="${id}"]\`)`. Virtualization-induced detachment becomes a `null` return rather than a crash. Core skips and continues.

### Mark-read implementation

Try the keyboard `Q` approach first:
```ts
async markRead(doc, item) {
  const el = item.resolve(doc);
  if (!el) throw new ItemDetachedError(item.id);
  el.click();                        // select the message
  await sleep(150);
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
}
```

If `Q` doesn't fire reliably (Outlook may require a real OS keyboard event), fall back to context-menu approach. Document whichever wins in a code comment with date and Outlook version observed. Add a unit test for whichever path is shipped.

### Header strip rules for Outlook

Outlook serves with its own CSP. The strip rule from `gen-rules.ts` should remove `x-frame-options`, `content-security-policy`, `content-security-policy-report-only`, `frame-options` for `sub_frame` requests to Outlook's domains. This rule is generated automatically once Outlook is in the registry — verify in `dist/rules.json` post-build.

### Don't add Outlook-specific code paths in core

If you find yourself wanting to write `if (plugin.id === 'outlook') { ... }` anywhere outside `src/plugins/outlook.ts`, **stop** — extend the `Plugin` interface with a typed hook instead, and implement the default behavior in core. The whole point of this task is to harden the contract, not paper over it.

## Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all pass.
- [ ] `npm run build` succeeds.
- [ ] `dist/manifest.json` contains a content_scripts entry for Outlook with the correct matches AND a Teams entry, both generated from the registry.
- [ ] `dist/rules.json` contains rules for both Teams and Outlook domains.
- [ ] `tests/plugins/outlook.test.ts` passes.
- [ ] **Manual smoke (Outlook):** sign into `outlook.office.com/mail/`, click toolbar icon → ketchup overlay opens with the list of unread emails. Each card shows subject + sender. Right-swipe advances. Left-swipe marks the email as read in Outlook (verify by checking the Outlook UI after closing the overlay — the read state should be reflected). Keyboard works.
- [ ] **Manual smoke (Teams regression):** Teams overlay still works exactly as before. No regression.
- [ ] **Manual smoke (sidepanel):** open sidepanel — shows Teams tile AND Outlook tile. Each tile's "Open" button works. Status badges update when Teams or Outlook tabs open/close.
- [ ] `git diff src/core/ src/sidepanel/` shows **zero changes** in this commit. (If any change is needed, root-cause it back to a contract bug introduced in tasks 2–4 and fix there.)

## Out of Scope

- Archive action for Outlook (could add later as a per-plugin custom action).
- Categories / labels / flags.
- Calendar items.
- Outlook on `outlook.live.com` (consumer accounts) — `matches` includes the host but selectors only validated against `outlook.office.com`. Document this limitation in plugin's JSDoc.
- README (task 6).
