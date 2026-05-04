# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # start dev server
bun build        # production build
bun lint         # ESLint
bun format       # Prettier (writes in place)
```

No test suite is configured. There is no `bun test` command.

## Tooling note

`bun` is only available in the user's own terminal — it is NOT on Claude Code's PATH. Claude Code cannot run `bun dev`, `bun lint`, or `bun build` directly. Recommend the user run `! bun dev` themselves. `npx` also fails for lint/typecheck because node_modules are managed by bun.

## Git workflow

**Always `git pull --rebase` before making any changes.** The remote may have commits from Lovable or other sources that aren't local. Failing to pull first causes rejected pushes. When pushing, if the remote has diverged, stash any unstaged changes, pull with rebase, pop the stash, then push.

## What this app is

**Pursely** — a mobile-first PWA personal budget tracker. Users track income, outgoings, savings goals, and recurring bills. The app name in the codebase/branding is "Pursely"; the repo folder is named `your-budget-buddy`.

## Stack

- **TanStack Start** (SSR/full-stack React framework) + **TanStack Router** with file-based routing
- **Supabase** — Postgres + Auth + Realtime
- **Tailwind CSS v4** (uses `@theme inline` / CSS custom properties, no tailwind.config.js)
- **shadcn/ui** components in `src/components/ui/` — do not edit these manually; they are generated
- **Recharts** for charts, **Zod** for form validation, **Sonner** for toasts
- Deployed to **Cloudflare** via `@cloudflare/vite-plugin`

## Route structure

Routes live in `src/routes/` and are file-based (TanStack Router). The `routeTree.gen.ts` file is auto-generated — never edit it.

- `/` → `index.tsx` — landing/redirect
- `/auth` → email/password + Google OAuth sign-in
- `/_app` layout (`_app.tsx`) — auth-gated; wraps all app pages with `AuthProvider`, sidebar, mobile tab bar, and FAB
  - `/_app/dashboard` — monthly summary, charts, Week Ahead (navigable weekly view with opening/closing balances), goals preview, upcoming recurring
  - `/_app/transactions` — full transaction list
  - `/_app/goals` — savings goals + contributions
  - `/_app/recurring` — recurring rules management + one-off bills (tabs: Recurring Rules + One-Off Bills; ticking a one-off as paid creates an outgoing transaction)
  - `/_app/settings` — profile display name, household name/opening balance, member list + email invites
  - `/_app/insights` — financial health score, spending breakdown, food shopping tracker, 6-month trend, savings plan, smart suggestions
- `/add/income`, `/add/outgoing`, `/add/shopping` — full-screen add forms (not nested under `_app`)
- `/api/public/hooks/run-recurring` — server-side POST endpoint for cron; fires recurring rules and advances `next_run`

## Auth flow

- `_app.tsx` `beforeLoad` checks Supabase session and redirects to `/auth` if missing
- `AuthProvider` / `useAuth` hook provide `user`, `session`, `loading`, `signOut` to all app pages
- Google OAuth is handled via `@lovable.dev/cloud-auth-js` (`lovable.auth.signInWithOAuth`)

## Supabase clients

| Import | Where | RLS |
|--------|-------|-----|
| `@/integrations/supabase/client` | client-side everywhere | enforced |
| `@/integrations/supabase/client.server` (`supabaseAdmin`) | server routes only | **bypassed** |

Never import `client.server` in client-facing components.

`src/integrations/supabase/types.ts` is generated — prefer `bunx supabase gen types` after schema changes, but hand-editing the Row/Insert/Update blocks is acceptable when the CLI isn't available.

New tables must be created via the **Supabase SQL editor** (Dashboard → SQL Editor). Claude Code cannot run migrations directly. Always include `enable row level security` + a user-scoped policy when creating new tables.

## Database schema (key tables)

- `households` — `id`, `name`, `created_by`, `opening_balance` (numeric), `opening_balance_date` (date, nullable), `currency`. Opening balance and currency live here, **not** on `profiles`.
- `household_members` — `household_id`, `user_id`, `joined_at`. Join table; use `is_household_member()` security-definer function in RLS.
- `household_invites` — `id`, `household_id`, `email`, `invited_by`, `created_at`, `accepted_at`. Pending invites have `accepted_at IS NULL`; new signups auto-join if a matching invite exists.
- `transactions` — `kind: "income" | "outgoing" | "shopping"`, `household_id` (NOT NULL), linked to `categories` and optionally `recurring_rules`
- `recurring_rules` — `frequency: "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly"`, `next_run: date`, `paused: boolean`, `weekend_adjust: boolean` (default false), `household_id` (NOT NULL). The cron endpoint inserts a transaction and advances `next_run` each cycle. When `weekend_adjust` is true, dates falling on Saturday/Sunday are shifted: outgoing → following Monday, income → preceding Friday.
- `goals` + `goal_contributions` — savings goals with individual deposits; `goal_contributions` has `occurred_on: string` (YYYY-MM-DD) for date filtering; both have `household_id` (NOT NULL)
- `categories` — `"income" | "outgoing"`, hex `color`; `monthly_budget: number | null`; `household_id` (NOT NULL)
- `one_off_bills` — `name text`, `amount numeric` (required), `due_date date` (optional), `paid boolean` (default false), `paid_at timestamptz`, `household_id` (NOT NULL). Unpaid bills with a `due_date` appear in the Week Ahead as projected outgoings; ticking paid creates an outgoing transaction for today.
- `profiles` — per-user `display_name` only. Currency/opening balance **moved to `households`**.

## Domain rules

- **Food shopping** = `kind === "shopping"` transactions OR `kind === "outgoing"` transactions whose category name contains "food shopping" (case-insensitive). Family budget is £1,600/month (household of 6).
- **One-off bill payment** — marking a `one_off_bills` record as paid always inserts a `transactions` row (`kind: "outgoing"`, `occurred_on: today`). Never just flip `paid` without creating the transaction.
- **Balance excludes future transactions** — `calculateCurrentBalance` ignores transactions with `occurred_on > today`. Don't rely on future-dated transactions to affect the displayed balance.

## Key lib utilities

- `src/lib/balance.ts` — `calculateCurrentBalance({ openingBalance, openingBalanceDate, transactions, asOfDate? })` computes the true running balance, filtering out transactions before `openingBalanceDate` AND after `asOfDate` (defaults to today — future-dated transactions are excluded). Used on the dashboard.
- `src/lib/recurring.ts` — frequency helpers. **Always use `displayNextRun(rule.next_run, rule.frequency)` for display** — the raw `next_run` in the DB can be stale if the cron hasn't fired. If the rule has `weekend_adjust`, also pipe the result through `adjustForWeekend(dateStr, rule.kind)` before displaying. `toDateOnly(date)` converts a `Date` to a local `YYYY-MM-DD` string safely (avoids BST/UTC midnight issues). `adjustForWeekend(dateStr, kind)` shifts weekend dates to the nearest weekday.
- `src/lib/format.ts` — `formatMoney()`, `formatShortDate()`
- `src/hooks/useCategories.ts` — `useCategories()` hook; returns `{ categories, loading }` with a Realtime subscription. Use this instead of fetching categories manually inside pages.

## Multi-user households

All data tables (`transactions`, `recurring_rules`, `goals`, `goal_contributions`, `categories`, `shopping_items`, `one_off_bills`) have a `household_id` NOT NULL column. RLS is household-scoped via the `is_household_member(household_id, auth.uid())` security-definer function.

- `useAuth()` now exposes `householdId: string | null` (the user's household UUID). **All data queries must filter by `householdId`, not `user.id`.**
- New inserts must include `household_id: householdId`.
- Opening balance and currency are on the `households` row, not `profiles`. Read/write them via `supabase.from("households").select(...).eq("id", householdId)`.
- New signups auto-join an existing household if a matching pending invite exists (handled by `handle_new_user()` DB trigger).

## Data fetching pattern

Pages fetch directly from Supabase inside `useEffect` (no React Query). Most pages also subscribe to Supabase Realtime `postgres_changes` to re-fetch on mutations. There is a `mounted` flag guard to prevent state updates after unmount.

## Styling conventions

- Tailwind v4 with CSS custom properties defined in `src/styles.css`
- Custom design tokens: `--gradient-primary`, `--gradient-card`, `--shadow-glow`, `--shadow-soft`, `--color-success`, `--color-warning`
- Currency display uses `formatMoney()` from `src/lib/format.ts` — hardcoded GBP (£) symbol for now; the `profiles.currency` field exists but is not yet wired to formatting
- Amounts are stored as numbers in Postgres; always cast with `Number(t.amount)` after reading from Supabase
- Date strings: use `toDateOnly(new Date())` (from `src/lib/recurring.ts`) rather than `new Date().toISOString().slice(0, 10)` — the ISO version gives yesterday's date for UK users in BST
- When passing a `Map` as a prop to a child component that uses it in `useMemo`, memoize it in the parent: `useMemo(() => new Map(...), [deps])` — otherwise the child memo never caches
- `text-success` is a valid Tailwind utility (defined in styles.css); `text-warning` is NOT — use `text-[var(--color-warning)]` instead
- Adding a nav tab requires updating both the `tabs` array and `grid-cols-N` on `MobileTabBar` in `src/components/AppNav.tsx`

## Environment variables

| Variable | Side |
|----------|------|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | both |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | both |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |

The `VITE_` prefixed versions are resolved at build time by Vite; bare versions are used server-side via `process.env`.
