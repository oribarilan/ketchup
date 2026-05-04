# US-ketchup-multi-app

## Goal

Evolve the working `extension/` (Ketchup v0.3.1, Tinder-style triage for MS Teams) into **ketchup**: a multi-app browser extension that triages unread items from any supported web app using the same swipe-card UX.

The extension is renamed `ketchup`. Teams keeps working unchanged from a UX standpoint. Outlook ships as the second app. A **sidepanel launcher** ships day 1 so the cross-tab story is real, not aspirational. The codebase moves to **TypeScript + React + Vite + ESLint/Prettier** so refactors stay safe and onboarding new apps is fast.

## Background & Constraints

### Why an extension (not Electron, not PWA)
- **Auth must run in the user's real browser session** — passkeys, MFA, SSO, conditional access. Electron is rejected by Microsoft auth flows. PWAs cannot strip third-party `X-Frame-Options`/CSP headers, which is required to embed Teams/Outlook.
- The working v0.3.1 extension uses a critical trick: **inject the overlay into the live app's own tab**. The iframe inside the card points back at the same origin, so the parent page can read the iframe's DOM. Same-origin DOM access + `declarativeNetRequest` header strip = the whole approach.
- **Sidepanel implication:** the sidepanel runs on the extension origin, so it cannot host an iframe to `teams.microsoft.com` and read its DOM (cross-origin). The sidepanel's role is therefore a **launcher / status panel**, not a triage surface. Triage always happens in the app's own tab.

### Status of v0.3.1 (the baseline)
- Lives at `extension/` (restored from commit `2345526` — "improve loading UX").
- Works for Teams today. Selectors, overlay, swipe, keyboard, dark mode all functional.
- Files: `manifest.json`, `background.js`, `content.js` (~700 LOC, mixes overlay/swipe/keyboard/CSS with Teams-specific selectors), `rules.json`, `icons/`.
- This baseline gets archived; the new tree is a clean Vite project that re-implements the same UX.

### User decisions (locked in)
- Architecture: **Plugin registry**. Core engine + per-app plugin modules + side-panel launcher.
- Language: **TypeScript strict**.
- UI framework: **React 18** (overlay mounted into shadow DOM inside the app tab; sidepanel is a normal React app).
- Build: **Vite + `@crxjs/vite-plugin`** — handles MV3 manifest generation, multi-entry, HMR for sidepanel/background, content-script bundling.
- Lint/format: **ESLint + Prettier** (typescript-eslint, react-hooks, react-refresh).
- Tests: **Vitest + happy-dom** for plugin scrapers and React components.
- Maintenance appetite: **High** — happy to maintain per-app DOM scrapers; prefer fast iteration over backend-API integrations.
- Second app: **Outlook** (`https://outlook.office.com/mail/`).
- Sidepanel v0.4.0: **launcher** — tiles for each supported app; click opens/focuses that app's tab and toggles ketchup on. Status text per tile (e.g. "signed in", "no tab open"). Architected so a future cross-tab unread queue is a small extension, not a rewrite.
- Future apps deferred: Gmail, Slack, Discord, WhatsApp.

### Out of scope (explicitly deferred)
- Cross-tab unified unread queue inside the sidepanel (sidepanel just launches in v0.4.0).
- Backend integrations / OAuth / Graph API / Gmail API.
- Per-plugin user preferences UI (hotkey remap, etc.).
- Distribution to Chrome Web Store (still loaded unpacked).
- E2E browser tests (Playwright). Manual smoke + unit/component tests only.

## Architecture

### Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on. |
| UI | React 18 | Overlay mounted into a shadow DOM root inside the app's tab. Sidepanel is a regular React tree. |
| Build | Vite 5 + `@crxjs/vite-plugin` (pinned) | Generates MV3 manifest from `manifest.config.ts`, bundles each content-script entry, gives HMR for sidepanel & background. **Pinned to a specific version** — CRXJS has historical HMR/race issues; if it breaks badly, fallback is plain Vite + hand-written manifest (~50 LOC of JSON). |
| Lint | ESLint 9 (flat config) + `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | Run in CI + pre-commit. |
| Format | Prettier | `.prettierrc` checked in; Prettier owns formatting, ESLint owns correctness. |
| Tests | Vitest + happy-dom + `@testing-library/react` | DOM-fixture tests for scrapers; component tests for swipe/overlay. |
| Pre-commit | `lint-staged` + `husky` | typecheck + lint + format on staged files. |

### Directory shape

```
extension/
├── src/
│   ├── core/
│   │   ├── components/
│   │   │   ├── Overlay.tsx        # shadow-DOM root, theme, error/done states
│   │   │   ├── Card.tsx           # swipeable card containing the iframe
│   │   │   ├── Controls.tsx       # left/right buttons + counter
│   │   │   └── states/            # Loading, Error, Done
│   │   ├── hooks/
│   │   │   ├── useSwipe.ts        # pointer + animation
│   │   │   ├── useKeyboard.ts     # hotkeys, including in-iframe listener injection
│   │   │   └── useTriageQueue.ts  # state machine over plugin.scrapeUnread results
│   │   ├── styles/
│   │   │   └── overlay.css        # imported as CSS module / raw string into shadow root
│   │   ├── mount.ts               # createShadowRoot + ReactDOM.createRoot
│   │   ├── lifecycle.ts           # activate/teardown orchestrator
│   │   └── index.ts               # exports startTriage(plugin)
│   ├── plugins/
│   │   ├── types.ts               # Plugin interface + zod schema for runtime validation
│   │   ├── registry.ts            # exports PLUGIN_METADATA + PLUGINS (single source of truth)
│   │   ├── teams.ts
│   │   └── outlook.ts
│   ├── entries/
│   │   ├── teams.content.ts       # imports core + teams plugin, wires runtime.onMessage
│   │   └── outlook.content.ts
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx                # grid of <AppTile/> from registry
│   │   ├── components/
│   │   │   ├── AppTile.tsx        # logo, label, status, "Open" button
│   │   │   └── StatusBadge.tsx
│   │   └── hooks/
│   │       └── useTabStatus.ts    # queries chrome.tabs for plugin.matches
│   ├── background/
│   │   ├── index.ts               # service worker entry
│   │   ├── router.ts              # tab-url → plugin lookup, toggle dispatch
│   │   └── messages.ts            # typed message contracts (sidepanel <-> bg <-> content)
│   └── shared/
│       ├── messages.ts            # MessageType union, type-safe sendMessage helpers
│       └── logging.ts
├── public/
│   ├── icons/
│   └── rules.json                 # generated at build from registry; checked in too
├── tests/
│   ├── plugins/
│   │   ├── teams.test.ts
│   │   └── outlook.test.ts
│   ├── components/
│   │   └── Card.test.tsx
│   └── fixtures/
│       ├── teams-unread.html
│       └── outlook-unread.html
├── manifest.config.ts             # crxjs manifest builder, reads registry
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── package.json
└── README.md
```

The legacy `extension/content.js`, `extension/background.js`, root `manifest.json`, `rules.json` are removed once the new tree replaces them. The v0.3.1 baseline is preserved in git history (commit `2345526`) for reference.

### Plugin contract

The contract splits into two interfaces so the service worker, `gen-rules.ts`, and the sidepanel can import metadata without dragging DOM types into Node/SW contexts.

```ts
// src/plugins/types.ts
export interface PluginTheme {
  accent: string;
  /** Optional hex for the sidepanel tile background. */
  tileBg?: string;
}

/** Node-safe metadata. Imported by background SW, sidepanel, gen-rules.ts. */
export interface PluginMetadata {
  id: string;                 // stable string id, e.g. 'teams'
  label: string;              // 'Microsoft Teams'
  iconPath: string;           // path under public/, e.g. 'icons/teams.png'
  theme: PluginTheme;
  matches: string[];          // host suffixes
  iframeUrl: string;          // URL the in-card iframe points at
  headerStripDomains: string[]; // requestDomains for declarativeNetRequest
  swipeLabels?: { left: string; right: string };
}

