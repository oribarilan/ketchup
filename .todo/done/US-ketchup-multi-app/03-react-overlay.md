# 03 — React Overlay

## Goal

Re-implement the overlay, swipe interaction, keyboard shortcuts, and loading/error/done states as **React components and hooks** mounted into a shadow DOM root inside the app tab. Delete `src/core/legacy.ts`. Add component and hook tests.

After this task: `src/core/` is idiomatic React, the swipe state machine is testable in isolation, and adding visual polish is a normal component-edit workflow rather than string-template surgery.

## Scope

### Create

- `extension/src/core/mount.ts`:
  ```ts
  export function mountOverlay(plugin: Plugin): { teardown(): void };
  ```
  Creates a `<div id="ketchup-root">` host on `document.body`, attaches `mode: 'open'` shadow root, injects scoped stylesheet, calls `ReactDOM.createRoot(shadowRoot).render(<Overlay plugin={plugin} onTeardown={...} />)`. Registers a `MutationObserver` on `document.body` — if the host element is removed by the host SPA's re-render, re-mount it. Teardown unmounts root, removes host element, disconnects observer, releases keyboard listeners.

- `extension/src/core/components/Overlay.tsx` — top-level component. Owns:
  - `useTriageQueue(plugin)` — fetches unread items via `plugin.scrapeUnread`, manages current index, exposes `current`, `advance`, `markCurrentRead`, `state` ('loading' | 'ready' | 'done' | 'error').
  - Renders `<LoadingState>`, `<ErrorState>`, `<DoneState>`, or `<Card>` based on state.
  - Theme via CSS custom property `--ketchup-accent` set from `plugin.theme.accent`.

- `extension/src/core/components/Card.tsx` — single swipeable card containing the iframe. Props: `item: UnreadItem`, `iframeUrl: string`, `labels: { left: string; right: string }`, `onSwipeLeft()`, `onSwipeRight()`. Uses `useSwipe` hook for pointer + animation. Renders the iframe and the two action buttons. Header shows `item.name` and optional `item.preview`.

- `extension/src/core/components/Controls.tsx` — left/right buttons + position counter ("3 of 8"). Pure presentational.

- `extension/src/core/components/states/LoadingState.tsx`, `ErrorState.tsx`, `DoneState.tsx` — copy the visual styling from v0.3.1's strings. `ErrorState` accepts an `error: Error` prop and a `onRetry()` callback.

- `extension/src/core/hooks/useSwipe.ts`:
  ```ts
  export function useSwipe(opts: {
    onLeft(): void;
    onRight(): void;
    threshold?: number;
  }): {
    bind: PointerEventHandlers;
    style: CSSProperties;  // transform/transition for the animated card
    isAnimating: boolean;
  };
  ```
  Pure state machine over pointer events; testable without rendering. Animation uses CSS transitions driven by inline style.

- `extension/src/core/hooks/useKeyboard.ts` — registers `keydown` on `window` AND injects a listener inside `iframe.contentDocument` so hotkeys work whether focus is on the page or in the iframe. Returns nothing (effects only). Cleanup removes both listeners.

- `extension/src/core/hooks/useTriageQueue.ts` — owns the queue state machine. On mount: calls `plugin.waitForReady(iframeDoc)`, then `plugin.scrapeUnread(iframeDoc)` **exactly once** (memoized for the activation lifetime — never re-scrapes on re-render). Coordinates with `useIframe` for iframe lifecycle. Before each `openItem`/`markRead` call, invokes `item.resolve(iframeDoc)`; if `null`, advances past the stale item and surfaces a one-line warning in dev console (skip silently in prod).

- `extension/src/core/hooks/useIframe.ts` — manages a single `<iframe>` element ref, navigates it to `plugin.iframeUrl`, waits for load, exposes `contentDocument`. Centralizes the same-origin access logic. On cross-origin redirect, exposes a typed error to bubble up to `ErrorState`. Implements bounded retry/backoff (poll every 200ms up to 10s) before giving up — covers Outlook auth-redirect settling.

- `extension/src/core/styles/overlay.css` — extracted from v0.3.1's CSS template. Imported as a raw string via `?raw` Vite import, then injected into the shadow root in `mount.ts`. All selectors scoped under shadow root, no global leakage.

