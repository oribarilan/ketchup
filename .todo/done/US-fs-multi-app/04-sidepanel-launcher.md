# 04 — Sidepanel Launcher

## Goal

Build the **sidepanel launcher**: a React app that renders one tile per registered plugin, shows a tab-status badge, and on click opens (or focuses) a tab to that plugin's `iframeUrl` and toggles the fs overlay on. Wire the toolbar action so clicking on a non-supported tab opens the sidepanel instead of doing nothing.

Introduce the typed message bus (`src/shared/messages.ts`) used across content / background / sidepanel.

After this task: there is a real cross-tab UI surface in v0.4.0. The architecture is ready to grow into a unified unread queue without a rewrite.

## Scope

### Create

- `extension/src/shared/messages.ts` — discriminated union of all runtime messages with type-safe `sendMessage<T>` and `onMessage<T>` helpers. Initial message types:
  ```ts
  export type Message =
    | { type: 'TOGGLE' }                                 // bg → content
    | { type: 'OPEN_AND_TOGGLE'; pluginId: string }      // sidepanel → bg
    | { type: 'GET_TAB_STATUSES' }                       // sidepanel → bg
    | { type: 'TAB_STATUSES'; statuses: TabStatus[] };   // bg → sidepanel response

  export interface TabStatus {
    pluginId: string;
    tabId: number | null;
    url: string | null;
  }
  ```
  Helpers wrap `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` with proper typing and unknown-message rejection.

- `extension/src/background/router.ts`:
  - `findPluginByUrl(url, metadata)` — host-suffix match, returns metadata or `null`.
  - `handleActionClick(tab)` — if URL matches a plugin → `sendOrInject` toggle; else → open sidepanel for this tab.
  - `handleOpenAndToggle(pluginId)` — find existing tab matching plugin's matches; if found, focus it and send `TOGGLE`; else open new tab to `plugin.iframeUrl`. **Wait for the final URL, not the first `complete`:** subscribe to `chrome.tabs.onUpdated` for the new tab id, and resolve only when `changeInfo.status === 'complete'` AND `tab.url` matches `plugin.matches`. Auth redirects through `login.microsoftonline.com` will fire `complete` for the login page first — ignore those. Apply a hard timeout (e.g., 30s) and surface an error state to the sidepanel if exceeded.
  - `handleGetTabStatuses()` — for each plugin, query `chrome.tabs` for matching tabs, return `TabStatus[]`.
  - `sendOrInject(tabId, pluginId, message)` — try `chrome.tabs.sendMessage`; on failure (no content script yet because tab pre-dates extension load) fall back to `chrome.scripting.executeScript` against the entry file, then retry sendMessage.

- `extension/src/background/index.ts` — wire `chrome.action.onClicked` → `handleActionClick`, `chrome.runtime.onMessage` → router by message type.

- `extension/src/sidepanel/main.tsx` — root mount, `<React.StrictMode>`, renders `<App>`.

- `extension/src/sidepanel/App.tsx`:
  ```tsx
  import { PLUGIN_METADATA } from '../plugins/registry';
  import { useTabStatus } from './hooks/useTabStatus';

  export function App() {
    const statuses = useTabStatus();
    return (
      <main className="fs-launcher">
        <header><h1>fs</h1></header>
        <ul className="tile-grid">
          {PLUGIN_METADATA.map(m => (
            <AppTile key={m.id} metadata={m} status={statuses[m.id]} />
          ))}
        </ul>
      </main>
    );
  }
  ```

- `extension/src/sidepanel/components/AppTile.tsx` — renders icon (resolved via `chrome.runtime.getURL(metadata.iconPath)`), label, status badge, "Open" button. Click button → `sendMessage({ type: 'OPEN_AND_TOGGLE', pluginId: metadata.id })`. Tile background uses `metadata.theme.tileBg` if present, else neutral. Hover/focus styles. Disabled state if status is loading.

- `extension/src/sidepanel/components/StatusBadge.tsx` — visual badge: "Tab open", "No tab", "Loading...". Uses CSS color tokens.

- `extension/src/sidepanel/hooks/useTabStatus.ts` — on mount sends `GET_TAB_STATUSES`. Subscribes to `chrome.tabs.onUpdated`, `onRemoved`, `onCreated`. Filters `onUpdated` events to `changeInfo.status === 'complete'` only (ignores partial loads → avoids re-render storms). Debounces re-fetch to 250ms. Returns `Record<pluginId, TabStatus>`. Cleans up listeners.

- `extension/src/sidepanel/styles.css` — proper CSS file, imported by `main.tsx`. Layout (grid), typography, dark mode via `prefers-color-scheme`.

### Modify

