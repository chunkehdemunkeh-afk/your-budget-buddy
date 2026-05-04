export const FOOD_RATES = {
  adult: 200,
  child: 140,
  pet: 30,
} as const;

export function calculateFoodBudget(
  adults: number,
  children: number,
  pets: number,
): number {
  const a = Math.max(0, Math.floor(adults || 0));
  const c = Math.max(0, Math.floor(children || 0));
  const p = Math.max(0, Math.floor(pets || 0));
  return a * FOOD_RATES.adult + c * FOOD_RATES.child + p * FOOD_RATES.pet;
}

export interface HouseholdComposition {
  adults: number | null;
  children: number | null;
  pets: number | null;
  food_budget_override: number | null;
}

export function effectiveFoodBudget(h: HouseholdComposition | null | undefined): number {
  if (!h) return 0;
  if (h.food_budget_override != null) return Number(h.food_budget_override);
  return calculateFoodBudget(h.adults ?? 0, h.children ?? 0, h.pets ?? 0);
}
