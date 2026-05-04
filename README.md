# fs

Swipe-card triage for unread items across web apps. A browser extension that drops a Tinder-style overlay into Microsoft Teams, Outlook, and (soon) more — left-swipe to mark read, right-swipe to keep, keyboard shortcuts throughout.

The extension lives in [`extension/`](extension/). See [`extension/README.md`](extension/README.md) for setup, dev workflow, and the "add a new plugin" guide.

## Quick start

```sh
cd extension
npm install
npm run build
```

Then load `extension/dist/` unpacked in Chrome (`chrome://extensions/` → Developer mode → Load unpacked).

## Why

Auth (passkeys, MFA, SSO, conditional access) must run in the user's real browser session — Electron and PWAs can't satisfy Microsoft auth or strip third-party CSP headers. A Manifest V3 extension with a same-origin in-card iframe is the only embedding strategy that holds up in production.

## Architecture at a glance

- **Plugin registry** drives everything: manifest, headers, sidepanel tiles, content-script registration.
- **Triage runs in the app's own tab** via a React overlay mounted into shadow DOM.
- **Sidepanel launcher** opens or focuses the right tab and toggles fs on. It cannot host the triage UI itself (cross-origin).
- **TypeScript strict, Vite + CRXJS, Vitest + happy-dom, ESLint flat config + Prettier, husky + lint-staged.**

## Repo layout

```
.
├── extension/        # The fs extension (TypeScript + React + Vite)
└── electron-app/     # Earlier Electron prototype, kept for reference (not maintained)
```

## History

Originally shipped as `Nullify` — a Chrome extension for Microsoft Teams only. Renamed to `fs` in v0.4.0 alongside the rewrite to TypeScript + React + a multi-app plugin architecture.
