# 01 — Scaffold and Baseline

## Goal

Replace the legacy `extension/` tree with a fresh **TypeScript + React + Vite + @crxjs/vite-plugin** project. Port v0.3.1's working `content.js` verbatim into a single content-script entry so Teams keeps working from day 1. No refactoring of the Teams logic in this task — just rehouse it inside the new build pipeline with all tooling in place.

This task establishes the regression net (build, lint, typecheck, test, smoke) before any extraction work begins.

## Scope

### Create

- `extension/package.json` with deps:
  - runtime: `react`, `react-dom`
  - dev: `typescript`, `vite`, `@crxjs/vite-plugin` (**pin to a specific version**, e.g. `2.0.0-beta.x` — choose the latest with no open critical issues at scaffold time and lock it in `package.json` with `~` not `^`), `@types/react`, `@types/react-dom`, `@types/chrome`, `@vitejs/plugin-react`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `prettier`, `eslint-config-prettier`, `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `husky`, `lint-staged`, `tsx` (for running `gen-rules.ts` in Node)
  - scripts: `dev`, `build`, `preview`, `lint`, `format`, `typecheck`, `test`, `prepare` (husky)
- `extension/tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: bundler`, `jsx: react-jsx`, `target: ES2022`, `lib: [ES2022, DOM, DOM.Iterable]`, `types: [chrome, vitest/globals]`.
- `extension/vite.config.ts` — pulls `@crxjs/vite-plugin` with `manifest.config.ts`, plus `@vitejs/plugin-react`. Vitest config inline (`test: { environment: 'happy-dom', globals: true, setupFiles: ['./tests/setup.ts'] }`).
- `extension/manifest.config.ts` — minimal MV3 manifest using `defineManifest`. Hardcoded Teams matches for now (registry comes in task 2). Includes `side_panel.default_path`, `background.service_worker`, one content_scripts entry pointing at `src/entries/teams.content.ts`.
- `extension/eslint.config.js` — flat config with `@eslint/js` recommended, `typescript-eslint` recommended-type-checked, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier` last.
- `extension/.prettierrc` — single quotes, semi, trailing comma `all`, print width 100.
- `extension/.gitignore` — `dist/`, `node_modules/`, `.vite/`, `coverage/`.
- `extension/tests/setup.ts` — `import '@testing-library/jest-dom/vitest'`.
- `extension/.husky/pre-commit` — runs `lint-staged`.
- `extension/package.json` `lint-staged` block — typecheck + eslint + prettier on staged TS/TSX.
- `extension/src/entries/teams.content.ts` — wrap v0.3.1's `content.js` body verbatim, exported as a default IIFE-style activation. The runtime.onMessage `toggle` listener is preserved exactly. CSS string stays inline. **Zero refactoring** — this is a literal port so we can prove the new build pipeline produces a working extension.
- `extension/src/background/index.ts` — port v0.3.1's `background.js` to TS. Hardcoded Teams URL pattern check for now.
- `extension/src/sidepanel/index.html`, `src/sidepanel/main.tsx`, `src/sidepanel/App.tsx` — placeholder React app rendering "ketchup sidepanel — coming soon". Proves Vite multi-entry + React + sidepanel registration all work.
- `extension/public/rules.json` — copy v0.3.1's rules verbatim.
- `extension/public/icons/` — copy v0.3.1's icons.
- `extension/README.md` — minimal stub: install, dev, build, load unpacked. Full README comes in task 6.

### Delete (only after new build verified working)

- Legacy root-level files if present in working tree: `extension/content.js`, `extension/background.js`, `extension/manifest.json`, `extension/rules.json`. Keep them in git history (commit `2345526`).

## Implementation Notes

- **CRXJS risk:** `@crxjs/vite-plugin` v2 has been beta for a long time. Pin the exact version chosen, document it in `extension/README.md`, and capture any known workarounds inline. If during scaffolding it breaks badly (HMR loops, manifest race, content-script reload bugs) — fall back to **plain Vite + hand-written `manifest.json`** (~50 LOC). The fallback path: drop `@crxjs/vite-plugin`, add a `vite.config.ts` `build.rollupOptions.input` block with one entry per content script + sidepanel, copy a static `manifest.json` to `dist/` via `vite-plugin-static-copy`. Note in the task PR which path was taken.
- **CRXJS quirk:** content scripts under `src/` need to be referenced from `manifest.config.ts` with paths relative to project root. Verify `dist/` output has hashed bundle filenames and the manifest references them correctly.
- **HMR caveat:** content scripts in `@crxjs/vite-plugin` get HMR via injected client. The verbatim port may include event listeners that survive HMR reloads → expect duplicate listeners during dev. Acceptable for this task; cleanup is task 3's job once we own the React lifecycle.
- **Type assertions for chrome APIs:** `chrome.runtime.onMessage.addListener` callback `msg` is typed `unknown` until task 2 introduces the typed message bus. Use a narrow runtime check + type guard, no `any`.
- **No registry yet:** task 2 introduces `src/plugins/registry.ts`. For now `manifest.config.ts` and `rules.json` are hand-authored. This is intentional — splitting scaffolding from extraction keeps each task small and reviewable.
- **Husky setup:** run `npx husky init` once during scaffolding. The `prepare` script makes this idempotent for fresh clones.

## Verification

- [ ] `npm install` succeeds with no peer dependency warnings.
- [ ] `npm run typecheck` passes (zero errors).
- [ ] `npm run lint` passes (zero errors, zero warnings).
- [ ] `npm run test` passes (no tests yet; "no test files found" is acceptable, or include a trivial smoke test that asserts `1 + 1 === 2`).
- [ ] `npm run build` succeeds and produces `dist/manifest.json` referencing the Teams content script and the sidepanel page.
- [ ] Loading `extension/dist/` unpacked in Chrome:
  - Toolbar icon shows on Teams tab.
  - Clicking the icon on a signed-in Teams tab opens the v0.3.1 swipe-card overlay with unread chats.
  - Swipe (mouse + keyboard) works.
  - Dark mode renders correctly.
  - Sidepanel opens and shows the placeholder text when triggered (e.g., right-click → "Open side panel" or via Chrome's UI).
- [ ] `npm run dev` starts Vite, hot-reloads sidepanel changes when its source edits.
- [ ] Pre-commit hook fires on a test commit and blocks lint errors.

## Out of Scope

- Plugin contract / registry (task 2).
- React rewrite of overlay (task 3).
- Sidepanel launcher functionality (task 4).
- Outlook (task 5).
- Final README content (task 6).
