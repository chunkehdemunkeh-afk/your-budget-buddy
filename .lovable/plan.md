## Goal

Make it easier to navigate the "Week ahead" section on the dashboard by adding (1) a date picker to jump straight to any week, and (2) a toggle to switch the section between a weekly and a monthly view.

## Changes

### 1. Add a date jump (calendar) control to the Week ahead header

In `src/routes/_app.dashboard.tsx` → `WeekAheadSection`, add a small calendar button between the prev/next chevrons and the label.

- Use shadcn `Popover` + `Calendar` (`mode="single"`).
- When the user picks a date, compute which week (or month, see below) contains it and update `weekOffset` / `monthOffset` accordingly.
- A "Today" button inside the popover snaps back to offset 0.

### 2. Add a Week / Month toggle

Add a small segmented toggle ("Week" | "Month") in the section header.

- New state at the dashboard level: `viewMode: "week" | "month"` and `monthOffset: number` (alongside the existing `weekOffset`).
- Persist `viewMode` to `localStorage` so the user's preference sticks between visits.

### 3. Monthly view rendering

When `viewMode === "month"`:

- Header label shows the month (e.g. "Nov 2026") with prev/next stepping by one calendar month.
- Compute `startStr` = first day of month, `endStr` = last day of month.
- Reuse the existing `itemsByDay` logic but iterate every day in the month instead of a fixed 7.
- Group days into weeks (Mon–Sun rows) and render each week as a collapsible block:
  - Collapsed (default for non-current weeks): one row showing week range, net change, running balance.
  - Expanded: the same per-day cards already used in the weekly view.
  - The week containing today is expanded by default.
- Opening balance = balance at start of month; closing = opening + month net (using the same `computeWeekBalance`-style chaining, generalised to arbitrary ranges).

### 4. Generalise the balance helper

Refactor `computeWeekBalance` into `computeRangeBalance(startStr, endStr, ...)` so both weekly and monthly views share one implementation. The current `computeWeekBalance` becomes a thin wrapper that derives the range from `weekOffset`.

## Technical notes

- `Calendar` + `Popover` are already in `src/components/ui/`; no new dependencies.
- Remember `pointer-events-auto` on the `Calendar` className inside the popover (per project convention).
- Keep all date math in local time via `toLocalDate` / `toDateOnly` to avoid the BST/UTC issue called out in `CLAUDE.md`.
- `adjustedOccurrencesInRange` already supports arbitrary ranges, so projected recurring items work unchanged for monthly view.
- No DB or schema changes. No changes to the recurring engine or the weekend-adjust logic.

## Out of scope

- Year view, custom date ranges, or editing transactions from the monthly view (still tap-through as today).
- Changing how recurring rules fire.