# US-branding

## Goal

Give Ketchup a cohesive visual identity: a ketchup-bottle icon, a warm red color palette, and consistent branding across all four user-facing surfaces (toolbar icon, sidepanel, overlay top-bar, loading screen). The personality is playful and warm -- ketchup is fun, the tone is casual and inviting.

## Design Decisions

### Brand Color Palette

Primary accent: warm tomato red `#D94030`. Used for the brand mark, progress fills, buttons, and accent details.

Supporting palette (sidepanel CSS custom properties):
- Light mode: warm cream background `#FFF8F0`, dark foreground `#1a1a1a`, muted `#8B7E74` (warm gray), button bg `#D94030` with white text, card bg `#FFF3EB`
- Dark mode: warm dark `#1E1A18`, light foreground `#F5F0EB`, muted `#9C8E82`, button bg `#E04A3A` with white text, card bg `#2A2420`
- The overlay `--ketchup-accent` fallback changes from Teams purple to the brand red, so the spinner and progress bar default to brand color before any plugin overrides

### Logo / Icon

A simplified ketchup bottle SVG -- clean silhouette with the bottle's distinctive shape (narrow neck, wider body, small cap). Hand-crafted SVG, not sourced from thesvg.org (this is the app's own brand mark, not a third-party logo).

The icon must work at:
- 16px (toolbar -- recognizable silhouette)
- 48px (extension management page)
- 128px (Chrome Web Store)
- ~20px inline in the overlay top-bar
- ~28px in the loading screen
- ~24px in the sidepanel header

Mono-color: rendered in brand red on transparent bg for the toolbar PNGs, inline as a React SVG component for sidepanel/overlay/loading.

### Surface-by-surface plan

**Toolbar icons** (`public/icons/icon16.png`, `icon48.png`, `icon128.png`):
Replace the current generic PNGs with ketchup-bottle images. Source SVG at `public/icons/ketchup.svg`, then generate PNGs at 16/48/128 from it. Chrome MV3 manifest `icons` requires PNG, so the SVG is the source asset and PNGs are the shipped artifacts.

**Sidepanel header** (`App.tsx` + `styles.css`):
Replace the plain `<h1>Ketchup</h1>` with an inline bottle icon (React SVG component) + "Ketchup" wordmark. Apply the warm color palette to the sidepanel CSS custom properties. Button color shifts from neutral black to brand red.

**Overlay top-bar** (`Controls.tsx` + `overlay.css`):
Replace `✦ ketchup` text with a small inline bottle icon + "ketchup" wordmark. The dark bar stays (it needs to sit over any host app without clashing), but the icon adds brand recognition. The `--ketchup-accent` fallback in `:host` becomes `#D94030`.

**Loading screen** (`LoadingState.tsx` + `overlay.css`):
Replace `✦ ketchup` text with a larger bottle icon. Spinner border-top color already uses `--ketchup-accent`, so it picks up the new red automatically.

### What stays the same

- Plugin-specific accent colors (Teams purple, Outlook blue) still override `--ketchup-accent` at runtime for progress bars and per-plugin theming
- Plugin tile icons (`teams.svg`, `outlook.svg`) are unchanged -- they're third-party brand marks
- The overlay card styling, action buttons (green/blue), swipe labels, keycaps, backdrop -- all unchanged
- System font stack stays (no custom fonts)
- Shadow DOM scoping model unchanged

## Definition of Done

- [x] `public/icons/ketchup.svg` exists with a clean ketchup-bottle silhouette that reads at 16px
- [x] Toolbar PNGs (`icon16.png`, `icon48.png`, `icon128.png`) are generated from the bottle SVG in brand red on transparent bg
- [x] Sidepanel uses the warm color palette (light + dark mode) via updated CSS custom properties
- [x] Sidepanel header shows bottle icon + "Ketchup" wordmark (not plain text)
- [x] Overlay top-bar shows small bottle icon + "ketchup" text instead of `✦ ketchup`
- [x] Loading screen shows larger bottle icon instead of `✦ ketchup`
- [x] `--ketchup-accent` fallback in `overlay.css` is `#D94030` instead of `#6264a7`
- [x] `npm run typecheck && npm run lint && npm run test && npm run build` all pass
- [ ] Extension loads in Chrome with the new toolbar icon visible
- [ ] Sidepanel renders correctly in both light and dark mode

## Task Priority

1. `1-bottle-icon.md` -- create the SVG icon and generate toolbar PNGs (everything else depends on this)
2. `2-color-palette.md` -- update CSS custom properties across sidepanel and overlay
3. `3-surface-branding.md` -- wire the icon into all four surfaces (sidepanel, overlay top-bar, loading screen, toolbar)

## Cross-Cutting Concerns

- The bottle icon SVG should be a single-path or few-path design for simplicity and small file size. No gradients, no effects -- pure shape.
- For inline use in React components (overlay, sidepanel, loading), create a shared `KetchupIcon` React component that accepts `size` and `color` props. Place it in `src/core/components/KetchupIcon.tsx` -- this is a brand asset, not plugin-specific, so it lives in core.
- The sidepanel imports from `core/` are fine for the icon component since the sidepanel already imports from `plugins/registry.ts` which re-exports metadata. The icon is app infrastructure.
- Keep the existing `public/icons/teams.svg` and `outlook.svg` untouched.
- Don't introduce a CSS preprocessor or design token system. Plain CSS custom properties are enough.
