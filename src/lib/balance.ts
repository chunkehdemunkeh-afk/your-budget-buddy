import { toDateOnly } from "@/lib/recurring";

export interface BalanceTransaction {
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  occurred_on: string; // YYYY-MM-DD
}

export interface BalanceOptions {
  openingBalance: number;
  openingBalanceDate?: string | null; // YYYY-MM-DD
  transactions: BalanceTransaction[];
  asOfDate?: string; // YYYY-MM-DD; defaults to today
}

/**
 * Calculates the true running balance.
 * Uses the Family Budget formula: 
 * Balance = Opening Balance + Income (since OB) - Outgoings (since OB)
 */
export function calculateCurrentBalance({ openingBalance, openingBalanceDate, transactions, asOfDate }: BalanceOptions): number {
  const today = asOfDate ?? toDateOnly(new Date());
  let balance = openingBalance;

  transactions.forEach((tx) => {
    // Only count transactions ON OR AFTER the opening balance date.
    if (openingBalanceDate && tx.occurred_on < openingBalanceDate) {
      return;
    }
    // Exclude future-dated transactions — they haven't happened yet.
    if (tx.occurred_on > today) {
      return;
    }
    
    if (tx.kind === "income") {
      balance += Number(tx.amount);
    } else {
      balance -= Number(tx.amount);
    }
  });

  return balance;
}

/**
 * Calculates the month's net income/outgoing
 */
export function calculateMonthNet(transactions: BalanceTransaction[], monthStartStr: string): { income: number, outgoing: number, net: number } {
  let income = 0;
  let outgoing = 0;
  
  transactions.forEach((tx) => {
    if (tx.occurred_on >= monthStartStr) {
      if (tx.kind === "income") {
        income += Number(tx.amount);
      } else {
        outgoing += Number(tx.amount);
      }
    }
  });
  
  return { income, outgoing, net: income - outgoing };
}
