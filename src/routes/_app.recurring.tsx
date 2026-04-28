import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { Plus, Repeat, Pencil, Trash2, Play, Repeat2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatShortDate } from "@/lib/format";
import { frequencyLabel, nextRunFrom, toDateOnly, displayNextRun } from "@/lib/recurring";
import { RecurringSheet, type RecurringRule } from "@/components/RecurringSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/recurring")({
  head: () => ({ meta: [{ title: "Recurring — Pursely" }] }),
  component: RecurringPage,
});

interface OneOffBill {
  id: string;
  name: string;
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_at: string | null;
}

function RecurringPage() {
  const { user, householdId } = useAuth();
  const { categories } = useCategories();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [defaultKind, setDefaultKind] = useState<"income" | "outgoing">("outgoing");
  const [confirmDelete, setConfirmDelete] = useState<RecurringRule | null>(null);

  // One-off bills
  const [oneOffBills, setOneOffBills] = useState<OneOffBill[]>([]);
  const [oneOffLoading, setOneOffLoading] = useState(true);
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDue, setNewBillDue] = useState("");
  const [addingBill, setAddingBill] = useState(false);
  const [confirmDeleteBill, setConfirmDeleteBill] = useState<OneOffBill | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function load() {
      const { data, error } = await supabase
        .from("recurring_rules")
        .select("id, name, amount, kind, frequency, start_date, next_run, category_id, paused")
        .order("next_run", { ascending: true });
      if (!mounted) return;
      if (error) toast.error(error.message);
      setRules((data as RecurringRule[]) ?? []);
      setLoading(false);
    }
    load();
    const channel = supabase
      .channel("rec-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "recurring_rules" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function loadBills() {
      const { data, error } = await supabase
        .from("one_off_bills")
        .select("id, name, amount, due_date, paid, paid_at")
        .order("paid", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (!mounted) return;
      if (error) toast.error(error.message);
      setOneOffBills((data as OneOffBill[]) ?? []);
      setOneOffLoading(false);
    }
    loadBills();
    const channel = supabase
      .channel("one-off-bills")
      .on("postgres_changes", { event: "*", schema: "public", table: "one_off_bills" }, () =>
        loadBills(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const outgoing = rules.filter((r) => r.kind === "outgoing");
  const income = rules.filter((r) => r.kind === "income");
  const unpaidBills = oneOffBills.filter((b) => !b.paid).length;

  async function togglePaused(rule: RecurringRule) {
    const { error } = await supabase
      .from("recurring_rules")
      .update({ paused: !rule.paused })
      .eq("id", rule.id);
    if (error) toast.error(error.message);
  }

  async function runNow(rule: RecurringRule) {
    if (!user || !householdId) return;
    const today = toDateOnly(new Date());
    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      household_id: householdId,
      kind: rule.kind,
      amount: rule.amount,
      occurred_on: today,
      source: rule.name,
      category_id: rule.category_id,
      recurring_rule_id: rule.id,
    });
    if (txErr) {
      toast.error(txErr.message);
      return;
    }
    const next = toDateOnly(nextRunFrom(new Date(rule.next_run), rule.frequency));
    await supabase.from("recurring_rules").update({ next_run: next }).eq("id", rule.id);
    toast.success(`${rule.name} posted · next ${formatShortDate(next)}`);
  }

  async function handleDelete() {
    if (!confirmDelete) return;

    // First, detach any existing transactions so they stay intact without violating the foreign key constraint
    await supabase
      .from("transactions")
      .update({ recurring_rule_id: null })
      .eq("recurring_rule_id", confirmDelete.id);

    // Now safely delete the rule
    const { error } = await supabase
      .from("recurring_rules")
      .delete()
      .eq("id", confirmDelete.id);

    setConfirmDelete(null);
    if (error) toast.error(error.message);
    else toast.success("Deleted");
  }

  async function toggleBillPaid(bill: OneOffBill) {
    if (!user || !householdId) return;
    const paid = !bill.paid;
    if (paid) {
      const today = toDateOnly(new Date());
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user.id,
        household_id: householdId,
        kind: "outgoing",
        amount: bill.amount,
        occurred_on: today,
        source: bill.name,
      });
      if (txErr) { toast.error(txErr.message); return; }
    }
    const { error } = await supabase
      .from("one_off_bills")
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .eq("id", bill.id);
    if (error) toast.error(error.message);
    else if (paid) toast.success(`${bill.name} marked as paid`);
  }

  async function addBill() {
    if (!user || !householdId || !newBillName.trim() || !newBillAmount) return;
    setAddingBill(true);
    const amount = Number(newBillAmount);
    const due_date = newBillDue || null;
    const { error } = await supabase.from("one_off_bills").insert({
      user_id: user.id,
      household_id: householdId,
      name: newBillName.trim(),
      amount,
      due_date,
    });
    setAddingBill(false);
    if (error) { toast.error(error.message); return; }
    setNewBillName("");
    setNewBillAmount("");
    setNewBillDue("");
  }

  async function deleteBill() {
    if (!confirmDeleteBill) return;
    const { error } = await supabase.from("one_off_bills").delete().eq("id", confirmDeleteBill.id);
    setConfirmDeleteBill(null);
    if (error) toast.error(error.message);
    else toast.success("Removed");
  }

  function openAdd(kind: "income" | "outgoing") {
    setEditing(null);
    setDefaultKind(kind);
    setOpen(true);
  }
  function openEdit(rule: RecurringRule) {
    setEditing(rule);
    setDefaultKind(rule.kind);
    setOpen(true);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Recurring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bills and income that auto-post on schedule.
          </p>
        </div>
      </header>

      <Tabs defaultValue="outgoing">
        <TabsList className="grid w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="outgoing" className="rounded-lg">
            Bills ({outgoing.length})
          </TabsTrigger>
          <TabsTrigger value="income" className="rounded-lg">
            Income ({income.length})
          </TabsTrigger>
          <TabsTrigger value="oneoff" className="rounded-lg">
            One-off {unpaidBills > 0 && `(${unpaidBills})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outgoing" className="mt-5 space-y-4">
          <Button
            onClick={() => openAdd("outgoing")}
            className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            <Plus className="h-4 w-4" /> Add bill
          </Button>
          <RuleList
            rules={outgoing}
            loading={loading}
            emptyText="No recurring bills yet."
            catMap={catMap}
            onEdit={openEdit}
            onDelete={(r) => setConfirmDelete(r)}
            onTogglePaused={togglePaused}
            onRunNow={runNow}
          />
        </TabsContent>

        <TabsContent value="income" className="mt-5 space-y-4">
          <Button
            onClick={() => openAdd("income")}
            className="h-11 w-full rounded-xl bg-success font-semibold text-success-foreground shadow-[var(--shadow-glow)] hover:bg-success/90"
          >
            <Plus className="h-4 w-4" /> Add income stream
          </Button>
          <RuleList
            rules={income}
            loading={loading}
            emptyText="No recurring income yet."
            catMap={catMap}
            onEdit={openEdit}
            onDelete={(r) => setConfirmDelete(r)}
            onTogglePaused={togglePaused}
            onRunNow={runNow}
          />
        </TabsContent>

        <TabsContent value="oneoff" className="mt-5 space-y-4">
          {/* Add form */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] space-y-3">
            <p className="text-sm font-semibold">Add one-off bill</p>
            <Input
              placeholder="Bill name"
              value={newBillName}
              onChange={(e) => setNewBillName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBill()}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={newBillAmount}
                onChange={(e) => setNewBillAmount(e.target.value)}
                className="flex-1"
              />
              <Input
                type="date"
                placeholder="Due date"
                value={newBillDue}
                onChange={(e) => setNewBillDue(e.target.value)}
                className="flex-1"
              />
            </div>
            <Button
              onClick={addBill}
              disabled={!newBillName.trim() || !newBillAmount || addingBill}
              className="h-10 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {/* Bill list */}
          <OneOffList
            bills={oneOffBills}
            loading={oneOffLoading}
            onToggle={toggleBillPaid}
            onDelete={(b) => setConfirmDeleteBill(b)}
          />
        </TabsContent>
      </Tabs>

      <RecurringSheet
        open={open}
        onOpenChange={setOpen}
        rule={editing}
        defaultKind={defaultKind}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be removed. Past transactions stay intact.
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

      <AlertDialog open={!!confirmDeleteBill} onOpenChange={(v) => !v && setConfirmDeleteBill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDeleteBill?.name}" will be removed from your list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteBill}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OneOffList({
  bills,
  loading,
  onToggle,
  onDelete,
}: {
  bills: OneOffBill[];
  loading: boolean;
  onToggle: (b: OneOffBill) => void;
  onDelete: (b: OneOffBill) => void;
}) {
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (bills.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 py-12 text-center">
        <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">No one-off bills yet.</p>
      </div>
    );
  }

  const unpaid = bills.filter((b) => !b.paid);
  const paid = bills.filter((b) => b.paid);

  return (
    <div className="space-y-4">
      {unpaid.length > 0 && (
        <ul className="space-y-2.5">
          {unpaid.map((b) => <BillItem key={b.id} bill={b} onToggle={onToggle} onDelete={onDelete} />)}
        </ul>
      )}
      {paid.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
          <ul className="space-y-2">
            {paid.map((b) => <BillItem key={b.id} bill={b} onToggle={onToggle} onDelete={onDelete} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function BillItem({
  bill,
  onToggle,
  onDelete,
}: {
  bill: OneOffBill;
  onToggle: (b: OneOffBill) => void;
  onDelete: (b: OneOffBill) => void;
}) {
  const today = toDateOnly(new Date());
  const overdue = !bill.paid && bill.due_date && bill.due_date < today;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition-opacity",
        bill.paid && "opacity-50",
      )}
    >
      <Checkbox
        checked={bill.paid}
        onCheckedChange={() => onToggle(bill)}
        className="h-5 w-5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold", bill.paid && "line-through text-muted-foreground")}>
          {bill.name}
        </p>
        <p className={cn("mt-0.5 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {formatMoney(bill.amount)}
          {bill.due_date && ` · Due ${formatShortDate(bill.due_date)}`}
          {overdue && " · Overdue"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(bill)}
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function RuleList({
  rules,
  loading,
  emptyText,
  catMap,
  onEdit,
  onDelete,
  onTogglePaused,
  onRunNow,
}: {
  rules: RecurringRule[];
  loading: boolean;
  emptyText: string;
  catMap: Map<string, { name: string; color: string }>;
  onEdit: (r: RecurringRule) => void;
  onDelete: (r: RecurringRule) => void;
  onTogglePaused: (r: RecurringRule) => void;
  onRunNow: (r: RecurringRule) => void;
}) {
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (rules.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 py-12 text-center">
        <Repeat2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2.5">
      {rules.map((r) => {
        const cat = r.category_id ? catMap.get(r.category_id) : null;
        return (
          <li
            key={r.id}
            className={cn(
              "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition-opacity",
              r.paused && "opacity-60",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: (cat?.color ?? "#6366f1") + "22",
                  color: cat?.color ?? "var(--primary)",
                }}
              >
                <Repeat className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{r.name}</p>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      r.kind === "income" ? "text-success" : "text-destructive",
                    )}
                  >
                    {r.kind === "income" ? "+" : "−"}
                    {formatMoney(r.amount)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {frequencyLabel(r.frequency)} · next {formatShortDate(displayNextRun(r.next_run, r.frequency))}
                  {cat ? ` · ${cat.name}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs">
                <Switch checked={!r.paused} onCheckedChange={() => onTogglePaused(r)} />
                <span className="text-muted-foreground">{r.paused ? "Paused" : "Active"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRunNow(r)}
                  className="h-8 gap-1 px-2 text-xs"
                  title="Post now and roll forward"
                >
                  <Play className="h-3.5 w-3.5" /> Pay now
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(r)}
                  className="h-8 w-8"
                  aria-label="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(r)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
