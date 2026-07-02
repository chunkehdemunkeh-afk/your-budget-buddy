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
  CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { adjustedOccurrencesInRange } from "@/lib/recurring";

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
  recurring_rule_id: string | null;
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
  start_date: string;
  frequency: "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly";
  kind: "income" | "outgoing" | "shopping";
  weekend_adjust: boolean;
}
interface OneOffBill {
  id: string;
  name: string;
  amount: number;
  due_date: string; // YYYY-MM-DD
}

interface WeekItem {
  name: string;
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  isProjected: boolean;
  oneOffBill?: OneOffBill;
}

// ─── Date & balance helpers ────────────────────────────────────────────────────

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysStr(s: string, n: number): string {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + daysToMon);
  return d;
}

function getWeekBoundsForDate(anchor: Date) {
  const mon = mondayOf(anchor);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const shortFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const label =
    `${mon.toLocaleDateString("en-GB", shortFmt)} – ` +
    `${sun.toLocaleDateString("en-GB", { ...shortFmt, year: "numeric" })}`;
  return { startStr: toLocalDate(mon), endStr: toLocalDate(sun), label };
}


function getMonthBoundsForDate(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return { startStr: toLocalDate(first), endStr: toLocalDate(last), label };
}

function getMonthBounds(offset: number) {
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return getMonthBoundsForDate(anchor);
}

/**
 * Balance at end-of-day for `dateStr`.
 * - If dateStr >= today: starts from currentBalance, adds future actual tx and
 *   unfired projected recurring through dateStr.
 * - If dateStr < today: starts from currentBalance, subtracts actual tx that
 *   occurred after dateStr through today.
 */
function balanceEndOf(
  dateStr: string,
  currentBalance: number,
  txs: BalanceTransaction[],
  allRecurring: AllRecurringRule[],
  todayStr: string,
  firedRuleDates: Set<string>,
): number {
  if (dateStr >= todayStr) {
    const dayAfterToday = addDaysStr(todayStr, 1);
    let net = 0;
    for (const tx of txs) {
      if (tx.occurred_on >= dayAfterToday && tx.occurred_on <= dateStr) {
        net += tx.kind === "income" ? Number(tx.amount) : -Number(tx.amount);
      }
    }
    for (const rule of allRecurring) {
      adjustedOccurrencesInRange(rule, todayStr, dateStr).forEach((ds) => {
        if (firedRuleDates.has(`${rule.id}|${ds}`)) return;
        net += rule.kind === "income" ? Number(rule.amount) : -Number(rule.amount);
      });
    }
    return currentBalance + net;
  } else {
    const dayAfter = addDaysStr(dateStr, 1);
    let net = 0;
    for (const tx of txs) {
      if (tx.occurred_on >= dayAfter && tx.occurred_on <= todayStr) {
        net += tx.kind === "income" ? Number(tx.amount) : -Number(tx.amount);
      }
    }
    return currentBalance - net;
  }
}