/** DOM-bound behavior. Imported only by entries + core (browser context). */
export interface PluginBehavior {
  waitForReady(doc: Document): Promise<void>;
  scrapeUnread(doc: Document): UnreadItem[];
  openItem?(doc: Document, item: UnreadItem): void | Promise<void>;
  markRead?(doc: Document, item: UnreadItem): Promise<void>;
}

export type Plugin = PluginMetadata & PluginBehavior;

/**
 * Items hold a re-resolver, NOT a live HTMLElement reference.
 * Callers re-resolve before each action to handle SPA re-renders + virtualization.
 */
export interface UnreadItem {
  id: string;
  name: string;
  preview?: string;
  resolve(doc: Document): HTMLElement | null;
}
```

The registry exports two arrays:

```ts
// src/plugins/registry.ts
export const PLUGIN_METADATA: readonly PluginMetadata[] = [teamsMeta, outlookMeta];
export const PLUGINS: readonly Plugin[] = [teams, outlook]; // metadata + behavior
```

Background SW, sidepanel tiles, `manifest.config.ts`, and `gen-rules.ts` import `PLUGIN_METADATA` only. Content-script entries import the full `Plugin` from a single-plugin module.

### Core contract

```ts
// src/core/index.ts
export interface TriageHandle {
  teardown(): void;
}
export function startTriage(plugin: Plugin): TriageHandle;
```

`startTriage` mounts a shadow root with the React tree, owns swipe/keyboard state, drives the iframe lifecycle, calls plugin hooks. React is loaded only once per page (StrictMode in dev).

### Sidepanel architecture

```
sidepanel/App.tsx
  └── for each plugin in PLUGIN_METADATA:
        <AppTile metadata={m} />
              ├── reads chrome.tabs to find a matching tab → status
              ├── on click → background message: { type: 'OPEN_AND_TOGGLE', pluginId }
              └── background:
                    ├── focuses existing matching tab if present, OR
                    ├── opens iframeUrl in new tab
                    ├── waits for tabs.onUpdated 'complete' AND tab.url matching plugin.matches
                    │   (handles auth-redirect: ignore intermediate URLs like login.microsoftonline.com)
                    └── injects content script + sends 'TOGGLE'
```

Day-1 sidepanel does **not** read unread counts from tabs (would require content scripts to push status). It shows: app icon, label, "Tab open" / "No tab" / "Signed out (best-effort)" badge, and an Open button. Hooks (`useTabStatus`) and message contracts are shaped so a follow-up story can stream unread counts from active content scripts into the sidepanel without reshaping anything.

### Manifest generation (`manifest.config.ts`)

```ts
import { defineManifest } from '@crxjs/vite-plugin';
import { PLUGIN_METADATA } from './src/plugins/registry';

const allMatches = PLUGIN_METADATA.flatMap(p => p.matches.map(h => `https://${h}/*`));

