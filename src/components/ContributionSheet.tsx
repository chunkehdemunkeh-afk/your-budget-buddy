import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { Goal } from "@/components/GoalSheet";

interface Contribution {
  id: string;
  amount: number;
  occurred_on: string;
  note: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  goal: Goal | null;
}

const schema = z.object({
  amount: z.number().positive().max(10_000_000),
  occurred_on: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export function ContributionSheet({ open, onOpenChange, goal }: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [contribs, setContribs] = useState<Contribution[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !goal) return;
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setNote("");
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("goal_contributions")
        .select("id, amount, occurred_on, note")
        .eq("goal_id", goal!.id)
        .order("occurred_on", { ascending: false })
        .limit(50);
      if (!mounted) return;
      setContribs((data as Contribution[]) ?? []);
    }
    load();
    const channel = supabase
      .channel(`contribs-${goal.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "goal_contributions", filter: `goal_id=eq.${goal.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [open, goal]);

  if (!goal) return null;

  const totalSaved = contribs.reduce((s, c) => s + Number(c.amount), 0);
  const pct = Math.min(100, (totalSaved / Number(goal.target_amount)) * 100);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !goal) return;
    const parsed = schema.safeParse({
      amount: Number(amount),
      occurred_on: date,
      note: note || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check entry");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("goal_contributions").insert({
      user_id: user.id,
      goal_id: goal.id,
      amount: parsed.data.amount,
      occurred_on: parsed.data.occurred_on,
      note: parsed.data.note ?? null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${formatMoney(parsed.data.amount)}`);
    setAmount("");
    setNote("");
  }

  async function deleteContrib(id: string) {
    const { error } = await supabase.from("goal_contributions").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: goal.color }}
              aria-hidden
            />
            {goal.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl bg-muted/50 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">{formatMoney(totalSaved)}</span>
              <span className="text-sm text-muted-foreground">
                of {formatMoney(goal.target_amount)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: goal.color }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pct.toFixed(0)}% complete
              {goal.target_date ? ` · target ${formatShortDate(goal.target_date)}` : ""}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add contribution
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="camt" className="text-xs">Amount (£)</Label>
                <Input
                  id="camt"
                  required
                  inputMode="decimal"
                  placeholder="50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className="mt-1 h-10 rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="cdate" className="text-xs">Date</Label>
                <Input
                  id="cdate"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-10 rounded-lg"
                />
              </div>
            </div>
            <Textarea
              maxLength={500}
              rows={2}
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="h-10 w-full rounded-lg font-semibold"
              style={{ background: goal.color, color: "white" }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Add"}
            </Button>
          </form>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </p>
            {contribs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                No contributions yet.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {contribs.map((c) => (
                  <li key={c.id} className="group flex items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold tabular-nums">+{formatMoney(c.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(c.occurred_on)}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteContrib(c.id)}
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
