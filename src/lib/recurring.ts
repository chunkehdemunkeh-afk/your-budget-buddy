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

export function toDateOnly(d: Date): string {
  // Use local date string to avoid timezone offset issues (like BST)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
