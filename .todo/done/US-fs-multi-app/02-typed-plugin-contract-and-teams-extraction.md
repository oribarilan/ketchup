# 02 — Typed Plugin Contract and Teams Extraction

## Goal

Define the typed `Plugin` contract, extract Teams-specific concerns (selectors, iframe URL, header-strip domains, mark-read action) into `src/plugins/teams.ts`, and make the **registry the single source of truth** that drives `manifest.config.ts` and `public/rules.json` generation.

After this task: adding a new app means writing one plugin module + one entry script + one registry import. The Teams content script becomes a thin shell that calls `startTriage(teamsPlugin)`. Core logic stays where it is for now (pre-React), moved into `src/core/legacy.ts` — the React rewrite is task 3.

## Scope

### Create

- `extension/src/plugins/types.ts` — `PluginMetadata`, `PluginBehavior`, `Plugin` (= metadata & behavior), `PluginTheme`, `UnreadItem` interfaces (per main plan). `UnreadItem` carries a `resolve(doc): HTMLElement | null` function instead of a live `HTMLElement` reference. Include JSDoc on every field.

  Add a single shared validator:
  ```ts
  export function validatePluginMetadata(m: PluginMetadata): void {
    // assert non-empty: id, label, iconPath, matches, iframeUrl, headerStripDomains
    // throws on violation; called by registry load AND gen-rules.ts
  }
  ```
  No second validator anywhere — `gen-rules.ts` imports and uses this one.

- `extension/src/plugins/teams.meta.ts` — `PluginMetadata` for Teams (Node-safe, no DOM imports).
- `extension/src/plugins/teams.ts` — full `Plugin` for Teams: spreads metadata + adds DOM-bound behavior (`waitForReady`, `scrapeUnread`, `markRead`). Imports `teams.meta.ts`.

  Behavior details:
  - `theme: { accent: '#6264a7' }` (in metadata)
  - `iconPath: 'icons/teams.png'` (in metadata; add icon to `extension/public/icons/teams.png`)
  - `matches: ['teams.cloud.microsoft', 'teams.microsoft.com']`
  - `iframeUrl: 'https://teams.cloud.microsoft/'`
  - `headerStripDomains` — same as matches
  - `waitForReady(doc)` — extracted from current readiness wait
  - `scrapeUnread(doc)` — Teams chat-list selectors moved out of content.js. Returns `UnreadItem[]` where each item's `resolve(doc)` re-queries by a stable attribute (e.g., the chat's `data-tid` or chat ID embedded in the tree node). Defensive: returns `[]` on selector miss instead of throwing.
  - `markRead(doc, item)` — calls `item.resolve(doc)`; if null, throws a typed `ItemDetachedError` for core to surface; otherwise performs Teams mark-read.
  - `swipeLabels: { left: '← Mark Read', right: 'Keep →' }`

- `extension/src/plugins/registry.ts`:
  ```ts
  import teamsMeta from './teams.meta';
  import teams from './teams';

  export const PLUGIN_METADATA = [teamsMeta] as const;
  export const PLUGINS = [teams] as const;

  PLUGIN_METADATA.forEach(validatePluginMetadata);
  ```
- `extension/src/core/legacy.ts` — the verbatim v0.3.1 overlay/swipe/keyboard code from task 1's `teams.content.ts`, now parameterized to accept a `Plugin` argument:
  ```ts
  export function startTriage(plugin: Plugin): { teardown(): void };
  ```
  All `document.querySelector('[teams-specific]')` calls inside the iframe-handling logic become `plugin.scrapeUnread(doc)` / `plugin.markRead(doc, item)` / `plugin.waitForReady(doc)`. Where the legacy code held `cards[i].element` directly, now call `cards[i].resolve(iframeDoc)` and skip-or-error on null. The overlay HTML/CSS strings stay inline. Theme color comes from `plugin.theme.accent`. Swipe button labels come from `plugin.swipeLabels`.
- `extension/src/core/index.ts` — re-exports `startTriage` from `legacy.ts`. This indirection lets task 3 swap the implementation without touching call sites.
- `extension/src/entries/teams.content.ts` — becomes thin:
  ```ts
  import { startTriage } from '../core';
  import teamsPlugin from '../plugins/teams';

  let handle: { teardown(): void } | null = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!isToggleMessage(msg)) return;
    if (handle) { handle.teardown(); handle = null; }
    else { handle = startTriage(teamsPlugin); }
  });
  ```