- `extension/manifest.config.ts` — add `tabs` permission if not already present. Add `sidePanel` permission. Confirm `side_panel.default_path` points at `src/sidepanel/index.html`.
- `extension/public/icons/` — add per-plugin tile icons (Teams icon, placeholder for Outlook). Reference these via `chrome.runtime.getURL(metadata.iconPath)` in tile components.
- **Migrate existing entry scripts to the typed message bus.** `src/entries/teams.content.ts` (and any other entries) currently inline `isToggleMessage`. Replace with `onMessage` helper from `src/shared/messages.ts`. Same for `src/background/index.ts`. After this task: `git grep "chrome.runtime.onMessage.addListener\|chrome.runtime.sendMessage"` returns hits only inside `src/shared/messages.ts`.

### Tests

- `extension/tests/sidepanel/AppTile.test.tsx` — render with mock metadata and status, click Open, assert `sendMessage` called with correct payload (mock `chrome.runtime`).
- `extension/tests/sidepanel/useTabStatus.test.ts` — mock `chrome.runtime.sendMessage` and tab events, assert state updates correctly. **Verify debounce: bursts of `onUpdated` events collapse to a single re-fetch.**
- `extension/tests/background/router.test.ts` — unit-test:
  - `findPluginByUrl` against real `PLUGIN_METADATA`.
  - `handleOpenAndToggle` against existing-tab path (focuses, sends TOGGLE).
  - `handleOpenAndToggle` against new-tab path with auth-redirect simulation: tab emits `complete` for `login.microsoftonline.com` first, then `complete` for `teams.cloud.microsoft`. Assert `TOGGLE` only fires once, after the matching URL.
  - `handleOpenAndToggle` timeout: tab never reaches matching URL → returns error.
  - `sendOrInject` fallback: first `sendMessage` rejects → `executeScript` invoked → second `sendMessage` succeeds.

### Add `tests/setup.ts` chrome API mocks

Provide a minimal `chrome.runtime` / `chrome.tabs` / `chrome.action` mock that tests can spy on. Use a thin manual mock (not a heavy lib) — just enough surface for the helpers we use.

## Implementation Notes

- **`chrome.sidePanel.open` requires a user gesture.** Calling it from `chrome.action.onClicked` is a valid gesture; calling it from a runtime message is NOT. Make sure the "open sidepanel for unsupported tab" path goes through `onClicked` directly.
- **Sidepanel persistence:** the sidepanel page lives across tab switches but unmounts when closed. Don't store critical state in component memory — use `chrome.storage.local` if persistence becomes needed (not in this task).
- **Tab matching is by host suffix, not exact URL.** Teams runs across two host names; Outlook may run on `.live.com` redirects too. `findPluginByUrl` strips protocol + path and checks `hostname.endsWith(matchHost)`.
- **Race in `handleOpenAndToggle`:** opening a fresh tab and sending `TOGGLE` immediately races against content script registration. Listen for `chrome.tabs.onUpdated` `status === 'complete'` for the new tab id, *then* call `sendOrInject`. Add a 500ms safety delay after injection, matching v0.3.1's pattern.
- **Don't poll tabs.** `useTabStatus` subscribes to events and only re-queries on change. Initial query happens once on mount.
- **Type discipline:** every `chrome.runtime.sendMessage` call goes through the typed helper. Greppable invariant: `git grep "chrome.runtime.sendMessage"` should return only `src/shared/messages.ts`.
- **Future-proofing for unread counts:** structure `TabStatus` so it CAN carry `unreadCount?: number` later without breaking the API. Don't ship the count yet, but the field's place in the type is reserved.

## Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all pass.
- [ ] `npm run build` succeeds; `dist/manifest.json` includes `side_panel.default_path` and `sidePanel` + `tabs` in permissions.
- [ ] Loading `dist/` unpacked:
  - Clicking the toolbar icon on a Teams tab still toggles the overlay (regression check).
  - Clicking the toolbar icon on a non-Teams tab (e.g., `https://example.com`) opens the sidepanel.
  - Sidepanel shows a tile for Teams with "Tab open" status (when a Teams tab is open elsewhere) or "No tab" (when not).
  - Clicking "Open" on the Teams tile with no Teams tab: opens a new tab to `teams.cloud.microsoft`, waits for load, fires the overlay.
  - Clicking "Open" on the Teams tile with an existing Teams tab: focuses that tab and toggles the overlay.
  - Opening/closing a Teams tab updates the tile's status badge live.
- [ ] Sidepanel keyboard accessible: tab order moves through tiles, Enter triggers Open.
- [ ] Sidepanel respects `prefers-color-scheme: dark`.

## Out of Scope

- Outlook plugin (task 5) — sidepanel will show only Teams until task 5 lands; that's expected.
- Unread counts in tiles — deferred.
- Per-plugin settings — deferred.
- Sidepanel hosting the triage UI — explicitly impossible (cross-origin), see main plan.
