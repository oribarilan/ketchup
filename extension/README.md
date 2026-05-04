# fs

A TypeScript browser extension that brings swipe-card triage to unread items in any supported web app. v0.4.0 ships with **Microsoft Teams** and **Outlook** plugins, plus a sidepanel launcher for cross-tab access.

## Install

```sh
cd extension
npm install
```

## Develop

```sh
npm run dev
```

Vite serves the extension with HMR for the sidepanel and background service worker. Load `extension/dist/` unpacked in Chrome (`chrome://extensions/` → Developer mode → Load unpacked). Content scripts require a tab refresh after edits — HMR doesn't reach them.

## Build

```sh
npm run build
```

Output in `extension/dist/`.

## Checks

```sh
npm run typecheck
npm run lint
npm run test
npm run format        # write
npm run format:check  # CI-style
```

## Project structure

```
extension/
├── src/
│   ├── core/                  # React overlay, swipe/keyboard hooks, shadow-DOM mount
│   │   ├── components/        # Overlay, Card, Controls, state views
│   │   ├── hooks/             # useSwipe, useKeyboard, useIframe, useTriageQueue
│   │   ├── styles/overlay.css # raw-imported, scoped to shadow root
│   │   ├── mount.tsx          # createShadowRoot + ReactDOM root + MutationObserver
│   │   └── index.ts           # exports startTriage(plugin)
│   ├── plugins/               # Per-app plugin modules + registry
│   │   ├── types.ts           # Plugin contract + ItemDetachedError + validator
│   │   ├── registry.ts        # PLUGIN_METADATA (Node-safe)
│   │   ├── registry-runtime.ts# PLUGINS (DOM-bound; content-script only)
│   │   ├── teams.meta.ts / teams.ts
│   │   └── outlook.meta.ts / outlook.ts
│   ├── entries/               # Per-plugin content-script entry shells
│   │   ├── teams.content.ts
│   │   └── outlook.content.ts
│   ├── sidepanel/             # Launcher React app
│   ├── background/            # Service worker + router
│   └── shared/messages.ts     # Typed message bus (discriminated union)
├── public/
│   ├── icons/                 # Action + per-plugin tile icons
│   └── rules.json             # Generated from registry by scripts/gen-rules.ts
├── tests/                     # Vitest + happy-dom + @testing-library/react
├── scripts/gen-rules.ts       # Writes public/rules.json on Vite buildStart
├── manifest.config.ts         # CRXJS manifest builder, reads registry
├── vite.config.ts
├── tsconfig.json
└── eslint.config.js
```

## Adding a new plugin

A new app requires creating three files and editing one. Manifest, headers, sidepanel tile, and content-script registration all flow from the registry automatically.

1. **`src/plugins/<id>.meta.ts`** — Node-safe metadata (no DOM imports):

   ```ts
   import type { PluginMetadata } from './types';

   const meta: PluginMetadata = {
     id: 'gmail',
     label: 'Gmail',
     iconPath: 'icons/gmail.png',
     theme: { accent: '#ea4335', tileBg: '#ea4335' },
     matches: ['mail.google.com'],
     iframeUrl: 'https://mail.google.com/mail/u/0/',
     headerStripDomains: ['mail.google.com'],
     swipeLabels: { left: '← Archive', right: 'Keep →' },
   };

   export default meta;
   ```

2. **`src/plugins/<id>.ts`** — full Plugin (metadata + DOM behavior):

   ```ts
   import type { Plugin, UnreadItem } from './types';
   import { ItemDetachedError } from './types';
   import meta from './gmail.meta';

   const gmail: Plugin = {
     ...meta,
     async waitForReady(doc) {
       /* poll for mail list root */
     },
     scrapeUnread(doc): UnreadItem[] {
       /* return items with stable id + resolve(d) re-resolver */
       return [];
     },
     async openItem(doc, item) {
       const el = item.resolve(doc);
       if (!el) throw new ItemDetachedError(item.id);
       el.click();
     },
     async markRead(doc, item) {
       const el = item.resolve(doc);
       if (!el) throw new ItemDetachedError(item.id);
       /* dispatch app-specific mark-read action */
     },
   };

   export default gmail;
   ```

3. **`src/entries/<id>.content.ts`** (copy from `teams.content.ts`, change two imports):

   ```ts
   import { startTriage, type TriageHandle } from '../core';
   import gmail from '../plugins/gmail';
   import { onMessage } from '../shared/messages';

   let handle: TriageHandle | null = null;
   onMessage((msg) => {
     if (msg.type !== 'TOGGLE') return;
     if (handle) {
       handle.teardown();
       handle = null;
     } else {
       handle = startTriage(gmail);
     }
   });
   ```

