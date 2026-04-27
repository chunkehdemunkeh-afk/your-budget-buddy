import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { addDays, addMonths, addYears } from "date-fns";

type Frequency = "weekly" | "fortnightly" | "monthly" | "yearly";

function nextRunFrom(date: Date, frequency: Frequency): Date {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "fortnightly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addYears(date, 1);
  }
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DueRule {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  frequency: Frequency;
  next_run: string;
  category_id: string | null;
}

export const Route = createFileRoute("/api/public/hooks/run-recurring")({
  server: {
    handlers: {
      POST: async () => {
        const today = toDateOnly(new Date());
        let processed = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Loop until no more due rules (some rules may catch up multiple cycles)
        for (let pass = 0; pass < 10; pass++) {
          const { data: due, error } = await supabaseAdmin
            .from("recurring_rules")
            .select("id, user_id, name, amount, kind, frequency, next_run, category_id")
            .eq("paused", false)
            .lte("next_run", today)
            .limit(500);

          if (error) {
            return new Response(
              JSON.stringify({ ok: false, error: error.message }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          if (!due || due.length === 0) break;

          for (const rule of due as DueRule[]) {
            // Idempotency: skip if a transaction already exists for this rule on this date
            const { data: existing } = await supabaseAdmin
              .from("transactions")
              .select("id")
              .eq("recurring_rule_id", rule.id)
              .eq("occurred_on", rule.next_run)
              .limit(1)
              .maybeSingle();

            if (!existing) {
              const { error: txErr } = await supabaseAdmin.from("transactions").insert({
                user_id: rule.user_id,
                kind: rule.kind,
                amount: rule.amount,
                occurred_on: rule.next_run,
                source: rule.name,
                category_id: rule.category_id,
                recurring_rule_id: rule.id,
              });
              if (txErr) {
                errors.push(`${rule.id}: ${txErr.message}`);
                // Still advance next_run so we don't retry every cron tick
              } else {
                processed++;
              }
            } else {
              skipped++;
            }

            const next = toDateOnly(nextRunFrom(new Date(rule.next_run), rule.frequency));
            const { error: upErr } = await supabaseAdmin
              .from("recurring_rules")
              .update({ next_run: next })
              .eq("id", rule.id);
            if (upErr) errors.push(`update ${rule.id}: ${upErr.message}`);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, processed, skipped, errors }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () =>
        new Response(JSON.stringify({ ok: true, message: "Use POST" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
