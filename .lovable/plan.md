## Per-household food budget

Replace the hardcoded £1,600 family food budget with a per-household value that's calculated from household composition by default but can be overridden manually.

### How the budget gets calculated

UK-average monthly food costs used as the suggested default:

- Adults: **£200** each
- Children: **£140** each
- Pets: **£30** each

Example: 2 adults + 4 children + 1 pet = £200×2 + £140×4 + £30 = **£990/month**

The user enters the three numbers, sees the suggested total, and can either accept it or type a different number. If they edit the manual override, that number is used everywhere. If they clear it, we fall back to the calculated value.

### Settings UI (Household section)

A new "Food budget" subsection under Household, above the members list:

```text
Food budget
─────────────────────────
Adults    [ 2 ]
Children  [ 4 ]
Pets      [ 1 ]

Suggested: £990/month
(£200/adult, £140/child, £30/pet)

Monthly food budget
£ [ 990            ]   [Use suggested]
```

The "Use suggested" button appears only when the manual figure differs from the calculated one. Saved together with the rest of the household via the existing "Save household" button.

### Where it's used

The Insights page food shopping tracker currently shows hardcoded "£1,600 family budget" in 5 places (progress bar, headline, remaining/over text, smart suggestion bodies). All of these switch to read the household's budget. Copy changes from "the £1,600 family budget" → "your monthly food budget".

### Technical details

**Database** (migration):
- Add to `households` table:
  - `adults int not null default 2`
  - `children int not null default 0`
  - `pets int not null default 0`
  - `food_budget_override numeric` (nullable — null means "use calculated")

**Shared helper** (`src/lib/food-budget.ts`, new file):
```ts
export const FOOD_RATES = { adult: 200, child: 140, pet: 30 };
export function calculateFoodBudget(adults, children, pets) { ... }
export function effectiveFoodBudget(household) {
  return household.food_budget_override
    ?? calculateFoodBudget(household.adults, household.children, household.pets);
}
```

**Settings page** (`src/routes/_app.settings.tsx`):
- Load the four new fields alongside existing household data
- Add inputs + suggested calculation display
- Include the four fields in the `saveHousehold` update

**Insights page** (`src/routes/_app.insights.tsx`):
- Remove `const FOOD_BUDGET = 1600`
- Fetch household record (or get from `useAuth` if extended) to compute `effectiveFoodBudget`
- Replace 5 hardcoded references with the dynamic value
- Update copy: "£1,600 family budget" → "monthly food budget" / dynamic amount

**Backwards compatibility**: existing households default to 2 adults / 0 children / 0 pets = £400 suggested. Users can correct on first visit to Settings. No data loss.

### Out of scope

- No per-category budgets for non-food spending (separate feature)
- Suggested rates are fixed constants, not user-configurable (can revisit later)