export default defineManifest({
  manifest_version: 3,
  name: 'Ketchup',
  version: '0.4.0',
  action: { default_title: 'Ketchup', default_icon: 'icons/icon-128.png' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: PLUGIN_METADATA.map(p => ({
    matches: p.matches.map(h => `https://${h}/*`),
    js: [`src/entries/${p.id}.content.ts`],
    run_at: 'document_idle',
  })),
  host_permissions: allMatches,
  permissions: ['activeTab', 'scripting', 'declarativeNetRequest', 'sidePanel', 'tabs'],
  declarative_net_request: {
    rule_resources: [{ id: 'header_strip', enabled: true, path: 'public/rules.json' }],
  },
  icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
});
```

`public/rules.json` is generated by a small script (`scripts/gen-rules.ts`) that reads the registry and writes one rule per plugin's `headerStripDomains`. Script runs as a Vite plugin pre-build hook so rules can never drift from the registry.

### `background/router.ts`

```ts
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  const meta = findPluginByUrl(tab.url, PLUGIN_METADATA);
  if (!meta) {
    // No plugin matches this tab → open sidepanel as a launcher
    await chrome.sidePanel.open({ tabId: tab.id });
    return;
  }
  await sendOrInject(tab.id, meta.id, { type: 'TOGGLE' });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_AND_TOGGLE') {
    handleOpenAndToggle(msg.pluginId).then(() => sendResponse({ ok: true }));
    return true; // async
  }
});
```

The plugin registry is statically imported into the service worker bundle by Vite, so no runtime JSON loading needed.

### Tests

- **Plugin scraper tests** (Vitest + happy-dom): load fixture HTML, call `plugin.scrapeUnread(doc)`, assert items.
- **Component tests** (Vitest + Testing Library): swipe gesture state machine, keyboard hook, error/done states.
- **No E2E** in this story. Manual smoke test on real Teams + Outlook tabs is the acceptance gate.

## Definition of Done

- [ ] `npm run build` produces a valid MV3 build in `dist/` with: content scripts for Teams + Outlook, background service worker, sidepanel page, generated `rules.json`. No TS errors.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` all pass with zero errors / zero warnings.
- [ ] Loading `dist/` unpacked in Chrome and clicking the toolbar icon on a signed-in **Teams** tab opens the swipe-card overlay with unread chats — same UX as v0.3.1, no regressions. Keyboard, swipe, dark mode all work.
- [ ] Loading `dist/` unpacked in Chrome and clicking the toolbar icon on a signed-in **Outlook** tab (`outlook.office.com/mail/`) opens the swipe-card overlay with unread emails. Left-swipe marks the email read in Outlook; right-swipe advances. Keyboard works.
- [ ] Clicking the toolbar icon on a non-supported tab opens the **sidepanel launcher**. The launcher shows one tile per plugin in the registry, with a status badge and an Open button. Clicking Open focuses an existing tab (if any) or opens a new tab to `plugin.iframeUrl` and toggles ketchup on.
- [ ] Adding a new app requires creating only `src/plugins/<id>.ts` + `src/entries/<id>.content.ts` + adding the plugin to `src/plugins/registry.ts`. **Zero edits** under `src/core/` or `src/sidepanel/`. Manifest, rules, content-script registration, sidepanel tile all flow from the registry automatically.
- [ ] Pre-commit hook runs lint + format + typecheck on staged files.
- [ ] `extension/README.md` documents: how to install deps, dev mode (HMR), build, load unpacked, run tests, add a new plugin (with code template).
- [ ] Repo root `README.md` updated to reflect `ketchup` (not `Ketchup`/`Zero`).

## Task Priority

Each task is independently reviewable; after task 1 there's a working TS/Vite shell with Teams running, and after each subsequent task Teams must still work end-to-end.

1. **`01-scaffold-and-baseline.md`** — Stand up the new tree: `package.json`, `vite.config.ts`, `tsconfig.json`, ESLint flat config, Prettier, Vitest, husky/lint-staged, `manifest.config.ts`, `public/rules.json`, empty React app for sidepanel, stub background. Port v0.3.1's `content.js` verbatim into `src/entries/teams.content.ts` (no refactor yet, just wrapped) so Teams works on day 1 of the new build. Smoke test: `npm run build`, load unpacked, Teams overlay still works.

2. **`02-typed-plugin-contract-and-teams-extraction.md`** — Define `Plugin` interface in `src/plugins/types.ts`. Extract Teams selectors/iframeUrl/header domains into `src/plugins/teams.ts` conforming to the interface. Create `src/plugins/registry.ts`. Wire `manifest.config.ts` and `gen-rules.ts` to read from the registry. Teams entry script becomes thin (`startTriage(teamsPlugin)` shell). Core logic still pre-React (just moved into `src/core/legacy.ts`). Verify Teams.

3. **`03-react-overlay.md`** — Re-implement overlay/swipe/keyboard as React components + hooks under `src/core/components` and `src/core/hooks`. Mount into shadow DOM via `src/core/mount.ts`. Delete `src/core/legacy.ts`. Add component tests (`Card.test.tsx`, swipe hook test). Verify Teams.

