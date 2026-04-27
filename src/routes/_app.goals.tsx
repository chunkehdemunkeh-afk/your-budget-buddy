import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Target as TargetIcon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatShortDate } from "@/lib/format";
import { GoalSheet, type Goal } from "@/components/GoalSheet";
import { ContributionSheet } from "@/components/ContributionSheet";

export const Route = createFileRoute("/_app/goals")({
  head: () => ({ meta: [{ title: "Goals — Pursely" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contribTotals, setContribTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contribOpen, setContribOpen] = useState(false);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function load() {
      const [gRes, cRes] = await Promise.all([
        supabase
          .from("goals")
          .select("id, name, target_amount, target_date, color, icon")
          .order("created_at", { ascending: true }),
        supabase.from("goal_contributions").select("goal_id, amount"),
      ]);
      if (!mounted) return;
      if (gRes.error) toast.error(gRes.error.message);
      setGoals((gRes.data as Goal[]) ?? []);
      const totals: Record<string, number> = {};
      ((cRes.data as { goal_id: string; amount: number }[]) ?? []).forEach((c) => {
        totals[c.goal_id] = (totals[c.goal_id] ?? 0) + Number(c.amount);
      });
      setContribTotals(totals);
      setLoading(false);
    }
    load();
    const channel = supabase
      .channel("goals-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "goal_contributions" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const totalTarget = useMemo(
    () => goals.reduce((s, g) => s + Number(g.target_amount), 0),
    [goals],
  );
  const totalSaved = useMemo(
    () => goals.reduce((s, g) => s + (contribTotals[g.id] ?? 0), 0),
    [goals, contribTotals],
  );
  const overallPct = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;

  async function handleDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("goals").delete().eq("id", confirmDelete.id);
    setConfirmDelete(null);
    if (error) toast.error(error.message);
    else toast.success("Goal deleted");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Savings goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set targets and watch your progress grow.
        </p>
      </header>

      {goals.length > 0 && (
        <div className="mb-5 rounded-3xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
          <p className="text-xs uppercase tracking-wide opacity-80">Saved across all goals</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(totalSaved)}</p>
          <p className="mt-1 text-sm opacity-80">
            of {formatMoney(totalTarget)} · {overallPct.toFixed(0)}%
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
        className="mb-5 h-11 w-full rounded-xl bg-card font-semibold text-foreground shadow-[var(--shadow-soft)] hover:bg-muted sm:w-auto"
        variant="outline"
      >
        <Plus className="h-4 w-4" /> New goal
      </Button>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : goals.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
          <TargetIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            No goals yet — create one to start saving.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {goals.map((g) => {
            const saved = contribTotals[g.id] ?? 0;
            const pct = Math.min(100, (saved / Number(g.target_amount)) * 100);
            return (
              <li
                key={g.id}
                className="group rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-glow)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => {
                      setActiveGoal(g);
                      setContribOpen(true);
                    }}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <ProgressRing pct={pct} color={g.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(saved)} / {formatMoney(g.target_amount)}
                      </p>
                      {g.target_date && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          By {formatShortDate(g.target_date)}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(g);
                        setSheetOpen(true);
                      }}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDelete(g)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setActiveGoal(g);
                    setContribOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full rounded-lg"
                >
                  <Plus className="h-3.5 w-3.5" /> Contribute
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <GoalSheet open={sheetOpen} onOpenChange={setSheetOpen} goal={editing} />
      <ContributionSheet open={contribOpen} onOpenChange={setContribOpen} goal={activeGoal} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" and all its contributions will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="5"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