// ─── Dashboard ──────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { user, householdId } = useAuth();
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
  const [viewMode, setViewMode] = useState<"week" | "month">(() => {
    if (typeof window === "undefined") return "week";
    return (localStorage.getItem("dashboard.aheadView") as "week" | "month") ?? "week";
  });
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dashboard.aheadView", viewMode);
  }, [viewMode]);
  const [oneOffBills, setOneOffBills] = useState<OneOffBill[]>([]);

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

      const [txRes, catRes, goalRes, contribRes, recRes, profileRes, allTxRes, allRecurRes, billsRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("id, kind, amount, occurred_on, note, source, category_id, recurring_rule_id")
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
          householdId
            ? supabase
                .from("households")
                .select("opening_balance, opening_balance_date")
                .eq("id", householdId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from("transactions").select("kind, amount, occurred_on"),
          supabase
            .from("recurring_rules")
            .select("id, name, amount, next_run, start_date, frequency, kind, weekend_adjust")
            .eq("paused", false)
            .order("next_run", { ascending: true }),
          supabase
            .from("one_off_bills")
            .select("id, name, amount, due_date")
            .eq("paid", false)
            .not("due_date", "is", null)
            .order("due_date", { ascending: true }),
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
      setOneOffBills((billsRes.data as OneOffBill[]) ?? []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "one_off_bills" }, () => load())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, householdId]);

  const {
    incomeMonthPosted,
    outgoingMonthPosted,
    incomeMonthProjected,
    outgoingMonthProjected,
    byCategory,
    monthlyTrend,
    recent,
  } = useMemo(() => {
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthStartStr = toLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const todayStr = toLocalDate(now);

    // Bound to this calendar month only — excludes future-month transactions entered in advance.
    const inMonth = transactions.filter(
      (t) => t.occurred_on >= monthStartStr && t.occurred_on < nextMonthStartStr,
    );

    // Posted so far = only transactions dated on/before today.
    const postedSoFar = inMonth.filter((t) => t.occurred_on <= todayStr);
    const incomeMonthPosted = postedSoFar
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const outgoingMonthPosted = postedSoFar
      .filter((t) => t.kind !== "income")
      .reduce((s, t) => s + Number(t.amount), 0);

    // Projected month-end = every in-month transaction + unfired recurring income/outgoings
    // for the remainder of the month.
    let incomeMonthProjected = inMonth
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    let outgoingMonthProjected = inMonth
      .filter((t) => t.kind !== "income")
      .reduce((s, t) => s + Number(t.amount), 0);

    const monthEndStr = toLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const firedInMonth = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.occurred_on >= monthStartStr && tx.occurred_on <= monthEndStr && tx.recurring_rule_id) {
        firedInMonth.add(`${tx.recurring_rule_id}|${tx.occurred_on}`);
      }
    });
    allRecurringRules.forEach((rule) => {
      adjustedOccurrencesInRange(rule, monthStartStr, monthEndStr).forEach((ds) => {
        if (firedInMonth.has(`${rule.id}|${ds}`)) return;
        if (rule.kind === "income") incomeMonthProjected += Number(rule.amount);
        else outgoingMonthProjected += Number(rule.amount);
      });
    });

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
      const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
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
    return {
      incomeMonthPosted,
      outgoingMonthPosted,
      incomeMonthProjected,
      outgoingMonthProjected,
      byCategory,
      monthlyTrend: trend,
      recent,
    };
  }, [transactions, categories, allRecurringRules]);

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

  async function handleToggleBill(bill: OneOffBill) {
    if (!user || !householdId) return;
    const today = toLocalDate(new Date());
    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      household_id: householdId,
      kind: "outgoing",
      amount: bill.amount,
      occurred_on: today,
      source: bill.name,
    });
    if (txErr) { toast.error(txErr.message); return; }
    await supabase
      .from("one_off_bills")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", bill.id);
    toast.success(`${bill.name} marked as paid`);
  }

  const [monthTileMode, setMonthTileMode] = useState<"posted" | "projected">(() => {
    if (typeof window === "undefined") return "projected";
    return (localStorage.getItem("dashboard.monthTileMode") as "posted" | "projected") ?? "projected";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dashboard.monthTileMode", monthTileMode);
  }, [monthTileMode]);
  const incomeMonth = monthTileMode === "posted" ? incomeMonthPosted : incomeMonthProjected;
  const outgoingMonth = monthTileMode === "posted" ? outgoingMonthPosted : outgoingMonthProjected;
  const monthBalance = incomeMonth - outgoingMonth;
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Include today's projected recurring (not yet fired) so the balance card
  // matches what the week-ahead section shows for today.
  const displayBalance = useMemo(() => {
    const todayStr = toLocalDate(new Date());
    const firedToday = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.occurred_on === todayStr && tx.recurring_rule_id) {
        firedToday.add(`${tx.recurring_rule_id}|${todayStr}`);
      }
    });
    let projectedNet = 0;
    allRecurringRules.forEach((rule) => {
      adjustedOccurrencesInRange(rule, todayStr, todayStr).forEach((ds) => {
        if (firedToday.has(`${rule.id}|${ds}`)) return;
        projectedNet += rule.kind === "income" ? Number(rule.amount) : -Number(rule.amount);
      });
    });
    return currentBalance + projectedNet;
  }, [currentBalance, transactions, allRecurringRules]);

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
          {formatMoney(displayBalance)}
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
        <AheadSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          anchorDate={anchorDate}
          setAnchorDate={setAnchorDate}
          currentBalance={currentBalance}
          allTxs={allTxs}
          transactions={transactions}
          allRecurring={allRecurringRules}
          catMap={catMap}
          openingBalanceDate={obDate}
          oneOffBills={oneOffBills}
          onToggleBill={handleToggleBill}
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

// ─── Ahead Section (Week / Month) ───────────────────────────────────────────────

