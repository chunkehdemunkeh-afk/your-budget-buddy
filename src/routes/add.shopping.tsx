import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add/shopping")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Add shopping — Pursely" }] }),
  component: () => (
    <AuthProvider>
      <ShoppingPage />
    </AuthProvider>
  ),
});

function ShoppingPage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-24 md:pt-10">
      <div className="mb-6 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2">
          <Link to="/dashboard" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Add shopping</h1>
      </div>

      <Tabs defaultValue="quick">
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="quick" className="rounded-lg">Quick</TabsTrigger>
          <TabsTrigger value="itemised" className="rounded-lg">Itemised</TabsTrigger>
        </TabsList>
        <TabsContent value="quick" className="mt-5">
          <QuickShop />
        </TabsContent>
        <TabsContent value="itemised" className="mt-5">
          <ItemisedShop />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const baseSchema = z.object({
  total: z.number().positive("Total must be greater than 0").max(1_000_000),
  source: z.string().trim().max(120).optional(),
  occurred_on: z.string().min(1),
  category_id: z.string().uuid().nullable(),
});

function CategoryPills({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { categories, loading } = useCategories();
  const filtered = useMemo(() => categories.filter((c) => c.type === "outgoing"), [categories]);
  if (loading) return <p className="mt-2 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {filtered.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(active ? null : c.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
              active
                ? "border-transparent shadow-[var(--shadow-soft)]"
                : "border-border bg-card text-foreground hover:border-foreground/30",
            )}
            style={
              active ? { background: c.color, color: "white" } : { borderLeft: `3px solid ${c.color}` }
            }
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function QuickShop() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [total, setTotal] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = baseSchema.safeParse({
      total: Number(total),
      source: source || undefined,
      occurred_on: date,
      category_id: categoryId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your entry");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      kind: "shopping",
      amount: parsed.data.total,
      source: parsed.data.source ?? null,
      occurred_on: parsed.data.occurred_on,
      category_id: parsed.data.category_id,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Shopping added");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Total (£)</Label>
        <div className="mt-1 flex items-center rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)] focus-within:border-primary">
          <span className="text-2xl font-semibold text-primary">£</span>
          <input
            inputMode="decimal"
            required
            autoFocus
            placeholder="0.00"
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))}
            className="ml-2 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
        <CategoryPills value={categoryId} onChange={setCategoryId} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qd" className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
          <Input id="qd" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="qs" className="text-xs uppercase tracking-wide text-muted-foreground">Shop</Label>
          <Input id="qs" type="text" maxLength={120} placeholder="Tesco" value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-[image:var(--gradient-primary)] text-base font-semibold shadow-[var(--shadow-glow)]"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Saving…" : "Save shop"}
      </Button>
    </form>
  );
}

interface Item {
  id: string;
  name: string;
  amount: string;
  quantity: string;
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Item name required").max(120),
  amount: z.number().nonnegative().max(1_000_000),
  quantity: z.number().int().positive().max(999),
});

function ItemisedShop() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [source, setSource] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([
    { id: crypto.randomUUID(), name: "", amount: "", quantity: "1" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (Number(i.amount) || 0) * (Number(i.quantity) || 0),
        0,
      ),
    [items],
  );

  function update(id: string, patch: Partial<Item>) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function remove(id: string) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((i) => i.id !== id)));
  }
  function add() {
    setItems((arr) => [...arr, { id: crypto.randomUUID(), name: "", amount: "", quantity: "1" }]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (total <= 0) {
      toast.error("Add at least one item with an amount");
      return;
    }
    const cleaned: { name: string; amount: number; quantity: number }[] = [];
    for (const i of items) {
      if (!i.name.trim() && !i.amount) continue;
      const parsed = itemSchema.safeParse({
        name: i.name,
        amount: Number(i.amount) || 0,
        quantity: Number(i.quantity) || 1,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Check items");
        return;
      }
      cleaned.push(parsed.data);
    }
    if (cleaned.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSubmitting(true);
    const { data: txData, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        kind: "shopping",
        amount: total,
        source: source || null,
        occurred_on: date,
        category_id: categoryId,
      })
      .select("id")
      .single();

    if (txErr || !txData) {
      setSubmitting(false);
      toast.error(txErr?.message ?? "Could not save");
      return;
    }

    const rows = cleaned.map((i) => ({
      user_id: user.id,
      transaction_id: txData.id,
      name: i.name,
      amount: i.amount,
      quantity: i.quantity,
    }));
    const { error: itemErr } = await supabase.from("shopping_items").insert(rows);
    setSubmitting(false);

    if (itemErr) {
      toast.error(itemErr.message);
      return;
    }
    toast.success(`Shop saved · ${formatMoney(total)}`);
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="id" className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
          <Input id="id" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="is" className="text-xs uppercase tracking-wide text-muted-foreground">Shop</Label>
          <Input id="is" type="text" maxLength={120} placeholder="Tesco" value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
        <CategoryPills value={categoryId} onChange={setCategoryId} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Items</Label>
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
        <ul className="space-y-2">
          {items.map((i, idx) => (
            <li
              key={i.id}
              className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder={`Item ${idx + 1}`}
                  maxLength={120}
                  value={i.name}
                  onChange={(e) => update(i.id, { name: e.target.value })}
                  className="h-10 flex-1 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  disabled={items.length === 1}
                  className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="flex items-center rounded-lg border border-border bg-background px-2.5">
                  <span className="text-sm text-muted-foreground">£</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={i.amount}
                    onChange={(e) =>
                      update(i.id, { amount: e.target.value.replace(/[^\d.]/g, "") })
                    }
                    className="h-9 w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="flex items-center rounded-lg border border-border bg-background px-2.5">
                  <span className="text-sm text-muted-foreground">×</span>
                  <input
                    inputMode="numeric"
                    placeholder="1"
                    value={i.quantity}
                    onChange={(e) =>
                      update(i.id, { quantity: e.target.value.replace(/[^\d]/g, "") })
                    }
                    className="h-9 w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span className="text-xl font-bold">{formatMoney(total)}</span>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-[image:var(--gradient-primary)] text-base font-semibold shadow-[var(--shadow-glow)]"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Saving…" : `Save shop · ${formatMoney(total)}`}
      </Button>
    </form>
  );
}
