import { addDays, addMonths, addYears } from "date-fns";

export type Frequency = "weekly" | "fortnightly" | "monthly" | "yearly";

export function frequencyLabel(f: Frequency): string {
  return { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", yearly: "Yearly" }[f];
}

export function nextRunFrom(date: Date, frequency: Frequency): Date {
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

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
