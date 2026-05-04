import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";

type Frequency = "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly";
type Kind = "income" | "outgoing";

export interface RecurringRule {
  id: string;
  name: string;
  amount: number;
  kind: Kind;
  frequency: Frequency;
  start_date: string;
  next_run: string;
  category_id: string | null;
  paused: boolean;
  weekend_adjust: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule?: RecurringRule | null;
  defaultKind?: Kind;
}

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(1_000_000),
  kind: z.enum(["income", "outgoing"]),
  frequency: z.enum(["weekly", "fortnightly", "fourweekly", "monthly", "yearly"]),
  start_date: z.string().min(1),
  category_id: z.string().uuid().nullable(),
});

export function RecurringSheet({ open, onOpenChange, rule, defaultKind = "outgoing" }: Props) {
  const { user, householdId } = useAuth();
  const { categories } = useCategories();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [weekendAdjust, setWeekendAdjust] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (rule) {
        setName(rule.name);
        setAmount(String(rule.amount));
        setKind(rule.kind);
        setFrequency(rule.frequency);
        setStartDate(rule.start_date);
        setCategoryId(rule.category_id);
        setWeekendAdjust(rule.weekend_adjust);
      } else {
        setName("");
        setAmount("");
        setKind(defaultKind);
        setFrequency("monthly");
        setStartDate(new Date().toISOString().slice(0, 10));
        setCategoryId(null);
        setWeekendAdjust(false);
      }
    }
  }, [open, rule, defaultKind]);

  const filteredCats = categories.filter((c) => c.type === kind);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      name,
      amount: Number(amount),
      kind,
      frequency,
      start_date: startDate,
      category_id: categoryId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }

    setSubmitting(true);
    if (rule) {
      const { error } = await supabase
        .from("recurring_rules")
        .update({
          name: parsed.data.name,
          amount: parsed.data.amount,
          kind: parsed.data.kind,
          frequency: parsed.data.frequency,
          start_date: parsed.data.start_date,
          next_run: parsed.data.start_date,
          category_id: parsed.data.category_id,
          weekend_adjust: weekendAdjust,
        })
        .eq("id", rule.id);
      setSubmitting(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Updated");
    } else {
      if (!householdId) { setSubmitting(false); toast.error("Loading household…"); return; }
      const { error } = await supabase.from("recurring_rules").insert({
        user_id: user.id,
        household_id: householdId,
        name: parsed.data.name,
        amount: parsed.data.amount,
        kind: parsed.data.kind,
        frequency: parsed.data.frequency,
        start_date: parsed.data.start_date,
        next_run: parsed.data.start_date,
        category_id: parsed.data.category_id,
        weekend_adjust: weekendAdjust,
      });
      setSubmitting(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Recurring rule added");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit recurring rule" : "Add recurring rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("income")}
              className={cn(
                "rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all",
                kind === "income"
                  ? "border-success bg-success/10 text-success"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => setKind("outgoing")}
              className={cn(
                "rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all",
                kind === "outgoing"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              Outgoing
            </button>
          </div>

          <div>
            <Label htmlFor="rname">Name</Label>
            <Input
              id="rname"
              required
              maxLength={120}
              placeholder={kind === "income" ? "Salary" : "Rent"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="ramount">Amount (£)</Label>
            <Input
              id="ramount"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="mt-1 h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="fourweekly">Every 4 Weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rstart">Start / next</Label>
              <Input
                id="rstart"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label>Category</Label>
            <Select
              value={categoryId ?? "none"}
              onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
            >
              <SelectTrigger className="mt-1 h-11 rounded-xl">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {filteredCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Adjust for weekends</p>
              <p className="text-xs text-muted-foreground">
                {kind === "income"
                  ? "Falls on weekend → paid the Friday before"
                  : "Falls on weekend → taken the Monday after"}
              </p>
            </div>
            <Switch checked={weekendAdjust} onCheckedChange={setWeekendAdjust} />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : rule ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
