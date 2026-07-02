import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { addDays, addMonths, addYears } from "date-fns";

type Frequency = "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly" | "custom";

function nextRunFrom(date: Date, frequency: Frequency, intervalDays?: number | null): Date {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "fortnightly":
      return addDays(date, 14);
    case "fourweekly":
      return addDays(date, 28);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addYears(date, 1);
    case "custom":
      return addDays(date, Math.max(1, intervalDays ?? 1));
  }
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Mirror of src/lib/recurring.ts adjustForWeekend — kept inline to avoid
// importing client-side modules into the server route.
function adjustForWeekend(dateStr: string, kind: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getUTCDay();
  if (dow === 6) {
    d.setUTCDate(d.getUTCDate() + (kind === "income" ? -1 : 2));
  } else if (dow === 0) {
    d.setUTCDate(d.getUTCDate() + (kind === "income" ? -2 : 1));
  }
  return toDateOnly(d);
}

interface DueRule {
  id: string;
  user_id: string;
  household_id: string;
  name: string;
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  frequency: Frequency;
  next_run: string;
  category_id: string | null;
  weekend_adjust: boolean;
  interval_days: number | null;
  end_date: string | null;
}

export const Route = createFileRoute("/api/public/hooks/run-recurring")({
  server: {
    handlers: {
      POST: async () => {
        const today = toDateOnly(new Date());
        let processed = 0;
        let skipped = 0;
        const errors: string[] = [];
        // Look 2 days ahead so income with weekend_adjust (Sat→Fri / Sun→Fri)
        // can fire on the adjusted Friday.
        const lookahead = toDateOnly(new Date(Date.now() + 2 * 86400000));

        const { data: due, error } = await supabaseAdmin
          .from("recurring_rules")
          .select(
            "id, user_id, household_id, name, amount, kind, frequency, next_run, category_id, weekend_adjust, interval_days, end_date",
          )
          .eq("paused", false)
          .lte("next_run", lookahead)
          .limit(500);

        if (error) {
          return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        for (const rule of (due as DueRule[] | null) ?? []) {
          // Rule has ended — pause it and skip.
          if (rule.end_date && rule.next_run > rule.end_date) {
            const { error: pErr } = await supabaseAdmin
              .from("recurring_rules")
              .update({ paused: true })
              .eq("id", rule.id);
            if (pErr) errors.push(`pause ${rule.id}: ${pErr.message}`);
            skipped++;
            continue;
          }

          // Compute the actual fire date, honouring weekend_adjust.
          const fireDate = rule.weekend_adjust
            ? adjustForWeekend(rule.next_run, rule.kind)
            : rule.next_run;

          // Not due yet (e.g. income shifted to a Friday that's still ahead).
          if (fireDate > today) {
            skipped++;
            continue;
          }

          // Past the configured end date — don't fire.
          if (rule.end_date && fireDate > rule.end_date) {
            skipped++;
            continue;
          }

          // Fire only when the adjusted date is exactly today. Past adjusted
          // dates are stale — roll forward without back-firing.
          if (fireDate === today) {
            const { data: existing } = await supabaseAdmin
              .from("transactions")
              .select("id")
              .eq("recurring_rule_id", rule.id)
              .eq("occurred_on", today)
              .limit(1)
              .maybeSingle();

            if (!existing) {
              const { error: txErr } = await supabaseAdmin.from("transactions").insert({
                user_id: rule.user_id,
                household_id: rule.household_id,
                kind: rule.kind,
                amount: rule.amount,
                occurred_on: today,
                source: rule.name,
                category_id: rule.category_id,
                recurring_rule_id: rule.id,
              });
              if (txErr) {
                errors.push(`${rule.id}: ${txErr.message}`);
              } else {
                processed++;
              }
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }

          // Advance next_run past the raw scheduled date. Use the raw
          // next_run as the anchor (not the adjusted date) so the schedule
          // stays on its true cycle.
          let next = nextRunFrom(new Date(rule.next_run), rule.frequency, rule.interval_days);
          const todayDate = new Date(today);
          while (next <= todayDate) {
            next = nextRunFrom(next, rule.frequency, rule.interval_days);
          }
          const nextStr = toDateOnly(next);
          const { error: upErr } = await supabaseAdmin
            .from("recurring_rules")
            .update({ next_run: nextStr })
            .eq("id", rule.id);
          if (upErr) errors.push(`update ${rule.id}: ${upErr.message}`);
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