4. **`04-sidepanel-launcher.md`** — Build sidepanel React app: `App.tsx` renders `<AppTile/>` per registry entry. `useTabStatus` hook queries `chrome.tabs` for matching tabs. Background `router.ts` handles `OPEN_AND_TOGGLE` (focus existing tab or open new tab + inject + toggle). Toolbar click on a non-plugin tab opens the sidepanel. Verify: sidepanel opens, Teams tile shows correct status, clicking Open works.

5. **`05-outlook-plugin.md`** — Create `src/plugins/outlook.ts` (selectors, mark-read), `src/entries/outlook.content.ts`. Add Outlook entry to registry — manifest + rules regenerate automatically. Save real Outlook DOM fixture, write `tests/plugins/outlook.test.ts`. Verify Outlook end-to-end (overlay opens, list of unread, mark-read works, sidepanel tile works).

6. **`06-readme-and-cleanup.md`** — Write `extension/README.md` (install/dev/build/load/test/add-a-plugin). Update repo root `README.md`. Add `.gitignore` for `dist/`, `node_modules/`, `.vite/`. Delete legacy `extension/content.js`, `extension/background.js`, root-level `manifest.json`, `rules.json` if still present. Verify both apps + sidepanel one final time.

## Cross-Cutting Concerns

### Backwards compatibility during refactor
After **each** task, manual smoke test on Teams must still pass: open Teams tab, click extension, see card with unread chats, swipe through. If a task breaks Teams, it's not done. Task 1 in particular must produce a working Teams build before any extraction work starts in task 2.

### Iframe DOM access is fragile
The whole approach depends on the in-card iframe being same-origin with the parent tab. If a plugin's `iframeUrl` redirects to a different origin (e.g., Outlook redirecting to `login.microsoftonline.com` mid-flow), `iframe.contentDocument` will throw. Plugins must point `iframeUrl` at a URL that stays on the parent's origin once the user is signed in. Test in a real signed-in browser, not headless.

### Sidepanel can't host triage
The sidepanel is on the extension origin; iframes to `teams.microsoft.com` from there are cross-origin and can't be DOM-scraped. Triage always happens in the app's own tab. The sidepanel's job is to be a launcher and (eventually) a status surface. Don't try to embed app iframes in the sidepanel.

### Header stripping is per-origin
Each plugin's `headerStripDomains` translates to a `declarativeNetRequest` rule generated by `scripts/gen-rules.ts`. Adding a plugin to the registry without `headerStripDomains` populated will fail the build (script asserts non-empty array). This prevents the silent "looks fine locally, blocked in iframe" failure mode.

### Service worker has no persistent state
`background/index.ts` is a service worker — it can be killed at any time. The plugin registry is statically imported (no runtime fetching). Any per-tab toggle state lives in the content script, not the background.

### Selector decay is expected
Per the user's stated maintenance appetite, scraper breakage is an accepted cost. Each plugin's `scrapeUnread` returns `UnreadItem[]` — `[]` rather than throw if selectors don't match. Items hold a `resolve(doc)` re-resolver, NOT a live `HTMLElement`, so SPA re-renders and Outlook virtualization don't strand stale references — core re-resolves before each `openItem`/`markRead` call and shows the error state if `resolve()` returns `null`. Core shows the existing "No unread items found" state when the list is empty. Fixture tests in CI catch breakage before users see it.

### Mount resilience
Teams and Outlook are SPAs that occasionally re-render large DOM subtrees (workspace switches, list virtualization). `src/core/mount.ts` registers a `MutationObserver` on `document.body` while the overlay is active; if the `<div id="ketchup-root">` host is removed by the host page, the observer re-mounts it. Teardown disconnects the observer.

### Type safety across the boundaries
Messages between content / background / sidepanel are typed via a discriminated union in `src/shared/messages.ts`. `sendMessage` and `onMessage` helpers wrap `chrome.runtime.*` so the message shape is checked at the call site. No `any`.

### Naming
- Repo: `ketchup` (unchanged)
- Extension display name: `ketchup`
- Manifest `name`: `ketchup`
- Internal code: keep neutral (`startTriage`, `Plugin`, `core`, `registry`) — no `ketchup`/`ketchup`/`zero` strings sprinkled through logic
