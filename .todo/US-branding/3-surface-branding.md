# Wire bottle icon into all branded surfaces

## Context

With the SVG icon created (task 1) and the color palette updated (task 2), this task wires the bottle icon into the four user-facing surfaces: sidepanel header, overlay top-bar, loading screen, and toolbar.

**Value delivered**: Consistent ketchup branding visible everywhere the user interacts with the extension.

## Related Files

- `extension/src/core/components/KetchupIcon.tsx` (new -- shared React SVG component)
- `extension/src/sidepanel/App.tsx` (update header)
- `extension/src/sidepanel/styles.css` (header styling for icon + wordmark)
- `extension/src/core/components/Controls.tsx` (update top-bar logo)
- `extension/src/core/components/states/LoadingState.tsx` (update loading logo)
- `extension/src/core/styles/overlay.css` (logo styling updates if needed)

## Dependencies

- `1-bottle-icon.md` (needs the SVG to exist)

## Acceptance Criteria

- [ ] `KetchupIcon.tsx` exists in `src/core/components/` with `size` and `color` props, renders the bottle SVG inline
- [ ] Sidepanel header: bottle icon (~24px) + "Ketchup" wordmark, replacing the plain `<h1>`
- [ ] Overlay top-bar: small bottle icon (~16px) + "ketchup" text, replacing `✦ ketchup`
- [ ] Loading screen: larger bottle icon (~28px), replacing `✦ ketchup`
- [ ] All surfaces render correctly in both light and dark mode
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` all pass
- [ ] No new imports from `core/` into `plugins/` (KetchupIcon stays in core)

## Verification

- **Ad-hoc**: Load the extension, open sidepanel, verify icon + wordmark. Open a Teams/Outlook tab, trigger overlay, verify top-bar icon. Check loading screen on slow connection or first load.
- **Automated**: existing tests should still pass (Controls, LoadingState tests don't assert on logo text content).

## Notes

- `KetchupIcon` inlines the SVG paths rather than importing the file -- this avoids an async load and keeps the icon crisp at any size.
- The sidepanel can import from `core/components/KetchupIcon` directly -- it's app infrastructure, not plugin-specific.
- Keep the dark top-bar background in the overlay -- the icon should be white/light on dark bar, matching the current text color.
