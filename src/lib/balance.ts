export interface BalanceTransaction {
  amount: number;
  kind: "income" | "outgoing" | "shopping";
  occurred_on: string; // YYYY-MM-DD
}

export interface BalanceOptions {
  openingBalance: number;
  openingBalanceDate?: string | null; // YYYY-MM-DD
  transactions: BalanceTransaction[];
}

/**
 * Calculates the true running balance.
 * Uses the Family Budget formula: 
 * Balance = Opening Balance + Income (since OB) - Outgoings (since OB)
 */
export function calculateCurrentBalance({ openingBalance, openingBalanceDate, transactions }: BalanceOptions): number {
  let balance = openingBalance;
  
  transactions.forEach((tx) => {
    // If an opening balance date is set, only count transactions ON OR AFTER that date.
    // Transactions before this date are assumed to be already accounted for in the opening balance.
    if (openingBalanceDate && tx.occurred_on < openingBalanceDate) {
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
