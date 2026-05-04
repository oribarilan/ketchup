# AGENTS.md

Guide for AI coding agents working on **fs** — a TypeScript browser extension that brings swipe-card triage to unread items in any supported web app.

The actual extension lives in `extension/`. The repo root holds `.todo/` for task tracking and `AGENTS.md` (this file).

## Project at a glance

- **What**: Chrome MV3 extension. React shadow-DOM overlay mounted into the host app's tab. Sidepanel launcher. Plugin registry drives manifest/rules/tiles.
- **Where**: `extension/` (the only directory that ships).
- **Stack**: TypeScript strict + React 18 + Vite + `@crxjs/vite-plugin` + Vitest + happy-dom.
- **Currently supports**: Microsoft Teams, Outlook (Office 365 web).

## Architecture

Two layers, hard boundary:

```
extension/src/
├── core/              # App-agnostic. NO Teams/Outlook strings here.
│   ├── components/    # Overlay, Card, Controls, state views
│   ├── hooks/         # useSwipe, useKeyboard, useIframe, useTriageQueue
│   ├── styles/        # Shadow-root scoped CSS
│   └── mount.tsx      # createShadowRoot + ReactDOM root + MutationObserver
├── plugins/           # Per-app modules (Teams, Outlook, …)
│   ├── types.ts       # Plugin contract (the boundary)
│   ├── registry.ts    # Node-safe metadata array (manifest + sidepanel use this)
│   ├── registry-runtime.ts  # Full Plugin instances (content scripts only)
│   ├── teams.meta.ts / teams.ts
│   └── outlook.meta.ts / outlook.ts
├── entries/           # Thin per-plugin content-script shells (toggle on/off)
├── sidepanel/         # Launcher React app
├── background/        # Service worker + router
└── shared/            # messages.ts (typed message bus)
```

**The boundary**: `src/core/` knows nothing about specific apps. Adding a new app = create `<id>.meta.ts`, `<id>.ts`, `<id>.content.ts`, add to `registry.ts` + `registry-runtime.ts`. **Zero edits under `core/` or `sidepanel/`.** If you need to change `core/` to make a plugin work, the contract is wrong — fix the contract in `types.ts`.

**Metadata vs runtime split**: `*.meta.ts` files are Node-safe (no DOM imports). They're imported by the background service worker, sidepanel, `manifest.config.ts`, and `scripts/gen-rules.ts`. Full `Plugin` instances (with DOM behavior) live in `<id>.ts` and are imported only by content-script entries.

## Core principles

### SOLID

- **Single responsibility**: each file/hook/component does one thing. `useSwipe` is a pure pointer state machine; it knows nothing about plugins or queue state. `useTriageQueue` owns queue advancement; it doesn't render. Components render; they don't fetch.
- **Open/closed**: `core/` is closed to per-app modification. Per-app behavior extends through the `Plugin` interface and per-item `UnreadItem` overrides — never by adding `if (plugin.id === 'outlook') …` in core.
- **Liskov**: any `Plugin` substitutable for any other. The contract in `src/plugins/types.ts` is the only thing core may rely on.
- **Interface segregation**: `PluginMetadata` (Node-safe) is separate from `PluginBehavior` (DOM-bound). Background imports metadata only — no DOM types leak into the service worker.
- **Dependency inversion**: `Overlay` depends on the abstract `Plugin` interface, not concrete `teams` or `outlook` modules. Content-script entries inject the concrete plugin.

### KISS

- Prefer simple solutions over clever ones.
- No premature abstraction. Wait for the rule of three before extracting.
- If a hook or component starts to feel complex, decompose before it grows.
- **If you deviate from simplicity, say so in the PR/commit and explain why.**

### Small files (<500 LOC)

- Hard cap: 500 lines per file. Most files in this repo are under 200.
- A file approaching the cap is a smell. Split by:
  - **Components** → sub-components, hooks, presentational primitives.
  - **Hooks** → smaller composable hooks; one concern per hook.
  - **Plugins** → split scrape, actions, and selectors into helpers in the same file or a sibling.
- Exceptions exist (e.g. a single CSS file with all overlay styles), but prefer small.

### TDD when possible

- For pure logic (state machines, scrapers, parsers, helpers): **write the test first**, then the implementation.
- For React components and hooks: tests are still required but may follow implementation since the API often shapes itself during the first render.
- For DOM scrapers: capture a real fixture (`tests/fixtures/<plugin>-unread.html`) BEFORE writing the scraper. The fixture is the spec.
- TDD is a tool, not a religion — if a one-line type fix doesn't need a test, skip it. Use judgment.

### Isolated unit tests with high coverage

- Each file under test has a sibling test in `tests/<area>/<file>.test.ts(x)`.
- **Isolated**: a unit test for `useSwipe` does not render a Card. A test for `findPluginByUrl` does not boot React. Mock at the boundary (chrome APIs are mocked once in `tests/setup.ts`).
- **High coverage** on:
  - Plugin scrapers (every selector path: empty doc, missing list, valid list, virtualized rows, detached items).
  - State machines (`useSwipe`: drag-not-past-threshold, drag-past-left, drag-past-right, pointer-cancel mid-drag, disabled).
  - Queue logic (`useTriageQueue`: empty, ready, error, advance, action firing).
  - Background router (URL matching, auth-redirect simulation, sendOrInject fallback).
- Coverage isn't measured by a number — it's measured by "if this breaks, will a test catch it before the user does?"