4. **Add to the registry** (`src/plugins/registry.ts` and `src/plugins/registry-runtime.ts`):

   ```ts
   // registry.ts
   import gmailMeta from './gmail.meta';
   export const PLUGIN_METADATA = [teamsMeta, outlookMeta, gmailMeta] as const;

   // registry-runtime.ts
   import gmail from './gmail';
   export const PLUGINS = [teams, outlook, gmail] as const;
   ```

5. **Drop a 128×128 icon** at `public/icons/<id>.png`.

6. **Capture a fixture** of the unread list at `tests/fixtures/<id>-unread.html` (DevTools → "Copy outerHTML" on the list root, trim).

7. **Write `tests/plugins/<id>.test.ts`** modelled on `teams.test.ts`:
   - assert `scrapeUnread(fixture)` returns the expected items
   - assert each item's `resolve` round-trips on the same doc and returns `null` on an empty doc
   - assert `markRead` dispatches the right action and throws `ItemDetachedError` when `resolve` fails

8. `npm run build` — manifest, rules, sidepanel tile all auto-update.

## Plugin contract reference

See [`src/plugins/types.ts`](src/plugins/types.ts) for full JSDoc.

| Field                 | Required | Purpose                                                                |
| --------------------- | -------- | ---------------------------------------------------------------------- |
| `id`                  | yes      | Stable lookup id used in messages and registry                         |
| `label`               | yes      | Display name in the sidepanel                                          |
| `iconPath`            | yes      | Path under `public/` for the tile/action icon                          |
| `theme.accent`        | yes      | Overlay accent color (`--fs-accent`)                                   |
| `theme.tileBg`        | no       | Tile background color in the sidepanel                                 |
| `matches`             | yes      | Host suffixes (no protocol or path)                                    |
| `iframeUrl`           | yes      | URL the in-card iframe points at; must stay same-origin once signed in |
| `headerStripDomains`  | yes      | Domains for `declarativeNetRequest` frame-header stripping             |
| `swipeLabels`         | no       | Custom button labels                                                   |
| `waitForReady(doc)`   | yes      | Resolve once the in-iframe app is ready to scrape                      |
| `scrapeUnread(doc)`   | yes      | Return `UnreadItem[]` (each holding a `resolve(doc)` re-resolver)      |
| `openItem(doc, item)` | no       | Focus / open the item                                                  |
| `markRead(doc, item)` | no       | Mark as read in the host app                                           |

## How the architecture works

- Triage runs **in the app's own tab** via a content script that mounts a React overlay into a shadow DOM. The card hosts an `<iframe>` pointing at the same origin so the parent can read the iframe's DOM.
- `declarativeNetRequest` strips `X-Frame-Options` and CSP headers (per-plugin rule generated by `scripts/gen-rules.ts`).
- The **sidepanel** is a launcher, not a triage surface — it lives on the extension origin and can't host an iframe to `teams.microsoft.com` (cross-origin DOM is blocked).
- The **registry** is the single source of truth: manifest, rules, sidepanel tiles, content-script registration all derive from it.

## Known limitations

- Selector decay is expected. Each plugin's `scrapeUnread` returns `[]` on miss instead of throwing; fixture tests in CI catch breakage early.
- Iframe access requires you to be signed in. A logged-out browser drops the user on `login.microsoftonline.com`, which is cross-origin to the parent and blocks DOM access.
- v0.4.0 supports Microsoft Teams and Outlook (Office 365 web) only. Outlook consumer (`outlook.live.com`) selectors are not validated.
- Chrome / Chromium only — Manifest V3 + sidePanel API.
- No cross-tab unified unread queue yet — the sidepanel only launches.

## Troubleshooting

| Symptom                          | Likely cause                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| Iframe is blank                  | `headerStripDomains` missing for the plugin's hosts                  |
| `scrapeUnread` returns empty     | Selector decay; update `src/plugins/<id>.ts` and refresh the fixture |
| "Could not access app iframe"    | Cross-origin redirect mid-load; check sign-in and `iframeUrl`        |
| HMR weirdness in content scripts | Refresh the app tab                                                  |

## Versioning

CRXJS Vite plugin is pinned to `~2.0.0-beta.34` — beta releases have historical HMR/manifest race issues. If it breaks badly, swap to plain Vite + a hand-written `manifest.json` (~50 LOC).
