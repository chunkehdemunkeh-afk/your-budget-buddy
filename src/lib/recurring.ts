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
