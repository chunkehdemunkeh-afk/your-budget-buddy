import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatShortDate } from "@/lib/format";
import { calculateCurrentBalance, type BalanceTransaction } from "@/lib/balance";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target as TargetIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { InstallPrompt } from "@/components/InstallPrompt";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pursely" },
      { name: "description", content: "Your monthly budget at a glance." },
    ],
  }),
  component: DashboardPage,
});

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface Tx {
  id: string;
  kind: "income" | "outgoing" | "shopping";
  amount: number;
  occurred_on: string;
  note: string | null;
  source: string | null;
  category_id: string | null;
}
interface Cat {
  id: string;
  name: string;
  color: string;
  type: "income" | "outgoing";
}
interface Goal {
  id: string;
  name: string;
  target_amount: number;
  color: string;
}
interface Recurring {
  id: string;
  name: string;
  amount: number;
  next_run: string;
  kind: "income" | "outgoing" | "shopping";
}
interface AllRecurringRule {
  id: string;
  name: string;
  amount: number;
  next_run: string;
  frequency: "weekly" | "fortnightly" | "monthly" | "yearly";
  kind: "income" | "outgoing" | "shopping";
}
interface WeekItem {
  name: string;
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  isProjected: boolean;
}

// ─── Week-ahead helpers ─────────────────────────────────────────────────────────

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sun
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + daysToMon + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const startStr = toLocalDate(mon);
  const endStr = toLocalDate(sun);
  const shortFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const label =
    `${mon.toLocaleDateString("en-GB", shortFmt)} – ` +
    `${sun.toLocaleDateString("en-GB", { ...shortFmt, year: "numeric" })}`;
  return { startStr, endStr, label };
}

function stepByFrequency(dateStr: string, frequency: string, direction: 1 | -1): string {
  const d = new Date(dateStr + "T12:00:00");
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7 * direction);
      break;
    case "fortnightly":
      d.setDate(d.getDate() + 14 * direction);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + direction);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + direction);
      break;
  }
  return toLocalDate(d);
}

function occurrencesInRange(
  nextRun: string,
  frequency: string,
  startStr: string,
  endStr: string,
): string[] {
  let cur = nextRun;
  // Walk backward until prev would fall before startStr
  for (let i = 0; i < 500; i++) {
    const prev = stepByFrequency(cur, frequency, -1);
    if (prev < startStr) break;
    cur = prev;
  }
  // Advance if we're still before startStr
  for (let i = 0; i < 500 && cur < startStr; i++) {
    cur = stepByFrequency(cur, frequency, 1);
  }
  const results: string[] = [];
  for (let i = 0; i < 500 && cur <= endStr; i++) {
    if (cur >= startStr) results.push(cur);
    cur = stepByFrequency(cur, frequency, 1);
  }
  return results;
}

