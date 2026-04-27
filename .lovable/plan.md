# Stages 3-5 — Recurring, Goals & PWA

Three remaining stages to finish Pursely. After this, the app is feature-complete.

## Stage 3 — Recurring bills & income streams

A "recurring rule" is something that auto-creates a transaction on a schedule (rent every month, payday every 4 weeks, gym fortnightly).

**`/recurring` page** — a tabbed view (Outgoing bills | Income streams) showing every rule with:
- Name, amount, frequency, next run date
- Pause/resume toggle
- Edit and delete
- Quick "Run now" button (creates the transaction immediately and rolls the next-run date forward)

**Add/Edit rule sheet** opened from a + button. Fields: name, kind (income/outgoing), amount, category, frequency (weekly / fortnightly / monthly / yearly), start date.

**Auto-running rules** — a daily scheduled job creates transactions for any rule whose `next_run` is today or earlier, then advances `next_run` by the frequency. Built as a TanStack server route at `/api/public/hooks/run-recurring` and triggered by a `pg_cron` job at 06:00 UTC daily. Logic runs server-side for every user in one pass (no per-user cron).

**Dashboard already shows** the next-7-days "Coming up" feed from these rules — it'll start lighting up immediately.

## Stage 4 — Savings goals

**`/goals` page** — grid of goal cards. Each card shows:
- Name, icon and brand colour
- Big progress ring (saved / target)
- Target date and a smart "save £X/month to hit it" hint
- Tap to open detail sheet

**Add/Edit goal sheet**: name, target amount, optional target date, colour and icon picker.

**Goal detail sheet**: progress ring, list of contributions, and an "Add contribution" form (amount, date, optional note). Each contribution writes to `goal_contributions` and the dashboard's goals widget reflects it in real time.

**Quick-add contribution** also available from the dashboard goals widget (tap a goal → add).

## Stage 5 — Mobile install (PWA-lite) & polish

A simple installable web app — no service worker, no offline cache (those break Lovable's preview iframe). Just enough so iPhone/Android users can "Add to Home Screen" and get a full-screen, native-feeling app.

- `public/manifest.webmanifest` with `display: standalone`, theme/background colour matching brand, name "Pursely", short_name "Pursely"
- App icons (192 / 512 / maskable / Apple touch)
- iOS-specific meta tags (`apple-mobile-web-app-capable`, status bar style, splash colour)
- Manifest + meta wired into `__root.tsx`

**Install prompt UX**: small "Install Pursely" banner on the dashboard for eligible browsers (uses `beforeinstallprompt`); on iOS Safari, a one-time tooltip explaining "Share → Add to Home Screen".

**Polish pass**:
- Empty-state illustrations across goals/recurring/activity
- Settings page: display name, sign out, theme toggle (light/dark/system), delete account confirmation
- Edit/delete on individual transactions in `/transactions`
- Loading skeletons replacing the current "Loading…" text

## Technical details

**New files**
- `src/routes/_app.recurring.tsx` (replace placeholder) — list, pause toggle, run-now
- `src/components/RecurringSheet.tsx` — add/edit dialog
- `src/routes/_app.goals.tsx` (replace placeholder) — grid + add/edit/contribute
- `src/components/GoalSheet.tsx`, `src/components/ContributionSheet.tsx`
- `src/routes/api/public/hooks/run-recurring.ts` — server route processing all due rules
- `src/components/InstallPrompt.tsx` — beforeinstallprompt + iOS hint
- `public/manifest.webmanifest` and PWA icons in `public/icons/`

**Server route logic** (`run-recurring.ts`)
1. Service-role client selects all rules where `paused = false` and `next_run <= today`
2. For each rule: insert a row into `transactions` (with `recurring_rule_id` set), then advance `next_run` by frequency (`+7d` / `+14d` / `+1 month` / `+1 year`)
3. Idempotency guard: skip insert if a transaction with same `recurring_rule_id` and `occurred_on` already exists
4. Returns `{ processed: N }`

**Cron** — `pg_cron` job calls the route daily at 06:00 UTC. Set up via the insert tool (not migrations) since it embeds the URL and anon key.

**Frequency advance** — done in TypeScript using `date-fns` (already used by shadcn calendar) for safe month/year math.

**Realtime** — recurring rules and goal contributions tables are already covered by the dashboard channel; goals page subscribes to `goals` and `goal_contributions` directly.

**Validation** — every form uses zod with the same patterns as Stage 2 (positive amounts, length caps, trimmed strings).

**No new tables needed** — existing schema (`recurring_rules`, `goals`, `goal_contributions`) covers everything.

## What you'll be able to do at the end

- Log income, outgoings and shopping (done)
- See balance, charts, goals, upcoming bills update in real time (done)
- Set up recurring bills/income that auto-post each cycle
- Track savings goals with progress and contributions
- Install Pursely on your phone home screen and use it like a native app