function DayRow({
  ds,
  items,
  todayStr,
  balance,
  onToggleBill,
}: {
  ds: string;
  items: WeekItem[];
  todayStr: string;
  balance: number;
  onToggleBill: (b: OneOffBill) => void;
}) {
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
      className={cn(
        "rounded-2xl px-3 py-2.5",
        isToday ? "bg-primary/8 ring-1 ring-primary/20" : isPast ? "bg-muted/20" : "bg-muted/40",
      )}
    >
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

      {items.length > 0 ? (
        <>
          <ul className="mt-1.5 space-y-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5",
                    item.isProjected ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {item.oneOffBill ? (
                    <Checkbox
                      className="h-3.5 w-3.5 shrink-0"
                      checked={false}
                      onCheckedChange={() => onToggleBill(item.oneOffBill!)}
                    />
                  ) : item.isProjected ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  ) : null}
                  <span className="truncate">{item.name}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
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
          <div className="mt-2 border-t border-border/40 pt-1.5 text-right">
            <span className="text-xs text-muted-foreground">Balance </span>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                balance < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatMoney(balance)}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground/40">Nothing scheduled</p>
      )}
    </div>
  );
}

function AheadSection({
  viewMode,
  setViewMode,
  anchorDate,
  setAnchorDate,
  currentBalance,
  allTxs,
  transactions,
  allRecurring,
  catMap,
  openingBalanceDate,
  oneOffBills,
  onToggleBill,
}: {
  viewMode: "week" | "month";
  setViewMode: (m: "week" | "month") => void;
  anchorDate: Date;
  setAnchorDate: (d: Date) => void;
  currentBalance: number;
  allTxs: BalanceTransaction[];
  transactions: Tx[];
  allRecurring: AllRecurringRule[];
  catMap: Map<string, Cat>;
  openingBalanceDate: string | null;
  oneOffBills: OneOffBill[];
  onToggleBill: (bill: OneOffBill) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const todayStr = toLocalDate(new Date());

  const { startStr, endStr, label } =
    viewMode === "week" ? getWeekBoundsForDate(anchorDate) : getMonthBoundsForDate(anchorDate);

  // Build day list spanning [startStr, endStr]
  const days = useMemo(() => {
    const result: string[] = [];
    const d = new Date(startStr + "T12:00:00");
    const end = new Date(endStr + "T12:00:00");
    while (toLocalDate(d) <= toLocalDate(end)) {
      result.push(toLocalDate(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [startStr, endStr]);

  const firedRuleDates = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.recurring_rule_id) s.add(`${tx.recurring_rule_id}|${tx.occurred_on}`);
    });
    return s;
  }, [transactions]);

  // Items per day
  const itemsByDay = useMemo(() => {
    const result: Record<string, WeekItem[]> = {};
    days.forEach((ds) => (result[ds] = []));

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

    const futureFrom = startStr > todayStr ? startStr : todayStr;
    if (futureFrom <= endStr) {
      allRecurring.forEach((rule) => {
        adjustedOccurrencesInRange(rule, futureFrom, endStr).forEach((ds) => {
          if (firedRuleDates.has(`${rule.id}|${ds}`)) return;
          result[ds]?.push({
            name: rule.name,
            amount: Number(rule.amount),
            kind: rule.kind,
            isProjected: true,
          });
        });
      });
    }

    oneOffBills.forEach((bill) => {
      if (bill.due_date >= startStr && bill.due_date <= endStr) {
        result[bill.due_date]?.push({
          name: bill.name,
          amount: Number(bill.amount),
          kind: "outgoing",
          isProjected: true,
          oneOffBill: bill,
        });
      }
    });

    return result;
  }, [days, startStr, endStr, transactions, allRecurring, catMap, todayStr, oneOffBills, firedRuleDates]);

  // Opening / closing using generic balanceEndOf helper
  const { opening, closing } = useMemo(() => {
    const filtered = openingBalanceDate
      ? allTxs.filter((tx) => tx.occurred_on >= openingBalanceDate)
      : allTxs;
    const opening = balanceEndOf(
      addDaysStr(startStr, -1),
      currentBalance,
      filtered,
      allRecurring,
      todayStr,
      firedRuleDates,
    );
    let closing = balanceEndOf(
      endStr,
      currentBalance,
      filtered,
      allRecurring,
      todayStr,
      firedRuleDates,
    );
    // Subtract unpaid one-off bills due from max(today, startStr) through endStr
    const futureFrom = startStr > todayStr ? startStr : todayStr;
    const billAdj = oneOffBills
      .filter((b) => b.due_date >= futureFrom && b.due_date <= endStr)
      .reduce((s, b) => s - Number(b.amount), 0);
    closing += billAdj;
    return { opening, closing };
  }, [
    startStr,
    endStr,
    currentBalance,
    allTxs,
    allRecurring,
    openingBalanceDate,
    todayStr,
    oneOffBills,
    firedRuleDates,
  ]);

  const periodNet = closing - opening;

  // Running balance for each day
  const dailyBalances = useMemo(() => {
    const result: Record<string, number> = {};
    let running = opening;
    for (const ds of days) {
      const items = itemsByDay[ds] ?? [];
      const dayNet = items.reduce(
        (s, it) => (it.kind === "income" ? s + it.amount : s - it.amount),
        0,
      );
      running += dayNet;
      result[ds] = running;
    }
    return result;
  }, [days, itemsByDay, opening]);

  // For monthly view: group days into Mon–Sun weeks
  const weekGroups = useMemo(() => {
    if (viewMode !== "month") return [];
    const groups: { startStr: string; endStr: string; days: string[] }[] = [];
    let current: string[] = [];
    for (const ds of days) {
      current.push(ds);
      const dow = new Date(ds + "T12:00:00").getDay();
      if (dow === 0) {
        groups.push({ startStr: current[0], endStr: current[current.length - 1], days: current });
        current = [];
      }
    }
    if (current.length) {
      groups.push({ startStr: current[0], endStr: current[current.length - 1], days: current });
    }
    return groups;
  }, [viewMode, days]);

  function stepPeriod(direction: -1 | 1) {
    const d = new Date(anchorDate);
    if (viewMode === "week") {
      d.setDate(d.getDate() + 7 * direction);
    } else {
      d.setMonth(d.getMonth() + direction);
    }
    setAnchorDate(d);
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {viewMode === "week" ? "Week ahead" : "Month ahead"}
        </h2>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                viewMode === "week"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                viewMode === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Month
            </button>
          </div>
          {/* Nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => stepPeriod(-1)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
                  aria-label="Jump to date"
                >
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-[120px] text-center">{label}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={anchorDate}
                  onSelect={(d) => {
                    if (d) {
                      setAnchorDate(d);
                      setCalendarOpen(false);
                    }
                  }}
                  weekStartsOn={1}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                <div className="flex items-center justify-between border-t border-border p-2">
                  <button
                    onClick={() => {
                      setAnchorDate(new Date());
                      setCalendarOpen(false);
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    Today
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={() => stepPeriod(1)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={viewMode === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Opening balance */}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">Opening balance</span>
        <span className="font-semibold tabular-nums">{formatMoney(opening)}</span>
      </div>

      {/* Body */}
      {viewMode === "week" ? (
        <div className="space-y-1.5">
          {days.map((ds) => (
            <DayRow
              key={ds}
              ds={ds}
              items={itemsByDay[ds] ?? []}
              todayStr={todayStr}
              balance={dailyBalances[ds]}
              onToggleBill={onToggleBill}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {weekGroups.map((grp) => {
            const containsToday = todayStr >= grp.startStr && todayStr <= grp.endStr;
            const weekItemsCount = grp.days.reduce(
              (s, ds) => s + (itemsByDay[ds]?.length ?? 0),
              0,
            );
            const weekNet = grp.days.reduce((s, ds) => {
              const items = itemsByDay[ds] ?? [];
              return (
                s +
                items.reduce(
                  (ss, it) => (it.kind === "income" ? ss + it.amount : ss - it.amount),
                  0,
                )
              );
            }, 0);
            const weekClosing = dailyBalances[grp.endStr];
            const rangeLabel = `${new Date(grp.startStr + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(grp.endStr + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
            return (
              <details
                key={grp.startStr}
                open={containsToday}
                className="group rounded-2xl border border-border/60 bg-muted/20 [&[open]>summary>svg]:rotate-180"
              >
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/40",
                    containsToday && "bg-primary/8 ring-1 ring-primary/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        containsToday ? "text-primary" : "text-foreground",
                      )}
                    >
                      {rangeLabel}
                    </span>
                    {weekItemsCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {weekItemsCount} item{weekItemsCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    {weekItemsCount > 0 && (
                      <span
                        className={cn(
                          "font-medium",
                          weekNet >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {weekNet >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(weekNet))}
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-semibold",
                        weekClosing < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {formatMoney(weekClosing)}
                    </span>
                  </div>
                </summary>
                <div className="space-y-1.5 px-2 pb-2 pt-1">
                  {grp.days.map((ds) => (
                    <DayRow
                      key={ds}
                      ds={ds}
                      items={itemsByDay[ds] ?? []}
                      todayStr={todayStr}
                      balance={dailyBalances[ds]}
                      onToggleBill={onToggleBill}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* Closing balance */}
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">Closing balance</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              periodNet >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {periodNet >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(periodNet))}
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
