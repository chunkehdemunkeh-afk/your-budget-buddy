import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/format";
import { toDateOnly } from "@/lib/recurring";
import { effectiveFoodBudget, type HouseholdComposition } from "@/lib/food-budget";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Repeat,
  Wallet,
  BarChart3,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_app/insights")({
  head: () => ({
    meta: [
      { title: "Insights — Pursely" },
      { name: "description", content: "Financial health and spending insights." },
    ],
  }),
  component: InsightsPage,
});

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface Tx {
  id: string;
  kind: "income" | "outgoing" | "shopping";
  amount: number;
  occurred_on: string;
  category_id: string | null;
  note: string | null;
  source: string | null;
}

interface Cat {
  id: string;
  name: string;
  color: string;
  type: "income" | "outgoing";
  monthly_budget: number | null;
}

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  color: string;
  icon: string;
}

interface Contrib {
  goal_id: string;
  amount: number;
  occurred_on: string;
}

interface RecurRule {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly";
  kind: "income" | "outgoing" | "shopping";
}

// ─── Constants & helpers ────────────────────────────────────────────────────────



function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "fortnightly":
      return (amount * 26) / 12;
    case "fourweekly":
      return (amount * 13) / 12;
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ─── InsightsPage ───────────────────────────────────────────────────────────────

