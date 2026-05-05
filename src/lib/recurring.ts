import { addDays, addMonths, addYears } from "date-fns";

export type Frequency = "weekly" | "fortnightly" | "fourweekly" | "monthly" | "yearly";

export function frequencyLabel(f: Frequency): string {
  return { 
    weekly: "Weekly", 
    fortnightly: "Fortnightly", 
    fourweekly: "Every 4 Weeks", 
    monthly: "Monthly", 
    yearly: "Yearly" 
  }[f];
}

export function nextRunFrom(date: Date, frequency: Frequency): Date {
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
  }
}

/** Returns the next occurrence >= today for display purposes, without touching the DB. */
export function displayNextRun(nextRun: string, frequency: Frequency): string {
  const today = toDateOnly(new Date());
  let d = new Date(nextRun + "T12:00:00");
  let dateStr = toDateOnly(d);
  while (dateStr < today) {
    d = nextRunFrom(d, frequency);
    dateStr = toDateOnly(d);
  }
  return dateStr;
}

export function toDateOnly(d: Date): string {
  // Use local date string to avoid timezone offset issues (like BST)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * If dateStr falls on a weekend, shift it to the nearest weekday.
 * Outgoing: Saturday/Sunday → following Monday (banks take DDs on next business day).
 * Income: Saturday/Sunday → preceding Friday (pay arrives early).
 */
export function adjustForWeekend(dateStr: string, kind: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 6) {
    // Saturday
    d.setDate(d.getDate() + (kind === "income" ? -1 : 2));
  } else if (dow === 0) {
    // Sunday
    d.setDate(d.getDate() + (kind === "income" ? -2 : 1));
  }
  return toDateOnly(d);
}

function stepByFrequency(dateStr: string, frequency: string, direction: 1 | -1): string {
  const d = new Date(dateStr + "T12:00:00");
  switch (frequency) {
    case "weekly": d.setDate(d.getDate() + 7 * direction); break;
    case "fortnightly": d.setDate(d.getDate() + 14 * direction); break;
    case "fourweekly": d.setDate(d.getDate() + 28 * direction); break;
    case "monthly": d.setMonth(d.getMonth() + direction); break;
    case "yearly": d.setFullYear(d.getFullYear() + direction); break;
    default: d.setDate(d.getDate() + direction);
  }
  return toDateOnly(d);
}

export function occurrencesInRange(
  nextRun: string,
  frequency: string,
  startStr: string,
  endStr: string,
): string[] {
  let cur = nextRun;
  for (let i = 0; i < 500; i++) {
    const prev = stepByFrequency(cur, frequency, -1);
    if (prev < startStr) break;
    cur = prev;
  }
  for (let i = 0; i < 500 && cur < startStr; i++) {
    cur = stepByFrequency(cur, frequency, 1);
  }
  const results: string[] = [];
  for (let i = 0; i < 500 && cur <= endStr; i++) {
    if (cur >= startStr) results.push(cur);
    cur = stepByFrequency(cur, frequency, 1);
  }
  return results;
}

// Returns occurrences of a rule within [startStr, endStr], applying weekend
// adjustment when enabled. Expands the search 2 days before startStr so that
// payments scheduled on the preceding Sat/Sun are correctly included.
export function adjustedOccurrencesInRange(
  rule: { next_run: string; frequency: string; kind: string; weekend_adjust: boolean },
  startStr: string,
  endStr: string,
): string[] {
  if (!rule.weekend_adjust) {
    return occurrencesInRange(rule.next_run, rule.frequency, startStr, endStr);
  }
  const expanded = new Date(startStr + "T12:00:00");
  expanded.setDate(expanded.getDate() - 2);
  const expandedStart = toDateOnly(expanded);
  const adjusted = occurrencesInRange(rule.next_run, rule.frequency, expandedStart, endStr)
    .map((ds) => adjustForWeekend(ds, rule.kind))
    .filter((ds) => ds >= startStr && ds <= endStr);
  return [...new Set(adjusted)];
}