## Coding standards

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. These are non-negotiable.
- **No `any`** in committed code. Use `unknown` + narrowing.
- For chrome API quirks where `@types/chrome` overloads confuse the type system in tests, cast spy returns with `as never` rather than `any`.
- Discriminated unions over boolean flags (see `src/shared/messages.ts`).

### React

- Function components only. Hooks for state and effects.
- One `useEffect` per concern. If an effect mixes two concerns, split it.
- Refs for "current value without re-render" (see `queueRef` in `Overlay.tsx`).
- Don't `key` a subtree that contains a stateful child you want to keep alive (we learned this with the iframe re-mount bug — see `Card.tsx`).

### CSS

- Overlay styles are scoped to the shadow root via `?raw` import + `<style>` injection. **No global CSS leakage** from the overlay.
- Sidepanel styles are normal CSS in `src/sidepanel/styles.css`.
- Use CSS custom properties for plugin-driven values (`--fs-accent`, `--fs-card-w`, `--fs-card-h`).

### Naming

- Filenames: kebab-case for plain `.ts`, PascalCase for React components.
- Type names: PascalCase. Interface names don't get an `I` prefix.
- Plugin ids: lowercase single word (`teams`, `outlook`, `gmail`).
- Internal code stays neutral — no `fs` / `nullify` strings sprinkled through logic.

## Plugin contract

The whole system pivots on `src/plugins/types.ts`. Read it first.

- `PluginMetadata` — Node-safe. id, label, iconPath, theme, matches, iframeUrl, headerStripDomains, optional swipeLabels + cardSize.
- `PluginBehavior` — DOM-bound. waitForReady, scrapeUnread, openItem?, actionLeft?, actionRight?.
- `UnreadItem` — id, name, optional preview, `resolve(doc)` re-resolver. Per-item overrides for kind, action labels, action functions, action hint, skip label.

Per-item overrides take precedence over plugin defaults — that's how Outlook calendar invites get Accept/Decline buttons while regular emails get Archive/Keep.

**Rules**:
- `scrapeUnread` returns `[]` on miss. Never throw.
- `UnreadItem.resolve` returns `null` when the element is gone. Throw `ItemDetachedError` from actions if you need the element and it's null.
- Validators in `types.ts` (`validatePluginMetadata`) are the single source of truth — `gen-rules.ts` and `registry.ts` both call this one validator.

## Workflow

### Running

```sh
cd extension
npm install
npm run dev      # Vite + HMR for sidepanel/background; content scripts need tab refresh
npm run build    # production build → extension/dist/
```

Load `extension/dist/` unpacked at `chrome://extensions/`.

### Checks (must pass before commit)

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint flat config
npm run test        # vitest run
npm run build       # CRXJS build
```

Pre-commit hook (husky + lint-staged) runs typecheck + eslint + prettier on staged files.

### Adding a new plugin

See `extension/README.md` for the full step-by-step. Summary:

1. `src/plugins/<id>.meta.ts` — Node-safe metadata.
2. `src/plugins/<id>.ts` — DOM-bound behavior.
3. `src/entries/<id>.content.ts` — copy from `teams.content.ts`, change two imports.
4. `public/icons/<id>.png`.
5. Add to both arrays in `registry.ts` (metadata) and `registry-runtime.ts` (full plugin).
6. Capture `tests/fixtures/<id>-unread.html` from the live DOM.
7. Write `tests/plugins/<id>.test.ts` mirroring `teams.test.ts`.
8. `npm run build` — manifest, rules, sidepanel tile auto-update.

### Modifying scrapers

Selectors decay. When a scraper breaks:

1. Open the live app via Playwright (or DevTools) and capture a fresh fixture.
2. Update `tests/fixtures/<plugin>-unread.html`.
3. Update the scraper to satisfy the test.
4. Run `npm run test` — the fixture test should pass.

Never patch a scraper without a fresh fixture. The fixture is the spec.

## Task management

`.todo/` directory at the repo root. Follow the `tasks` skill (see `.config/dotfiles/opencode/skills/tasks/`):

- `.todo/backlog/` — standalone tasks.
- `.todo/US-<name>/` — user stories with `main.md` + per-task files.
- `.todo/done/` — mirrors source structure once tasks ship.

Tasks must have testable acceptance criteria. If you can't describe how to verify a task is done, push back before starting.

## Commit guidelines

- Imperative present tense, lowercase first word: `add outlook plugin`, `fix iframe ready detection`, `core: smoother card entrance`.
- Body explains the **why**, not the **what**. Code shows what.
- One logical change per commit. If your diff covers two unrelated concerns, split.
- Don't commit until `typecheck && lint && test && build` all pass.
- Don't commit `dist/` (gitignored). Don't commit `public/rules.json` (regenerated on every build).

## Things to never do

- Add `if (plugin.id === '…')` outside `src/plugins/<id>.ts`. Extend the contract instead.
- Reach into a plugin's DOM behavior from `core/` or `sidepanel/`. Use the contract.
- Use `any` in committed code.
- Use `console.log` for production diagnostics. `console.warn`/`console.error` are fine for actual problems.
- Skip the regression check on Teams after any `core/` change. Teams must keep working.
- Mutate `UnreadItem` after scrape. Items are immutable snapshots; per-item state lives in the queue.

## When in doubt

- **Look at how Teams does it**. The Teams plugin is the canonical example.
- **Look at how Outlook does it for plugins that need richer behavior** (per-item action overrides, kind tagging, custom card size).
- **Read `src/plugins/types.ts`**. The contract is short and the JSDoc is the spec.
- **Ask**, don't guess at product behavior. Selector choices are technical; UX choices need the user.
