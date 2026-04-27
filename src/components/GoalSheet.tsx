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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  color: string;
  icon: string;
}

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
];

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  target_amount: z.number().positive().max(10_000_000),
  target_date: z.string().nullable(),
  color: z.string(),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  goal?: Goal | null;
}

export function GoalSheet({ open, onOpenChange, goal }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState<string>("");
  const [color, setColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (goal) {
        setName(goal.name);
        setTarget(String(goal.target_amount));
        setDate(goal.target_date ?? "");
        setColor(goal.color);
      } else {
        setName("");
        setTarget("");
        setDate("");
        setColor(COLORS[0]);
      }
    }
  }, [open, goal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      name,
      target_amount: Number(target),
      target_date: date || null,
      color,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSubmitting(true);
    if (goal) {
      const { error } = await supabase
        .from("goals")
        .update({
          name: parsed.data.name,
          target_amount: parsed.data.target_amount,
          target_date: parsed.data.target_date,
          color: parsed.data.color,
        })
        .eq("id", goal.id);
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Goal updated");
    } else {
      const { error } = await supabase.from("goals").insert({
        user_id: user.id,
        name: parsed.data.name,
        target_amount: parsed.data.target_amount,
        target_date: parsed.data.target_date,
        color: parsed.data.color,
      });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Goal created");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="gname">Name</Label>
            <Input
              id="gname"
              required
              maxLength={120}
              placeholder="Holiday in Italy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="gtarget">Target (£)</Label>
            <Input
              id="gtarget"
              required
              inputMode="decimal"
              placeholder="2000"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="gdate">Target date (optional)</Label>
            <Input
              id="gdate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <Label>Colour</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-9 w-9 rounded-full border-2 transition-transform",
                    color === c ? "scale-110 border-foreground" : "border-transparent",
                  )}
                  style={{ background: c }}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : goal ? "Save changes" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