- `extension/scripts/gen-rules.ts` — Node script that imports `PLUGIN_METADATA` (no DOM types pulled in) and writes `public/rules.json` with one declarativeNetRequest rule per plugin. Calls `validatePluginMetadata` on each entry first (single shared validator from `types.ts` — no duplicate assertion logic). Headers stripped: `x-frame-options`, `content-security-policy`, `content-security-policy-report-only`, `frame-options`. Resource type: `sub_frame`. One rule id per plugin, deterministic (e.g., `1000 + index`). Run via `tsx scripts/gen-rules.ts`.
- `extension/vite.config.ts` — add a tiny Vite plugin that runs `gen-rules.ts` in `buildStart`, so `public/rules.json` is always fresh before bundling.
- `extension/manifest.config.ts` — refactor to read `PLUGIN_METADATA`:
  - `content_scripts` mapped from metadata
  - `host_permissions` = union of all metadata's matches
  - `side_panel`, `background`, `permissions`, `declarative_net_request` unchanged from task 1

### Modify

- `extension/src/background/index.ts` — replace hardcoded Teams URL check with a `findPluginByUrl(url, PLUGIN_METADATA)` helper imported from `src/background/router.ts` (new file, but minimal in this task — full sidepanel routing is task 4). Background imports **only `PLUGIN_METADATA`**, never the full `Plugin` (no DOM types in SW).

### Add tests

- `extension/tests/plugins/teams.test.ts` — load `tests/fixtures/teams-unread.html`, call `teamsPlugin.scrapeUnread(fixtureDoc)`, assert N items with expected `name` values. Also assert each item's `resolve(fixtureDoc)` returns the correct `HTMLElement` (and `resolve(emptyDoc)` returns `null`). Use happy-dom to construct `Document` from HTML string.
- `extension/tests/fixtures/teams-unread.html` — saved DOM snippet of a Teams chat list with 2–3 unread chats.
- `extension/tests/integration/teams-baseline.test.ts` — **regression baseline.** Validates the full triage flow against fixture: mock iframe doc, run `startTriage(teamsPlugin)`, drive through 2 cards via simulated swipes, assert `markRead` called for each, assert teardown removes overlay. This file MUST survive task 3's React rewrite unchanged (the public contract of `startTriage(plugin)` doesn't change).

## Implementation Notes

- **Don't refactor the overlay yet.** The whole point of this task is to validate the plugin contract by running v0.3.1's exact overlay code through it. If the contract is wrong, we find out before writing React.
- **`UnreadItem.resolve` instead of `element` ref.** Plugins implement `resolve` by capturing a stable identifier at scrape time (chat id, message id, data attribute) and re-querying on demand. This insulates core from SPA re-renders. Teams' tree items expose `data-tid` or similar — use it. If no stable id exists, fall back to indexed query within a stable parent, with a comment acknowledging the fragility.
- **Single validator.** `validatePluginMetadata` is the only validator. `gen-rules.ts` imports and calls it. Registry calls it. No second copy.
- **Metadata vs behavior boundary check.** `git grep "HTMLElement\|Document" src/plugins/*.meta.ts src/background/ scripts/` should return zero hits. If any leak, refactor.
- **`gen-rules.ts` runs in Node.** It imports `PLUGIN_METADATA` only — pure data, safe to import in any context. Plugin `.meta.ts` files must have zero side effects at module load.
- **Type the message bus minimally.** A full `src/shared/messages.ts` discriminated union ships in task 4 (when sidepanel ↔ background ↔ content traffic appears). For now, define `ToggleMessage` and `isToggleMessage` inline.

## Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all pass.
- [ ] `npm run build` produces `dist/manifest.json` whose `content_scripts[0].matches` derives from Teams metadata. Inspect the file to confirm.
- [ ] `dist/rules.json` (copied from `public/rules.json`) contains a Teams rule generated by `gen-rules.ts`. Delete `public/rules.json`, run `npm run build`, confirm it's regenerated.
- [ ] `tests/plugins/teams.test.ts` passes — scrapes the fixture and returns expected items, including resolver round-trip.
- [ ] `tests/integration/teams-baseline.test.ts` passes — full triage flow against fixture works end-to-end.
- [ ] Loading `dist/` unpacked: Teams overlay still works exactly as v0.3.1. Mark-read still works. Swipe + keyboard + dark mode still work. **No regression vs task 1.**
- [ ] Search the codebase for the strings `teams.cloud.microsoft` and `teams.microsoft.com`: only appearance is in `src/plugins/teams.meta.ts` and possibly fixture file. No core/background/manifest hardcoding.
- [ ] `git grep "HTMLElement\|Document" -- 'src/plugins/*.meta.ts' 'src/background/' 'scripts/'` returns zero hits.

## Out of Scope

- React rewrite (task 3).
- Sidepanel launcher (task 4).
- Outlook plugin (task 5).
- Full typed message bus (task 4).
