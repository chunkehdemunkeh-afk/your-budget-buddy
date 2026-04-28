import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";



interface Props {
  kind: "income" | "outgoing";
  title: string;
  accentClass: string; // tailwind text/bg accent
}

const schema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(1_000_000),
  source: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  occurred_on: z.string().min(1),
  category_id: z.string().uuid().nullable(),
});

export function EntryForm({ kind, title, accentClass }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, loading: catLoading } = useCategories();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === (kind === "income" ? "income" : "outgoing")),
    [categories, kind],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const parsed = schema.safeParse({
      amount: Number(amount),
      source: source || undefined,
      note: note || undefined,
      occurred_on: date,
      category_id: categoryId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your entry");
      return;
    }

    if (!householdId) { toast.error("Loading household…"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      household_id: householdId,
      kind,
      amount: parsed.data.amount,
      source: parsed.data.source ?? null,
      note: parsed.data.note ?? null,
      occurred_on: parsed.data.occurred_on,
      category_id: parsed.data.category_id,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(kind === "income" ? "Income added" : "Outgoing added");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-24 md:pt-10">
      <div className="mb-6 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2">
          <Link to="/dashboard" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <Label htmlFor="amount" className="text-xs uppercase tracking-wide text-muted-foreground">
            Amount (£)
          </Label>
          <div className="mt-1 flex items-center rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)] focus-within:border-primary">
            <span className={cn("text-2xl font-semibold", accentClass)}>£</span>
            <input
              id="amount"
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

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
          {catLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
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
          )}
        </div>



        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label
              htmlFor="date"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Date
            </Label>
            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
          <div>
            <Label
              htmlFor="source"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              {kind === "income" ? "Source" : "Where"}
            </Label>
            <Input
              id="source"
              type="text"
              maxLength={120}
              placeholder={kind === "income" ? "Employer" : "Tesco"}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="note" className="text-xs uppercase tracking-wide text-muted-foreground">
            Note (optional)
          </Label>
          <Textarea
            id="note"
            maxLength={500}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 rounded-xl"
            placeholder="Anything to remember…"
          />
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className={cn(
            "h-12 w-full rounded-xl text-base font-semibold shadow-[var(--shadow-glow)]",
            kind === "income"
              ? "bg-success text-success-foreground hover:bg-success/90"
              : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          )}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Saving…" : `Save ${kind === "income" ? "income" : "outgoing"}`}
        </Button>
      </form>
    </div>
  );
}