- `extension/src/core/index.ts` — replace re-export from `legacy.ts` with:
  ```ts
  import { mountOverlay } from './mount';
  export const startTriage = mountOverlay;
  ```

### Delete

- `extension/src/core/legacy.ts`.

### Add tests

- `extension/tests/components/Card.test.tsx` — render `<Card>` with a fake item, simulate pointer drag past threshold, assert `onSwipeLeft` / `onSwipeRight` fire.
- `extension/tests/components/Overlay.test.tsx` — render `<Overlay>` with a mock plugin (`scrapeUnread` returns 3 items, `markRead` is a spy), assert loading → ready transition, advance through items via simulated swipes, **assert `markRead` invoked with each item on left-swipe**, done state at end. Also assert `Retry` button on `ErrorState` re-fires the load flow.
- `extension/tests/hooks/useSwipe.test.ts` — pure state machine test, no rendering. Drive pointer events through the returned `bind`, assert state transitions: drag-not-past-threshold (snaps back), drag-past-left (fires onLeft), drag-past-right (fires onRight), **pointer-cancel mid-drag (snaps back, no fire)**.
- `extension/tests/hooks/useIframe.test.ts` — mock iframe element. Test: load success exposes `contentDocument`; cross-origin throw triggers retry/backoff; retry budget exhausted exposes typed error.
- `extension/tests/core/mount.test.ts` — integration: `mountOverlay(mockPlugin)` creates host element + shadow root; `teardown()` removes host AND no keydown listeners remain on window (use `jest-dom`-style listener inspection or count via spy); re-mounting after teardown works without leaking; MutationObserver re-mounts host if removed externally.
- `extension/tests/integration/teams-baseline.test.ts` — **must continue passing unchanged from task 2.** Validates the `startTriage(plugin)` public contract survived the React rewrite.

## Implementation Notes

- **Shadow DOM is non-negotiable.** Teams and Outlook both inject aggressive global styles that will trash a non-shadow overlay. Use shadow root with all CSS scoped inside.
- **React 18 in shadow DOM:** event delegation works fine, but synthetic events for the iframe contents do NOT — that's why `useKeyboard` injects a real listener into `iframe.contentDocument`.
- **`useSwipe` must be pure-ish:** keep it dependent only on its options and internal state; no plugin coupling. This makes it testable and reusable.
- **No `any`.** Pointer event types are `React.PointerEvent<HTMLDivElement>`. `chrome.runtime.onMessage` callback args get a typed guard.
- **Animation timing:** match v0.3.1's swipe-out duration exactly. The user has the muscle memory; don't change it without explicit ask.
- **Strict mode double-mount:** dev StrictMode will mount components twice. `useIframe`, `useKeyboard`, `useTriageQueue` cleanups must be idempotent. Test by enabling StrictMode in the sidepanel app and watching for duplicate listeners in DevTools.
- **Testing Library + happy-dom:** PointerEvent isn't natively in happy-dom — polyfill in `tests/setup.ts` or use `fireEvent.pointerDown` with a manually constructed event. Document the choice.

## Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all pass.
- [ ] All component / hook tests pass; coverage on `useSwipe` includes: drag-not-past-threshold (snaps back), drag-past-left (fires onLeft), drag-past-right (fires onRight), pointer-cancel mid-drag (snaps back).
- [ ] `npm run build` succeeds.
- [ ] Loading `dist/` unpacked on Teams:
  - Overlay opens with same visual fidelity as v0.3.1 (compare side-by-side if possible).
  - Swipe (mouse) feels identical to v0.3.1.
  - Keyboard (`ArrowLeft`/`ArrowRight` or whatever v0.3.1 used) works both with focus on page and with focus inside iframe.
  - Loading state shows while iframe loads.
  - Error state shows if iframe fails to load (test by temporarily breaking `iframeUrl`).
  - Done state shows after last item.
  - Dark mode still works.
- [ ] Inspect the page DOM: there is exactly one `<div id="ketchup-root">` with a shadow root. No styles leak into the host page.
- [ ] `src/core/legacy.ts` is gone.

## Out of Scope

- Sidepanel launcher (task 4).
- Outlook (task 5).
- README (task 6).
- Settings/preferences UI.
- Per-plugin custom card templates (still one `<Card>` for all plugins).