function computeWeekBalance(
  weekOffset: number,
  currentBalance: number,
  filteredTxs: BalanceTransaction[],
  allRecurring: AllRecurringRule[],
  todayStr: string,
): { opening: number; closing: number } {
  const { startStr, endStr } = getWeekBounds(weekOffset);

  if (weekOffset <= 0) {
    // Opening = currentBalance minus net of all actual tx from this week's Monday to today
    const txFromStart = filteredTxs.filter(
      (tx) => tx.occurred_on >= startStr && tx.occurred_on <= todayStr,
    );
    const netToDate = txFromStart.reduce(
      (s, tx) => (tx.kind === "income" ? s + Number(tx.amount) : s - Number(tx.amount)),
      0,
    );
    const opening = currentBalance - netToDate;

    // Closing = opening + net of actual tx for the full week + projected recurring for future days
    const txInWeek = filteredTxs.filter(
      (tx) => tx.occurred_on >= startStr && tx.occurred_on <= endStr,
    );
    const actualNet = txInWeek.reduce(
      (s, tx) => (tx.kind === "income" ? s + Number(tx.amount) : s - Number(tx.amount)),
      0,
    );

    let projectedNet = 0;
    if (weekOffset === 0) {
      const tomorrow = new Date(todayStr + "T12:00:00");
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = toLocalDate(tomorrow);
      if (tomorrowStr <= endStr) {
        allRecurring.forEach((rule) => {
          occurrencesInRange(rule.next_run, rule.frequency, tomorrowStr, endStr).forEach(() => {
            projectedNet += rule.kind === "income" ? Number(rule.amount) : -Number(rule.amount);
          });
        });
      }
    }

    return { opening, closing: opening + actualNet + projectedNet };
  }

  // Future week: chain from closing of week 0
  const week0 = computeWeekBalance(0, currentBalance, filteredTxs, allRecurring, todayStr);
  let balance = week0.closing;
  for (let w = 1; w < weekOffset; w++) {
    const { startStr: ws, endStr: we } = getWeekBounds(w);
    allRecurring.forEach((rule) => {
      occurrencesInRange(rule.next_run, rule.frequency, ws, we).forEach(() => {
        balance += rule.kind === "income" ? Number(rule.amount) : -Number(rule.amount);
      });
    });
  }
  const opening = balance;
  let weekNet = 0;
  allRecurring.forEach((rule) => {
    occurrencesInRange(rule.next_run, rule.frequency, startStr, endStr).forEach(() => {
      weekNet += rule.kind === "income" ? Number(rule.amount) : -Number(rule.amount);
    });
  });
  return { opening, closing: opening + weekNet };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contribTotals, setContribTotals] = useState<Record<string, number>>({});
  const [upcoming, setUpcoming] = useState<Recurring[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [allTxs, setAllTxs] = useState<BalanceTransaction[]>([]);
  const [allRecurringRules, setAllRecurringRules] = useState<AllRecurringRule[]>([]);
  const [obDate, setObDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

      const today = toLocalDate(new Date());
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);

      const [txRes, catRes, goalRes, contribRes, recRes, profileRes, allTxRes, allRecurRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("id, kind, amount, occurred_on, note, source, category_id")
            .gte("occurred_on", sixMonthsAgoStr)
            .order("occurred_on", { ascending: false })
            .limit(500),
          supabase.from("categories").select("id, name, color, type"),
          supabase.from("goals").select("id, name, target_amount, color"),
          supabase.from("goal_contributions").select("goal_id, amount"),
          supabase
            .from("recurring_rules")
            .select("id, name, amount, next_run, kind")
            .eq("paused", false)
            .gte("next_run", today)
            .lte("next_run", in7.toISOString().slice(0, 10))
            .order("next_run", { ascending: true })
            .limit(10),
          supabase
            .from("profiles")
            .select("opening_balance, opening_balance_date")
            .eq("id", user.id)
            .maybeSingle(),
          supabase.from("transactions").select("kind, amount, occurred_on"),
          supabase
            .from("recurring_rules")
            .select("id, name, amount, next_run, frequency, kind")
            .eq("paused", false)
            .order("next_run", { ascending: true }),
        ]);

      if (!mounted) return;
      setTransactions((txRes.data as Tx[]) ?? []);
      setCategories((catRes.data as Cat[]) ?? []);
      setGoals((goalRes.data as Goal[]) ?? []);
      const totals: Record<string, number> = {};
      ((contribRes.data as { goal_id: string; amount: number }[]) ?? []).forEach((c) => {
        totals[c.goal_id] = (totals[c.goal_id] ?? 0) + Number(c.amount);
      });
      setContribTotals(totals);
      setUpcoming((recRes.data as Recurring[]) ?? []);

      const profileData = profileRes.data as {
        opening_balance: number;
        opening_balance_date: string | null;
      } | null;
      const ob = Number(profileData?.opening_balance ?? 0);
      const obDateVal = profileData?.opening_balance_date ?? null;
      setObDate(obDateVal);

      const allTx = (allTxRes.data as BalanceTransaction[]) ?? [];
      setAllTxs(allTx);
      setCurrentBalance(
        calculateCurrentBalance({
          openingBalance: ob,
          openingBalanceDate: obDateVal,
          transactions: allTx,
        }),
      );
      setAllRecurringRules((allRecurRes.data as AllRecurringRule[]) ?? []);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () =>
        load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, () => load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "goal_contributions" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_rules" },
        () => load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const { incomeMonth, outgoingMonth, byCategory, monthlyTrend, recent } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const inMonth = transactions.filter((t) => t.occurred_on >= monthStartStr);
    const incomeMonth = inMonth
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const outgoingMonth = inMonth
      .filter((t) => t.kind !== "income")
      .reduce((s, t) => s + Number(t.amount), 0);

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const catTotals = new Map<string, { name: string; color: string; total: number }>();
    inMonth
      .filter((t) => t.kind !== "income")
      .forEach((t) => {
        const c = t.category_id ? catMap.get(t.category_id) : null;
        const key = c?.id ?? "uncat";
        const cur = catTotals.get(key) ?? {
          name: c?.name ?? "Uncategorised",
          color: c?.color ?? "#9ca3af",
          total: 0,
        };
        cur.total += Number(t.amount);
        catTotals.set(key, cur);
      });
    const byCategory = Array.from(catTotals.values()).sort((a, b) => b.total - a.total);

    const trend: { month: string; income: number; outgoing: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const startStr = d.toISOString().slice(0, 10);
      const nextStr = next.toISOString().slice(0, 10);
      const slice = transactions.filter(
        (t) => t.occurred_on >= startStr && t.occurred_on < nextStr,
      );
      trend.push({
        month: d.toLocaleDateString("en-GB", { month: "short" }),
        income: slice.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0),
        outgoing: slice
          .filter((t) => t.kind !== "income")
          .reduce((s, t) => s + Number(t.amount), 0),
      });
    }

    const recent = transactions.slice(0, 6);
    return { incomeMonth, outgoingMonth, byCategory, monthlyTrend: trend, recent };
  }, [transactions, categories]);

  async function handleDelete(id: string) {
    const prev = transactions;
    setTransactions((arr) => arr.filter((t) => t.id !== id));
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setTransactions(prev);
      toast.error(error.message);
    } else {
      toast.success("Deleted");
    }
  }

  const monthBalance = incomeMonth - outgoingMonth;
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <header className="mb-6 md:mb-8">
        <p className="text-sm text-muted-foreground">{monthLabel}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Hello there 👋</h1>
      </header>

      <InstallPrompt />

      {/* Balance card */}
      <div className="mb-6 rounded-3xl bg-[image:var(--gradient-primary)] p-6 text-primary-foreground shadow-[var(--shadow-glow)] md:p-8">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <Wallet className="h-4 w-4" />
          Current balance
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
          {formatMoney(currentBalance)}
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="This month in" value={incomeMonth} icon={<TrendingUp className="h-4 w-4" />} />
          <Stat
            label="This month out"
            value={outgoingMonth}
            icon={<TrendingDown className="h-4 w-4" />}
          />
          <Stat label="Month net" value={monthBalance} icon={<Wallet className="h-4 w-4" />} />
        </div>
      </div>

      {/* Charts row */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card title="Spending by category">
          {byCategory.length === 0 ? (
            <Empty text="No outgoings yet this month." />
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {byCategory.map((c, i) => (
                        <Cell key={i} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatMoney(v)}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {byCategory.slice(0, 5).map((c) => (
                  <li key={c.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-medium">{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Last 6 months">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={monthlyTrend}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `£${v}`}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="income" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="outgoing" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Week Ahead */}
      <div className="mb-6">
        <WeekAheadSection
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          currentBalance={currentBalance}
          allTxs={allTxs}
          transactions={transactions}
          allRecurring={allRecurringRules}
          catMap={catMap}
          openingBalanceDate={obDate}
        />
      </div>

      {/* Goals + Upcoming */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card title="Savings goals">
          {goals.length === 0 ? (
            <Empty text="No goals yet — set one from the Goals tab." />
          ) : (
            <ul className="space-y-3">
              {goals.slice(0, 4).map((g) => {
                const saved = contribTotals[g.id] ?? 0;
                const pct = Math.min(100, (saved / Number(g.target_amount)) * 100);
                return (
                  <li key={g.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <TargetIcon className="h-3.5 w-3.5" style={{ color: g.color }} />
                        {g.name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatMoney(saved)} / {formatMoney(g.target_amount)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: g.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Coming up (next 7 days)">
          {upcoming.length === 0 ? (
            <Empty text="Nothing scheduled in the next 7 days." />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-2 text-muted-foreground">{formatShortDate(r.next_run)}</span>
                  </span>
                  <span
                    className={
                      r.kind === "income"
                        ? "font-semibold text-success"
                        : "font-semibold text-destructive"
                    }
                  >
                    {r.kind === "income" ? "+" : "−"}
                    {formatMoney(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent activity">
        {loading ? (
          <Empty text="Loading…" />
        ) : recent.length === 0 ? (
          <Empty text="No transactions yet — tap + to add your first." />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              return (
                <li key={t.id} className="group flex items-center gap-3 py-2.5">
                  <span
                    className="h-9 w-9 shrink-0 rounded-xl"
                    style={{
                      background: (cat?.color ?? "#9ca3af") + "33",
                      borderLeft: `3px solid ${cat?.color ?? "#9ca3af"}`,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.source ?? cat?.name ?? "Entry"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(t.occurred_on)} · {cat?.name ?? "Uncategorised"}
                    </p>
                  </div>
                  <span
                    className={
                      t.kind === "income"
                        ? "shrink-0 font-semibold text-success"
                        : "shrink-0 font-semibold text-destructive"
                    }
                  >
                    {t.kind === "income" ? "+" : "−"}
                    {formatMoney(t.amount)}
                  </span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    aria-label="Delete"
                    className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Week Ahead Section ─────────────────────────────────────────────────────────

function WeekAheadSection({
  weekOffset,
  setWeekOffset,
  currentBalance,
  allTxs,
  transactions,
  allRecurring,
  catMap,
  openingBalanceDate,
}: {
  weekOffset: number;
  setWeekOffset: (n: number) => void;
  currentBalance: number;
  allTxs: BalanceTransaction[];
  transactions: Tx[];
  allRecurring: AllRecurringRule[];
  catMap: Map<string, Cat>;
  openingBalanceDate: string | null;
}) {
  const { startStr, endStr, label } = getWeekBounds(weekOffset);
  const todayStr = toLocalDate(new Date());

  // Build 7 day slots
  const days: string[] = [];
  {
    const d = new Date(startStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      days.push(toLocalDate(d));
      d.setDate(d.getDate() + 1);
    }
  }

  // Items per day
  const itemsByDay = useMemo(() => {
    const result: Record<string, WeekItem[]> = {};
    days.forEach((ds) => (result[ds] = []));

    // Actual transactions (6-month window covers most cases)
    transactions.forEach((tx) => {
      if (tx.occurred_on >= startStr && tx.occurred_on <= endStr) {
        const cat = tx.category_id ? catMap.get(tx.category_id) : null;
        result[tx.occurred_on]?.push({
          name: tx.source ?? cat?.name ?? "Entry",
          amount: Number(tx.amount),
          kind: tx.kind,
          isProjected: false,
        });
      }
    });

    // Projected recurring rules for future days only
    const futureFrom =
      weekOffset > 0
        ? startStr
        : (() => {
            const t = new Date(todayStr + "T12:00:00");
            t.setDate(t.getDate() + 1);
            return toLocalDate(t);
          })();

    if (futureFrom <= endStr) {
      allRecurring.forEach((rule) => {
        occurrencesInRange(rule.next_run, rule.frequency, futureFrom, endStr).forEach((ds) => {
          result[ds]?.push({
            name: rule.name,
            amount: Number(rule.amount),
            kind: rule.kind,
            isProjected: true,
          });
        });
      });
    }

    return result;
  }, [startStr, endStr, weekOffset, transactions, allRecurring, catMap, todayStr]);

  // Opening / closing balances
  const { opening, closing } = useMemo(() => {
    const filtered = openingBalanceDate
      ? allTxs.filter((tx) => tx.occurred_on >= openingBalanceDate)
      : allTxs;
    return computeWeekBalance(weekOffset, currentBalance, filtered, allRecurring, todayStr);
  }, [weekOffset, currentBalance, allTxs, allRecurring, openingBalanceDate, todayStr]);

  const weekNet = closing - opening;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Week ahead</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-xs font-medium tabular-nums">
            {label}
          </span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Opening balance */}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">Opening balance</span>
        <span className="font-semibold tabular-nums">{formatMoney(opening)}</span>
      </div>

      {/* Daily rows */}
      <div className="space-y-1.5">
        {days.map((ds) => {
          const items = itemsByDay[ds] ?? [];
          const isToday = ds === todayStr;
          const isPast = ds < todayStr;
          const dayNet = items.reduce(
            (s, it) => (it.kind === "income" ? s + it.amount : s - it.amount),
            0,
          );
          const dayLabel = new Date(ds + "T12:00:00").toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });

          return (
            <div
              key={ds}
              className={cn(
                "rounded-2xl px-3 py-2.5",
                isToday
                  ? "bg-primary/8 ring-1 ring-primary/20"
                  : isPast
                    ? "bg-muted/20"
                    : "bg-muted/40",
              )}
            >
              {/* Day header */}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    isToday ? "text-primary" : isPast ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {dayLabel}
                  {isToday && (
                    <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Today
                    </span>
                  )}
                </span>
                {items.length > 0 && (
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      dayNet >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {dayNet >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(dayNet))}
                  </span>
                )}
              </div>

              {/* Items */}
              {items.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span
                        className={cn(
                          "flex items-center gap-1.5",
                          item.isProjected ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {item.isProjected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                        )}
                        {item.name}
                      </span>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          item.kind === "income" ? "text-success" : "text-destructive",
                          item.isProjected && "opacity-70",
                        )}
                      >
                        {item.kind === "income" ? "+" : "−"}
                        {formatMoney(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {items.length === 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground/40">Nothing scheduled</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Closing balance */}
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">Closing balance</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              weekNet >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {weekNet >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(weekNet))}
          </span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              closing < 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatMoney(closing)}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Small shared components ────────────────────────────────────────────────────

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold">{formatMoney(value)}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
