# 06 — README and Cleanup

## Goal

Ship documentation. Verify the legacy artifacts are gone. Update the repo root README to reflect the rename from Nullify to fs.

This is the "make the project legible to a new contributor" task.

## Scope

### Create

- `extension/README.md` — full developer README. Sections:

  1. **What fs is** — one paragraph: TypeScript browser extension, swipe-card triage for unread items, plugin architecture, currently supports Teams + Outlook.

  2. **Install dependencies**
     ```sh
     cd extension && npm install
     ```

  3. **Development**
     ```sh
     npm run dev
     ```
     Then load `extension/dist/` unpacked in Chrome. Sidepanel and background hot-reload; content scripts require a tab refresh after edits.

  4. **Build for distribution**
     ```sh
     npm run build
     ```
     Output in `dist/`.

  5. **Load unpacked in Chrome**
     - `chrome://extensions/` → Developer mode on → Load unpacked → select `extension/dist/`.

  6. **Run checks**
     ```sh
     npm run typecheck
     npm run lint
     npm run test
     npm run format
     ```

  7. **Project structure** — annotated tree showing `src/core/`, `src/plugins/`, `src/entries/`, `src/sidepanel/`, `src/background/`, `src/shared/`, `tests/`.

  8. **Adding a new plugin** — step-by-step:
     1. Create `src/plugins/<id>.meta.ts` exporting a `PluginMetadata` (Node-safe, no DOM imports).
     2. Create `src/plugins/<id>.ts` exporting a full `Plugin` (spreads metadata + adds `waitForReady`, `scrapeUnread`, `markRead`, `openItem` behavior). Link to `src/plugins/types.ts`.
     3. Create `src/entries/<id>.content.ts` (copy from `teams.content.ts`, change two imports).
     4. Add icon to `public/icons/<id>.png`.
     5. Add both metadata and full plugin to `PLUGIN_METADATA` and `PLUGINS` in `src/plugins/registry.ts`.
     6. Capture an unread-list DOM fixture to `tests/fixtures/<id>-unread.html`.
     7. Write `tests/plugins/<id>.test.ts` modelled on `teams.test.ts` (cover `scrapeUnread` + `resolve` round-trip + `markRead` if implemented).
     8. `npm run build` — manifest, rules, sidepanel tile all auto-update.
     Include a complete minimal plugin code template (both `.meta.ts` and `.ts`) in a fenced block.

  9. **Plugin contract reference** — table of every `Plugin` field with type, required/optional, purpose. Mirrors `src/plugins/types.ts` (link to source).

  10. **How the architecture works** — short explanation:
      - Triage runs in the app's tab via a content script + shadow-DOM React overlay.
      - The card's iframe points at the same origin as the parent so DOM access works.
      - `declarativeNetRequest` strips `X-Frame-Options` and CSP headers for the iframe.
      - The sidepanel is a launcher; it cannot host triage because it's on the extension origin (cross-origin iframe).
      - The registry drives manifest, rules, content-script registration, and sidepanel tiles — single source of truth.

  11. **Known limitations** — selector decay, signed-in-only iframe access, no cross-tab unread queue (yet), Chrome-only (Manifest V3 + sidepanel API).

  12. **Troubleshooting** — common issues:
      - "Iframe is blank" → header strip rule missing for plugin's domains.
      - "scrapeUnread returns empty" → selector decay; update `src/plugins/<id>.ts`.
      - "Cannot access contentDocument" → cross-origin redirect; check `iframeUrl` and signed-in state.
      - HMR weirdness in content scripts → refresh the app tab.

### Modify

- Repo root `README.md` — rewrite to reflect `fs`:
  - Remove all references to `Nullify`, `Zero`, and the old single-app framing.
  - One-paragraph project description.
  - Link to `extension/README.md` for setup.
  - Keep any other top-level repo notes that aren't extension-specific.

- `extension/.gitignore` — confirm it includes:
  ```
  node_modules/
  dist/
  .vite/
  coverage/
  .DS_Store
  ```

### Delete

If the working tree still contains any of these (from the v0.3.1 baseline), remove them now. They live in git history (commit `2345526`) for reference.

- `extension/content.js` (root-level, pre-Vite)
- `extension/background.js` (root-level, pre-Vite)
- `extension/manifest.json` (root-level — replaced by generated `dist/manifest.json`)
- `extension/rules.json` (root-level — replaced by `public/rules.json`)
- Any other stale artifacts not under `src/`, `public/`, `tests/`, `scripts/`, or config files.

## Implementation Notes

- **Don't write a tutorial.** README is reference material for someone who already knows TypeScript and Chrome extensions. Skip "what is npm" preambles.
- **Greppable check for stale strings:** `git grep -i "nullify\|zero" -- '*.md'` should return only intentional historical mentions (e.g., a "history" section noting the rename). `git grep -i "nullify\|zero" -- 'extension/src'` should return zero hits.
- **Plugin template in README:** keep it short enough to copy-paste into a new file with minimal edits. The reader should be able to follow the "add a new plugin" steps and have a working stub in <10 minutes.
- **Don't document deferred features.** The known-limitations section should mention them in passing but not over-explain. Future-tense language ("planned", "will support") invites scope creep — use present-tense factual statements ("v0.4.0 supports Teams and Outlook only").
- **Markdown style:** Prettier formats markdown too (with `prose-wrap: preserve` or similar). Make sure README passes `npm run format -- --check`.

## Verification

- [ ] `extension/README.md` exists and is well-formed (preview renders correctly in GitHub or VS Code).
- [ ] Repo root `README.md` updated; no stale `Nullify` / `Zero` references in non-historical contexts.
- [ ] `git grep -i "nullify\|zero" -- 'extension/src/**/*.ts' 'extension/src/**/*.tsx'` returns no hits.
- [ ] Legacy root-level extension files are deleted from the working tree (still present in git history).
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` all pass clean.
- [ ] **Final manual smoke pass against the full DoD from main.md:**
  - Toolbar click on Teams → overlay works, swipe + keyboard work, mark-read works.
  - Toolbar click on Outlook → overlay works, swipe + keyboard work, mark-read works.
  - Toolbar click on unsupported tab → sidepanel opens.
  - Sidepanel shows Teams + Outlook tiles, "Open" buttons work, status badges accurate.
  - Pre-commit hook fires and blocks lint errors.
  - `manifest.json` `name` is `fs`, version `0.4.0`.
- [ ] Read the README out loud as if you'd never seen the project. Are the "add a new plugin" steps actually sufficient? If not, refine.

## Out of Scope

- Publishing to Chrome Web Store.
- CI workflow files (GitHub Actions, etc.).
- Contributing guidelines / code of conduct.
- Marketing / landing page.
- Screenshots / GIFs in README (nice-to-have, not blocking).