function InsightsPage() {
  const { user, householdId } = useAuth();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<Contrib[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurRule[]>([]);
  const [household, setHousehold] = useState<HouseholdComposition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllCats, setShowAllCats] = useState(false);

  const foodBudget = useMemo(() => effectiveFoodBudget(household), [household]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const sixMonthsAgoStr = toDateOnly(sixMonthsAgo);

      const [txRes, catRes, goalRes, contribRes, recRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, kind, amount, occurred_on, category_id, note, source")
          .gte("occurred_on", sixMonthsAgoStr)
          .order("occurred_on", { ascending: false })
          .limit(1000),
        supabase.from("categories").select("id, name, color, type, monthly_budget"),
        supabase.from("goals").select("id, name, target_amount, target_date, color, icon"),
        supabase.from("goal_contributions").select("goal_id, amount, occurred_on"),
        supabase
          .from("recurring_rules")
          .select("id, name, amount, frequency, kind")
          .eq("paused", false),
      ]);

      if (!mounted) return;
      setTransactions((txRes.data as Tx[]) ?? []);
      setCategories((catRes.data as Cat[]) ?? []);
      setGoals((goalRes.data as Goal[]) ?? []);
      setContributions((contribRes.data as Contrib[]) ?? []);
      setRecurringRules((recRes.data as RecurRule[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const { thisMonth, lastMonth, byCategory, monthlyTrend } = useMemo(() => {
    const now = new Date();
    const monthStartStr = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastMonthStartStr = toDateOnly(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEndStr = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 0));

    const thisTxs = transactions.filter((t) => t.occurred_on >= monthStartStr);
    const lastTxs = transactions.filter(
      (t) => t.occurred_on >= lastMonthStartStr && t.occurred_on <= lastMonthEndStr,
    );

    const sum = (txs: Tx[], kind: "income" | "outgoing") =>
      txs
        .filter((t) => (kind === "income" ? t.kind === "income" : t.kind !== "income"))
        .reduce((s, t) => s + Number(t.amount), 0);

    const thisIncome = sum(thisTxs, "income");
    const thisOutgoing = sum(thisTxs, "outgoing");
    const lastIncome = sum(lastTxs, "income");
    const lastOutgoing = sum(lastTxs, "outgoing");

    // Category breakdown this month
    const catTotals = new Map<
      string,
      { name: string; color: string; total: number; budget: number | null }
    >();
    thisTxs
      .filter((t) => t.kind !== "income")
      .forEach((t) => {
        const cat = t.category_id ? catMap.get(t.category_id) : null;
        const key = cat?.id ?? "uncat";
        const cur = catTotals.get(key) ?? {
          name: cat?.name ?? "Uncategorised",
          color: cat?.color ?? "#9ca3af",
          total: 0,
          budget: cat?.monthly_budget ?? null,
        };
        cur.total += Number(t.amount);
        catTotals.set(key, cur);
      });
    const byCategory = Array.from(catTotals.values()).sort((a, b) => b.total - a.total);

    // 6-month trend
    const trend: { month: string; income: number; outgoing: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const startStr = toDateOnly(d);
      const nextStr = toDateOnly(next);
      const slice = transactions.filter((t) => t.occurred_on >= startStr && t.occurred_on < nextStr);
      const income = slice.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
      const outgoing = slice.filter((t) => t.kind !== "income").reduce((s, t) => s + Number(t.amount), 0);
      trend.push({
        month: d.toLocaleDateString("en-GB", { month: "short" }),
        income,
        outgoing,
        net: income - outgoing,
      });
    }

    return {
      thisMonth: { income: thisIncome, outgoing: thisOutgoing, net: thisIncome - thisOutgoing },
      lastMonth: { income: lastIncome, outgoing: lastOutgoing },
      byCategory,
      monthlyTrend: trend,
    };
  }, [transactions, catMap]);

  const foodSpend = useMemo(() => {
    const now = new Date();
    const monthStartStr = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
    return transactions
      .filter((t) => t.occurred_on >= monthStartStr)
      .filter((t) => {
        if (t.kind === "shopping") return true;
        if (t.kind === "outgoing") {
          const cat = t.category_id ? catMap.get(t.category_id) : null;
          return (cat?.name?.toLowerCase() ?? "").includes("food shopping");
        }
        return false;
      })
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [transactions, catMap]);

  const monthlyRecurringOut = useMemo(
    () =>
      recurringRules
        .filter((r) => r.kind !== "income")
        .reduce((s, r) => s + monthlyEquivalent(Number(r.amount), r.frequency), 0),
    [recurringRules],
  );

  const healthScore = useMemo(() => {
    // Savings rate (40 pts)
    let savingsRate = 0;
    if (thisMonth.income > 0) {
      const rate = thisMonth.net / thisMonth.income;
      savingsRate = rate > 0.2 ? 40 : rate > 0.1 ? 30 : rate > 0 ? 20 : 0;
    }

    // Budget adherence (30 pts)
    const budgetedCats = byCategory.filter((c) => c.budget !== null);
    let budgetScore = 15; // neutral when no budgets set
    if (budgetedCats.length > 0) {
      const within = budgetedCats.filter((c) => c.total <= (c.budget ?? Infinity)).length;
      budgetScore = Math.round((within / budgetedCats.length) * 30);
    }

    // Recurring covered (15 pts)
    const recurringCovered =
      thisMonth.income === 0 || monthlyRecurringOut < thisMonth.income ? 15 : 0;

    // Savings activity (15 pts)
    const now = new Date();
    const monthStartStr = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
    const hasContrib = contributions.some((c) => c.occurred_on >= monthStartStr);
    const savingsActivity = hasContrib ? 15 : 0;

    return Math.min(100, savingsRate + budgetScore + recurringCovered + savingsActivity);
  }, [thisMonth, byCategory, monthlyRecurringOut, contributions]);

  const savingsPlan = useMemo(() => {
    const now = new Date();
    const threeMonthsAgoStr = toDateOnly(new Date(now.getFullYear(), now.getMonth() - 3, 1));

    return goals.map((g) => {
      const saved = contributions
        .filter((c) => c.goal_id === g.id)
        .reduce((s, c) => s + Number(c.amount), 0);
      const remaining = Math.max(0, Number(g.target_amount) - saved);
      const pct = Number(g.target_amount) > 0 ? Math.min(100, (saved / Number(g.target_amount)) * 100) : 0;

      const recentTotal = contributions
        .filter((c) => c.goal_id === g.id && c.occurred_on >= threeMonthsAgoStr)
        .reduce((s, c) => s + Number(c.amount), 0);
      const avgMonthly = recentTotal / 3;

      let completionDate: string | null = null;
      if (avgMonthly > 0 && remaining > 0) {
        const months = Math.ceil(remaining / avgMonthly);
        const target = new Date(now.getFullYear(), now.getMonth() + months, 1);
        completionDate = target.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      }

      return { ...g, saved, remaining, pct, avgMonthly, completionDate };
    });
  }, [goals, contributions]);

  const suggestions = useMemo(() => {
    const tips: { icon: ReactNode; title: string; body: string; type: "info" | "warning" | "success" }[] =
      [];
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthProgress = Math.max(0.01, dayOfMonth / daysInMonth);
    const weeksRemaining = Math.max(1, Math.ceil((daysInMonth - dayOfMonth) / 7));

    // Food shopping
    const foodPace = foodSpend / monthProgress;
    if (foodSpend > foodBudget) {
      tips.push({
        icon: <ShoppingCart className="h-4 w-4" />,
        type: "warning",
        title: "Food shopping over budget",
        body: `You've spent ${formatMoney(foodSpend)} on food this month — ${formatMoney(foodSpend - foodBudget)} over your ${formatMoney(foodBudget)} monthly food budget. Batch cooking and a weekly meal plan can help stretch remaining spend.`,
      });
    } else if (foodPace > foodBudget * 1.1 && dayOfMonth > 5) {
      tips.push({
        icon: <ShoppingCart className="h-4 w-4" />,
        type: "warning",
        title: "Food shopping tracking high",
        body: `At your current pace you'll spend around ${formatMoney(Math.round(foodPace))} on food. Your monthly food budget is ${formatMoney(foodBudget)} — ${formatMoney(foodBudget - foodSpend)} remaining, roughly ${formatMoney(Math.round((foodBudget - foodSpend) / weeksRemaining))} per week.`,
      });
    } else if (foodSpend > 0) {
      tips.push({
        icon: <ShoppingCart className="h-4 w-4" />,
        type: "success",
        title: "Food shopping on track",
        body: `${formatMoney(foodSpend)} spent so far — ${formatMoney(foodBudget - foodSpend)} left of your ${formatMoney(foodBudget)} monthly food budget. That's roughly ${formatMoney(Math.round((foodBudget - foodSpend) / weeksRemaining))} per remaining week.`,
      });
    }

    // Categories over budget
    byCategory
      .filter((c) => c.budget !== null && c.total > (c.budget ?? 0))
      .slice(0, 2)
      .forEach((c) => {
        tips.push({
          icon: <AlertTriangle className="h-4 w-4" />,
          type: "warning",
          title: `${c.name} over budget`,
          body: `You've spent ${formatMoney(c.total)} against a ${formatMoney(c.budget!)} monthly budget — ${formatMoney(c.total - c.budget!)} over.`,
        });
      });

    // Net surplus
    if (thisMonth.net < 0) {
      tips.push({
        icon: <AlertTriangle className="h-4 w-4" />,
        type: "warning",
        title: "Spending exceeds income",
        body: `This month you've spent ${formatMoney(Math.abs(thisMonth.net))} more than you've earned. Review your outgoings — your largest category is ${byCategory[0]?.name ?? "unknown"} at ${formatMoney(byCategory[0]?.total ?? 0)}.`,
      });
    } else if (thisMonth.income > 0 && thisMonth.net / thisMonth.income < 0.1) {
      const top = byCategory[0];
      tips.push({
        icon: <TrendingDown className="h-4 w-4" />,
        type: "info",
        title: "Low monthly surplus",
        body: `Your surplus is ${((thisMonth.net / thisMonth.income) * 100).toFixed(0)}% of income this month.${top ? ` Your largest spend is ${top.name} at ${formatMoney(top.total)}.` : ""} Even small savings add up over time.`,
      });
    } else if (thisMonth.income > 0 && thisMonth.net / thisMonth.income >= 0.2) {
      tips.push({
        icon: <CheckCircle2 className="h-4 w-4" />,
        type: "success",
        title: "Strong savings rate",
        body: `You're saving ${((thisMonth.net / thisMonth.income) * 100).toFixed(0)}% of your income this month — well above the recommended 10–15%. Keep it up.`,
      });
    }

    // No goal contributions this month
    const monthStartStr = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
    const uncovered = goals.filter(
      (g) => !contributions.some((c) => c.goal_id === g.id && c.occurred_on >= monthStartStr),
    );
    if (uncovered.length > 0 && goals.length > 0) {
      const g = uncovered[0];
      const saved = contributions.filter((c) => c.goal_id === g.id).reduce((s, c) => s + Number(c.amount), 0);
      const remaining = Math.max(0, Number(g.target_amount) - saved);
      tips.push({
        icon: <Target className="h-4 w-4" />,
        type: "info",
        title: "No contributions yet this month",
        body: `"${g.name}" still needs ${formatMoney(remaining)}. A contribution now keeps the momentum going.`,
      });
    }

    // High recurring costs
    if (thisMonth.income > 0 && monthlyRecurringOut / thisMonth.income > 0.5) {
      tips.push({
        icon: <Repeat className="h-4 w-4" />,
        type: "info",
        title: "High fixed costs",
        body: `Recurring bills account for ${((monthlyRecurringOut / thisMonth.income) * 100).toFixed(0)}% of income (${formatMoney(Math.round(monthlyRecurringOut))}/month). Review the Recurring tab for anything to pause or cancel.`,
      });
    }

    return tips.slice(0, 5);
  }, [foodSpend, byCategory, thisMonth, goals, contributions, monthlyRecurringOut]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading insights…</p>
      </div>
    );
  }

  const grade =
    healthScore >= 80
      ? "Excellent"
      : healthScore >= 60
        ? "Good"
        : healthScore >= 40
          ? "Fair"
          : "Needs attention";

  const totalOutgoing = byCategory.reduce((s, c) => s + c.total, 0);
  const visibleCats = showAllCats ? byCategory : byCategory.slice(0, 5);

  const incomePctChange = pctChange(thisMonth.income, lastMonth.income);
  const outgoingPctChange = pctChange(thisMonth.outgoing, lastMonth.outgoing);
  const netPctChange = pctChange(thisMonth.net, lastMonth.income - lastMonth.outgoing);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <header className="mb-6 md:mb-8">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Insights</h1>
      </header>

      {/* ── Financial Health Score ── */}
      <div className="mb-6 rounded-3xl bg-[image:var(--gradient-primary)] p-6 text-primary-foreground shadow-[var(--shadow-glow)] md:p-8">
        <div className="flex items-center gap-2 text-sm opacity-90 mb-4">
          <Heart className="h-4 w-4" />
          Financial health
        </div>
        <div className="flex flex-col items-center gap-2">
          <HealthGauge score={healthScore} />
          <div className="-mt-4 text-center">
            <p className="text-5xl font-bold tabular-nums">{healthScore}</p>
            <p className="mt-1 text-lg font-semibold opacity-90">{grade}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScorePill
            label="Savings rate"
            pts={thisMonth.income > 0 ? (thisMonth.net / thisMonth.income > 0.2 ? 40 : thisMonth.net / thisMonth.income > 0.1 ? 30 : thisMonth.net > 0 ? 20 : 0) : 0}
            max={40}
          />
          <ScorePill
            label="Budget control"
            pts={(() => {
              const b = byCategory.filter((c) => c.budget !== null);
              if (b.length === 0) return 15;
              return Math.round((b.filter((c) => c.total <= (c.budget ?? Infinity)).length / b.length) * 30);
            })()}
            max={30}
          />
          <ScorePill
            label="Bills covered"
            pts={thisMonth.income === 0 || monthlyRecurringOut < thisMonth.income ? 15 : 0}
            max={15}
          />
          <ScorePill
            label="Saving towards goals"
            pts={contributions.some((c) => c.occurred_on >= toDateOnly(new Date(new Date().getFullYear(), new Date().getMonth(), 1))) ? 15 : 0}
            max={15}
          />
        </div>
      </div>

      {/* ── Monthly Overview ── */}
      <SectionCard title="Monthly overview" icon={<Wallet className="h-4 w-4" />}>
        <div className="grid grid-cols-3 gap-3">
          <OverviewStat
            label="Income"
            value={thisMonth.income}
            pctChange={incomePctChange}
            positive
          />
          <OverviewStat
            label="Outgoings"
            value={thisMonth.outgoing}
            pctChange={outgoingPctChange}
            positive={false}
          />
          <OverviewStat
            label="Net"
            value={thisMonth.net}
            pctChange={netPctChange}
            positive={thisMonth.net >= 0}
          />
        </div>
      </SectionCard>

      {/* ── Food Shopping Tracker ── */}
      <SectionCard title="Food shopping" icon={<ShoppingCart className="h-4 w-4" />}>
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(foodSpend)}</p>
              <p className="text-xs text-muted-foreground">of {formatMoney(foodBudget)} monthly food budget</p>
            </div>
            <div className="text-right">
              {foodSpend <= foodBudget ? (
                <p className="text-sm font-semibold text-[var(--color-success)]">
                  {formatMoney(foodBudget - foodSpend)} remaining
                </p>
              ) : (
                <p className="text-sm font-semibold text-destructive">
                  {formatMoney(foodSpend - foodBudget)} over
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                ~{formatMoney(Math.round(foodSpend / Math.max(1, Math.ceil(new Date().getDate() / 7))))}
                /week avg
              </p>
            </div>
          </div>
          <FoodProgressBar spend={foodSpend} budget={foodBudget} />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>£0</span>
            <span>£800</span>
            <span>£1,600</span>
          </div>
        </div>
      </SectionCard>

      {/* ── Spending by Category ── */}
      <SectionCard title="Spending breakdown" icon={<BarChart3 className="h-4 w-4" />}>
        {byCategory.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No outgoings this month.</p>
        ) : (
          <div className="space-y-3">
            {visibleCats.map((c) => {
              const barPct = totalOutgoing > 0 ? (c.total / totalOutgoing) * 100 : 0;
              const budgetPct = c.budget ? Math.min(100, (c.total / c.budget) * 100) : null;
              return (
                <div key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: c.color }}
                      />
                      {c.name}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {c.budget !== null && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            c.total > c.budget
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {formatMoney(c.total)} / {formatMoney(c.budget)}
                        </span>
                      )}
                      {c.budget === null && (
                        <span className="text-muted-foreground">{formatMoney(c.total)}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    {budgetPct !== null ? (
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          budgetPct > 100 ? "bg-destructive" : "bg-[var(--color-success)]",
                        )}
                        style={{ width: `${Math.min(100, budgetPct)}%`, background: budgetPct > 100 ? undefined : c.color }}
                      />
                    ) : (
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%`, background: c.color }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {byCategory.length > 5 && (
              <button
                onClick={() => setShowAllCats((v) => !v)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {showAllCats ? "Show less" : `Show ${byCategory.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── 6-Month Trend ── */}
      <SectionCard title="6-month trend" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="h-56">
          <ResponsiveContainer>
            <ComposedChart data={monthlyTrend}>
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
                formatter={(v: number, name: string) => [
                  formatMoney(v),
                  name.charAt(0).toUpperCase() + name.slice(1),
                ]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="income" fill="var(--chart-2)" radius={[6, 6, 0, 0]} name="income" />
              <Bar dataKey="outgoing" fill="var(--chart-1)" radius={[6, 6, 0, 0]} name="outgoing" />
              <Line
                dataKey="net"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ fill: "var(--primary)", r: 3 }}
                name="net"
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-2)]" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" /> Outgoings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full bg-primary" /> Net
          </span>
        </div>
      </SectionCard>

      {/* ── Savings Plan ── */}
      {savingsPlan.length > 0 && (
        <SectionCard title="Savings plan" icon={<Target className="h-4 w-4" />}>
          <div className="space-y-4">
            {savingsPlan.map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                    {g.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatMoney(g.saved)} / {formatMoney(g.target_amount)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${g.pct}%`, background: g.color }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {g.avgMonthly > 0 ? (
                    <span>
                      ~{formatMoney(Math.round(g.avgMonthly))}/month over last 3 months
                    </span>
                  ) : (
                    <span className="text-[var(--color-warning)]">No recent contributions</span>
                  )}
                  {g.completionDate ? (
                    <span className="font-medium text-foreground">
                      On track for {g.completionDate}
                    </span>
                  ) : g.remaining > 0 ? (
                    <span>{formatMoney(g.remaining)} to go</span>
                  ) : (
                    <span className="font-medium text-[var(--color-success)]">Reached!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Smart Suggestions ── */}
      {suggestions.length > 0 && (
        <SectionCard title="Suggestions" icon={<Lightbulb className="h-4 w-4" />}>
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} icon={s.icon} title={s.title} body={s.body} type={s.type} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Heart({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function HealthGauge({ score }: { score: number }) {
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" aria-hidden>
      <path
        d="M 15,100 A 85,85 0 0,1 185,100"
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M 15,100 A 85,85 0 0,1 185,100"
        fill="none"
        stroke="white"
        strokeWidth="14"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="100"
        strokeDashoffset={100 - score}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

function ScorePill({ label, pts, max }: { label: string; pts: number; max: number }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">
        {pts}
        <span className="text-xs font-normal opacity-70">/{max}</span>
      </p>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function OverviewStat({
  label,
  value,
  pctChange: change,
  positive,
}: {
  label: string;
  value: number;
  pctChange: number | null;
  positive: boolean;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          label === "Net" && value < 0 && "text-destructive",
          label === "Net" && value >= 0 && "text-[var(--color-success)]",
        )}
      >
        {formatMoney(value)}
      </p>
      {change !== null && (
        <p
          className={cn(
            "mt-0.5 flex items-center gap-0.5 text-[11px] font-medium",
            positive
              ? change >= 0
                ? "text-[var(--color-success)]"
                : "text-destructive"
              : change <= 0
                ? "text-[var(--color-success)]"
                : "text-destructive",
          )}
        >
          {change >= 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(change).toFixed(0)}% vs last month
        </p>
      )}
    </div>
  );
}

function FoodProgressBar({ spend, budget }: { spend: number; budget: number }) {
  const pct = Math.min(100, (spend / budget) * 100);
  const color =
    pct >= 100 ? "bg-destructive" : pct >= 90 ? "bg-[#f97316]" : pct >= 70 ? "bg-[#f59e0b]" : "bg-[var(--color-success)]";
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SuggestionCard({
  icon,
  title,
  body,
  type,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  type: "info" | "warning" | "success";
}) {
  const styles = {
    info: "bg-primary/5 text-primary border-primary/15",
    warning: "bg-[#f59e0b]/8 text-[#b45309] border-[#f59e0b]/20",
    success: "bg-[var(--color-success)]/8 text-[var(--color-success)] border-[var(--color-success)]/20",
  };
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-3.5", styles[type])}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-80">{body}</p>
      </div>
    </div>
  );
}
