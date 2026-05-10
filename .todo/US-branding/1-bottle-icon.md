# Create ketchup bottle SVG icon + toolbar PNGs

## Context

Ketchup has no logo -- just a `✦` Unicode glyph. This task creates the brand mark: a simplified ketchup bottle SVG that works from 16px (toolbar) to 128px (Chrome Web Store).

**Value delivered**: The extension gets a recognizable icon in the Chrome toolbar and extension management page.

## Related Files

- `extension/public/icons/icon16.png` (replace)
- `extension/public/icons/icon48.png` (replace)
- `extension/public/icons/icon128.png` (replace)
- `extension/public/icons/ketchup.svg` (new -- source SVG)
- `extension/manifest.config.ts` (may need icon path updates if switching to SVG)

## Dependencies

- None (this is the first task)

## Acceptance Criteria

- [ ] `extension/public/icons/ketchup.svg` exists with a clean ketchup-bottle silhouette
- [ ] The SVG is a simple shape (few paths, no gradients, no text elements, no effects)
- [ ] The bottle shape is recognizable at 16px -- test by viewing at actual size
- [ ] Brand red `#D94030` fill on transparent background
- [ ] `icon16.png`, `icon48.png`, `icon128.png` are regenerated from the SVG at their respective sizes
- [ ] `manifest.config.ts` icon references still work after the file replacement
- [ ] `npm run build` succeeds and the icons appear in `dist/`

## Verification

- **Ad-hoc**: Open the SVG in a browser, verify the bottle shape is clear. Check the PNGs at actual pixel size. Run `npm run build` and confirm icons in dist.

## Notes

- The SVG is the app's own brand mark -- do NOT source from thesvg.org (that's for third-party brand icons).
- Design: classic ketchup bottle silhouette -- narrow neck tapering to a wider body, small cap on top. Think Heinz bottle shape but simplified to pure geometry.
- Keep the SVG viewport/viewBox consistent so it scales cleanly.
