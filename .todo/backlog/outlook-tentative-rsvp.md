# outlook-tentative-rsvp

## Context

When fs encounters a calendar invite in Outlook, the Tinder-style swipe maps to **Accept** (right) and **Decline** (left). The third RSVP option, **Tentative**, was deferred from the original calendar-RSVP work — the binary swipe model doesn't have an obvious slot for a third action.

This task adds Tentative support. The user picks the UX they prefer in the brainstorming step.

**Value delivered**: Outlook calendar invites can be triaged with full RSVP semantics (Accept / Decline / Tentative) without leaving the fs overlay.

## Related Files

- `extension/src/plugins/outlook.ts` — meeting item per-item action overrides
- `extension/src/core/components/Card.tsx` — swipe gestures and chrome
- `extension/src/core/components/Controls.tsx` — bottom button bar
- `extension/src/plugins/types.ts` — `UnreadItem` per-item action shape
- `extension/tests/plugins/outlook.test.ts`

## Dependencies

- None (the calendar-RSVP groundwork is already shipped — per-item actions on `UnreadItem`).

## Design (to brainstorm before implementing)

Three options carried over from the original discussion:

1. **Third button** — small "Tentative" button in the bottom bar, only visible when `item.kind === 'meeting'`. Easiest to ship; doesn't muddy the swipe metaphor.
2. **Up-swipe gesture** — pure-Tinder feel; needs `useSwipe` extended to handle vertical, plus visual hint label.
3. **Modifier + swipe** — hold Shift while swiping right = Tentative. Discoverability is bad; not recommended.

Pick one in the brainstorming session before coding.

## Acceptance Criteria

- [ ] User can mark an Outlook calendar invite as Tentative from inside the fs overlay (no falling back to native Outlook UI).
- [ ] The Tentative path uses the same in-iframe DOM driver as Accept/Decline (open RSVP menu → click "Tentative" menu item by aria-label `"Tentatively accept the meeting"` or text match).
- [ ] Non-meeting items in Outlook are unaffected — keep showing Archive / Keep.
- [ ] `tests/plugins/outlook.test.ts` covers the Tentative flow against a fixture.
- [ ] If chosen design is up-swipe, `tests/hooks/useSwipe.test.ts` covers the new vertical gesture (drag-up past threshold fires onUp; cancellation snaps back).

## Verification

- **Automated** (preferred):
  - Add `outlook.test.ts` case for `actionTentative` on a fixture with a meeting row — assert RSVP button click + correct menu item click.
  - If gesture-based: `useSwipe.test.ts` cases for up-swipe.
- **Ad-hoc**:
  - On `outlook.cloud.microsoft/mail/`, encounter a calendar invite, trigger Tentative, confirm in Outlook (event status changes to "Tentatively accepted" in calendar view).

## Notes

- Outlook's RSVP menu was inspected live (2026-05) — Accept/Decline are exposed as `[role="menuitem"]` with aria-labels `"Accept the meeting"` / `"Decline the meeting"`. Tentative likely follows the same pattern (`"Tentatively accept the meeting"`); confirm via Playwright snapshot before committing.
- Whichever UX wins, the gesture layer should NOT be plugin-aware: per-item action overrides on `UnreadItem` already let Outlook customize Card behavior without touching `src/core/`.
