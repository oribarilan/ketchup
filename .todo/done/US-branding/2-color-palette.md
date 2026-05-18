# Update color palette to warm ketchup theme

## Context

The sidepanel and overlay use a neutral gray palette with no brand color. This task introduces the warm ketchup-red palette across both surfaces.

**Value delivered**: The extension feels intentionally branded with warm, inviting colors instead of generic grays.

## Related Files

- `extension/src/sidepanel/styles.css` (update CSS custom properties)
- `extension/src/core/styles/overlay.css` (update `--ketchup-accent` fallback)

## Dependencies

- None (independent of the icon task)

## Acceptance Criteria

- [x] Sidepanel light mode uses warm cream background `#FFF8F0`, card bg `#FFF3EB`, warm muted gray `#8B7E74`
- [x] Sidepanel dark mode uses warm dark `#1E1A18`, card bg `#2A2420`, warm muted `#9C8E82`
- [x] Sidepanel buttons use brand red `#D94030` (light) / `#E04A3A` (dark) with white text
- [x] Overlay `--ketchup-accent` fallback in `:host` changes from `#6264a7` to `#D94030`
- [x] Light and dark mode both look intentional (no clashing warm/cool tones)
- [x] Plugin-specific accent overrides (Teams purple, Outlook blue) still work at runtime
- [x] `npm run build` succeeds

## Verification

- **Ad-hoc**: Open sidepanel in Chrome, toggle system dark/light mode, verify colors. Open an Outlook/Teams tab overlay and confirm plugin accent still overrides the default.

## Notes

- Only touch the CSS custom property values -- don't restructure the CSS or rename properties.
- The overlay action buttons (green Archive, blue Keep) stay as-is -- those are semantic, not brand.
