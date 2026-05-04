# mark-all-as-read-bulk

## Context

When ketchup surfaces a backlog with thousands of unread items (Outlook user with 3,455 unread, Teams user with hundreds of channel mentions), swiping through one-by-one is impractical even with continuous fetching. The user typically wants a way to declare bankruptcy: "I'm not reading these — mark everything as read/archived".

This task adds a bulk "mark all" action that's only offered when the backlog is large enough to be intimidating, so it doesn't clutter the UI for users with normal inboxes.

**Value delivered**: a one-click escape valve for users buried in unread, without forcing them through an artificial swipe-by-swipe ritual.

## Related Files

- `extension/src/plugins/types.ts` — `PluginBehavior` contract
- `extension/src/plugins/teams.ts` / `outlook.ts` — bulk action implementations
- `extension/src/core/components/Overlay.tsx` — where the offer surfaces
- `extension/src/core/components/Controls.tsx` — UI for the bulk action
- `extension/tests/plugins/teams.test.ts` / `outlook.test.ts`

## Dependencies

- None. Builds on the existing per-plugin action contract.

## Design (to brainstorm before implementing)

**When to offer the bulk action:**
- Threshold-driven: show a "Mark all as read" CTA when `getTotalUnread > 100` (or pluginMeta-configurable).
- Or always available behind a less prominent control (top-bar overflow menu, keyboard `Cmd+Shift+A`).

**What "mark all" actually does:**
- Outlook: select all visible + use shortcut `Ctrl+A` then `Q` (mark read). Or the toolbar "Select all" + "Mark as read".
- Teams: there's a "Mark all as read" option in the context menu of the Chat node. Right-click the Chat rail and click it.

**UX placement options** (pick one in the brainstorming session before coding):
1. **Subtle CTA in the progress badge area** — small "Mark all 3,455 as read" link below the inbox-total subtext. Clicked → confirmation prompt → fires the bulk action → ketchup closes (nothing left to triage).
2. **Top-bar overflow menu** — three-dot menu in the card's top bar with "Mark all as read", "Snooze for now", etc.
3. **Done-state CTA** — only after the user has triaged some items, offer "Mark remaining N as read and finish" on the done screen.

Confirmation step is not optional — bulk read is destructive and must require a deliberate second click.

## Acceptance Criteria

- [ ] `PluginBehavior` exposes an optional `markAllRead?(doc): Promise<{ count: number }>` (or equivalent — finalize during brainstorming).
- [ ] Outlook implements it via the in-iframe Select-All + Mark-as-Read flow (verify with Playwright before coding the actual selectors).
- [ ] Teams implements it via the chat-tree "Mark all as read" context-menu action.
- [ ] UI offers the bulk action only when the threshold is met (or always behind a discoverable control — pick one).
- [ ] User must confirm before the action fires (a second click; not a browser `confirm()` modal).
- [ ] After the action succeeds, ketchup closes (or shows an "All caught up" state) — no stale cards left in the queue.
- [ ] If the action partially succeeds (e.g. only the visible batch was actually marked), the UI reflects the realistic count and surfaces a follow-up.
- [ ] Tests cover: action wired correctly per plugin (mocked DOM), threshold gating in `<Overlay>`, confirmation step requires the second click.

## Verification

- **Automated** (preferred):
  - `tests/plugins/<plugin>.test.ts` — fixture rows + invoke `markAllRead`, assert the right DOM events / clicks fire (e.g. for Outlook: `Ctrl+A` + `Q` keystrokes dispatched).
  - `tests/components/Overlay.test.tsx` — render with `totalUnread > threshold` mock plugin, assert CTA visible; below threshold → CTA hidden; click triggers a confirmation step before plugin call.
- **Ad-hoc** (manual smoke after wiring):
  - Outlook: trigger the action against a test inbox with 100+ unread; confirm folder badge drops to 0 (or near 0) and inbox shows everything as read.
  - Teams: trigger against a chat list with multiple unread; confirm the rail badge drops to 0.

## Notes

- Outlook's bulk-read action is reversible (Ctrl+Z within Outlook) for a short window — mention this in the confirmation prompt to lower the stakes.
- Teams' "Mark all as read" only affects the currently-filtered scope (Chats vs Channels); be explicit in the CTA label about which scope is targeted.
- This task is intentionally scoped narrowly. **Do not bundle** with related ideas like "snooze all" or "archive everything older than 30 days" — those are separate backlog items.
- Open question for brainstorming: should the bulk action skip pinned/important items? Probably yes for safety; needs a per-plugin "isProtected(item)" predicate or filter.
