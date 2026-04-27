import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCategories, type Category } from "@/hooks/useCategories";
import { formatMoney, formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Search, TrendingUp, TrendingDown, ShoppingCart, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { z } from "zod";

type PaymentFrequency = "weekly" | "4-weekly" | "monthly";

const PAYMENT_FREQUENCIES: { value: PaymentFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "4-weekly", label: "4-Weekly" },
  { value: "monthly", label: "Monthly" },
];

const editSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(1_000_000),
  source: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  occurred_on: z.string().min(1),
  category_id: z.string().uuid().nullable(),
  payment_frequency: z.string().nullable(),
});

export const Route = createFileRoute("/_app/transactions")({
  head: () => ({ meta: [{ title: "Activity — Pursely" }] }),
  component: TransactionsPage,
});

interface Tx {
  id: string;
  kind: "income" | "outgoing" | "shopping";
  amount: number;
  occurred_on: string;
  source: string | null;
  note: string | null;
  category_id: string | null;
  payment_frequency: string | null;
}

type Filter = "all" | "income" | "outgoing" | "shopping";

function TransactionsPage() {
  const { user } = useAuth();
  const { categories } = useCategories();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editTx, setEditTx] = useState<Tx | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function load() {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, kind, amount, occurred_on, source, note, category_id, payment_frequency")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!mounted) return;
      if (error) {
        toast.error(error.message);
      } else {
        setTxs((data as Tx[]) ?? []);
      }
      setLoading(false);
    }
    load();
    const channel = supabase
      .channel("tx-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs.filter((t) => {
      if (filter !== "all" && t.kind !== filter) return false;
      if (!q) return true;
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      return (
        (t.source ?? "").toLowerCase().includes(q) ||
        (t.note ?? "").toLowerCase().includes(q) ||
        (cat?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [txs, filter, search, catMap]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Tx[]>();
    for (const t of filtered) {
      const arr = groups.get(t.occurred_on) ?? [];
      arr.push(t);
      groups.set(t.occurred_on, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  async function handleDelete(id: string) {
    const prev = txs;
    setTxs((arr) => arr.filter((t) => t.id !== id));
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setTxs(prev);
      toast.error(error.message);
    } else {
      toast.success("Deleted");
    }
  }

  async function handleEditSave(
    id: string,
    data: {
      amount: number;
      source: string | null;
      note: string | null;
      occurred_on: string;
      category_id: string | null;
      payment_frequency: string | null;
    },
  ) {
    const { error } = await supabase.from("transactions").update(data).eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    setTxs((arr) => arr.map((t) => (t.id === id ? { ...t, ...data } : t)));
    toast.success("Updated");
    return true;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every penny in and out, in real time.
        </p>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search source, note, or category…"
            className="h-11 rounded-xl pl-9"
            maxLength={100}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-muted p-1">
          {(["all", "income", "outgoing", "shopping"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                filter === f
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {txs.length === 0
              ? "No transactions yet — tap + to add your first."
              : "Nothing matches your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, items]) => {
            const dayTotal = items.reduce(
              (s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)),
              0,
            );
            return (
              <section key={date}>
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{formatShortDate(date)}</span>
                  <span className={dayTotal >= 0 ? "text-success" : "text-destructive"}>
                    {dayTotal >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(dayTotal))}
                  </span>
                </div>
                <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
                  {items.map((t, idx) => {
                    const cat = t.category_id ? catMap.get(t.category_id) : null;
                    const Icon =
                      t.kind === "income"
                        ? TrendingUp
                        : t.kind === "shopping"
                          ? ShoppingCart
                          : TrendingDown;
                    return (
                      <li
                        key={t.id}
                        className={cn(
                          "group flex items-center gap-3 px-4 py-3",
                          idx > 0 && "border-t border-border",
                        )}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            background: (cat?.color ?? "#9ca3af") + "22",
                            color: cat?.color ?? "var(--muted-foreground)",
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {t.source ?? cat?.name ?? "Entry"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {cat?.name ?? "Uncategorised"}
                            {t.note ? ` · ${t.note}` : ""}
                          </p>
                          {t.kind === "income" && t.payment_frequency && (
                            <span className="mt-0.5 inline-block rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium capitalize text-success">
                              {PAYMENT_FREQUENCIES.find((f) => f.value === t.payment_frequency)?.label ?? t.payment_frequency}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular-nums",
                            t.kind === "income" ? "text-success" : "text-destructive",
                          )}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {formatMoney(t.amount)}
                        </span>
                        {t.kind !== "shopping" && (
                          <button
                            onClick={() => setEditTx(t)}
                            aria-label="Edit"
                            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t.id)}
                          aria-label="Delete"
                          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <EditTransactionDialog
        tx={editTx}
        categories={categories}
        onClose={() => setEditTx(null)}
        onSave={handleEditSave}
      />
    </div>
  );
}

function EditTransactionDialog({
  tx,
  categories,
  onClose,
  onSave,
}: {
  tx: Tx | null;
  categories: Category[];
  onClose: () => void;
  onSave: (
    id: string,
    data: {
      amount: number;
      source: string | null;
      note: string | null;
      occurred_on: string;
      category_id: string | null;
      payment_frequency: string | null;
    },
  ) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tx) {
      setAmount(String(tx.amount));
      setSource(tx.source ?? "");
      setNote(tx.note ?? "");
      setDate(tx.occurred_on);
      setCategoryId(tx.category_id);
      setPaymentFrequency((tx.payment_frequency as PaymentFrequency | null) ?? null);
    }
  }, [tx]);

  const filteredCats = categories.filter(
    (c) => c.type === (tx?.kind === "income" ? "income" : "outgoing"),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tx) return;

    const parsed = editSchema.safeParse({
      amount: Number(amount),
      source: source || undefined,
      note: note || undefined,
      occurred_on: date,
      category_id: categoryId,
      payment_frequency: tx.kind === "income" ? paymentFrequency : null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your entry");
      return;
    }

    setSubmitting(true);
    const ok = await onSave(tx.id, {
      amount: parsed.data.amount,
      source: parsed.data.source ?? null,
      note: parsed.data.note ?? null,
      occurred_on: parsed.data.occurred_on,
      category_id: parsed.data.category_id,
      payment_frequency: parsed.data.payment_frequency,
    });
    setSubmitting(false);
    if (ok) onClose();
  }

  const accentClass = tx?.kind === "income" ? "text-success" : "text-destructive";

  return (
    <Dialog open={!!tx} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {tx?.kind === "income" ? "income" : "outgoing"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount (£)</Label>
            <div className="mt-1 flex items-center rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)] focus-within:border-primary">
              <span className={cn("text-2xl font-semibold", accentClass)}>£</span>
              <input
                inputMode="decimal"
                required
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className="ml-2 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {tx?.kind === "income" && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment frequency (optional)
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PAYMENT_FREQUENCIES.map((f) => {
                  const active = paymentFrequency === f.value;
                  return (
                    <button
                      type="button"
                      key={f.value}
                      onClick={() => setPaymentFrequency(active ? null : f.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                        active
                          ? "border-transparent bg-success text-success-foreground shadow-[var(--shadow-soft)]"
                          : "border-border bg-card text-foreground hover:border-foreground/30",
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredCats.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredCats.map((c) => {
                  const active = categoryId === c.id;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setCategoryId(active ? null : c.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                        active
                          ? "border-transparent text-primary-foreground shadow-[var(--shadow-soft)]"
                          : "border-border bg-card text-foreground hover:border-foreground/30",
                      )}
                      style={
                        active
                          ? { background: c.color, color: "white" }
                          : { borderLeft: `3px solid ${c.color}` }
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {tx?.kind === "income" ? "Source" : "Where"}
              </Label>
              <Input
                type="text"
                maxLength={120}
                placeholder={tx?.kind === "income" ? "Employer" : "Tesco"}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Note (optional)</Label>
            <Textarea
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 rounded-xl"
              placeholder="Anything to remember…"
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
