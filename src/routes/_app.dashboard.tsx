import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatShortDate } from "@/lib/format";
import { calculateCurrentBalance, type BalanceTransaction } from "@/lib/balance";
import { TrendingUp, TrendingDown, Wallet, Target as TargetIcon, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pursely" },
      { name: "description", content: "Your monthly budget at a glance." },
    ],
  }),
  component: DashboardPage,
});

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

function DashboardPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contribTotals, setContribTotals] = useState<Record<string, number>>({});
  const [upcoming, setUpcoming] = useState<Recurring[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);

      const [txRes, catRes, goalRes, contribRes, recRes, profileRes, allTxRes] = await Promise.all([
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
          .lte("next_run", in7.toISOString().slice(0, 10))
          .order("next_run", { ascending: true })
          .limit(10),
        supabase.from("profiles").select("opening_balance, opening_balance_date").eq("id", user.id).maybeSingle(),
        supabase.from("transactions").select("kind, amount, occurred_on"),
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
      const profileData = profileRes.data as { opening_balance: number; opening_balance_date: string | null } | null;
      const ob = Number(profileData?.opening_balance ?? 0);
      const obDate = profileData?.opening_balance_date ?? null;
      setOpeningBalance(ob);
      
      const allTx = (allTxRes.data as BalanceTransaction[]) ?? [];
      setCurrentBalance(calculateCurrentBalance({
        openingBalance: ob,
        openingBalanceDate: obDate,
        transactions: allTx,
      }));
      setLoading(false);
    }

    load();

    // Realtime
    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
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

    // 6 month trend
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
  const catMap = new Map(categories.map((c) => [c.id, c]));

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
        <p className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">{formatMoney(currentBalance)}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="This month in" value={incomeMonth} icon={<TrendingUp className="h-4 w-4" />} />
          <Stat label="This month out" value={outgoingMonth} icon={<TrendingDown className="h-4 w-4" />} />
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
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: c.color }}
                      />
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
                    <span className="ml-2 text-muted-foreground">
                      {formatShortDate(r.next_run)}
                    </span>
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
                    style={{ background: (cat?.color ?? "#9ca3af") + "33", borderLeft: `3px solid ${cat?.color ?? "#9ca3af"}` }}
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
