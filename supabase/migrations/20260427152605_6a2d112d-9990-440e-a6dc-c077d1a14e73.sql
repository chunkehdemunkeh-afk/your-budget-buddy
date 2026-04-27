
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "users select own profile" on public.profiles for select using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

-- CATEGORIES
create type public.category_type as enum ('income','outgoing');
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default 'circle',
  color text not null default '#6366f1',
  type public.category_type not null default 'outgoing',
  monthly_budget numeric(12,2),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "own categories all" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index categories_user_idx on public.categories(user_id);

-- TRANSACTIONS
create type public.transaction_kind as enum ('income','outgoing','shopping');
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.transaction_kind not null,
  amount numeric(12,2) not null check (amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  occurred_on date not null default current_date,
  note text,
  source text, -- e.g. 'Salary', shop name
  recurring_rule_id uuid,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "own transactions all" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index transactions_user_date_idx on public.transactions(user_id, occurred_on desc);

-- SHOPPING ITEMS (line items for itemised shops)
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.shopping_items enable row level security;
create policy "own shopping items all" on public.shopping_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index shopping_items_tx_idx on public.shopping_items(transaction_id);

-- RECURRING RULES
create type public.recurrence_frequency as enum ('weekly','fortnightly','monthly','yearly');
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.transaction_kind not null,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  frequency public.recurrence_frequency not null,
  day_of_cycle integer, -- day of month for monthly, day of week 1-7 for weekly
  start_date date not null default current_date,
  next_run date not null default current_date,
  paused boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.recurring_rules enable row level security;
create policy "own recurring all" on public.recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index recurring_user_next_idx on public.recurring_rules(user_id, next_run);

alter table public.transactions
  add constraint transactions_recurring_fk
  foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;

-- GOALS
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  color text not null default '#10b981',
  icon text not null default 'target',
  created_at timestamptz not null default now()
);
alter table public.goals enable row level security;
create policy "own goals all" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
alter table public.goal_contributions enable row level security;
create policy "own goal contributions all" on public.goal_contributions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index goal_contrib_goal_idx on public.goal_contributions(goal_id);

-- TRIGGER: auto-create profile + default categories on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into public.categories (user_id, name, icon, color, type, is_default) values
    (new.id, 'Salary', 'briefcase', '#10b981', 'income', true),
    (new.id, 'Other Income', 'plus-circle', '#34d399', 'income', true),
    (new.id, 'Rent', 'home', '#ef4444', 'outgoing', true),
    (new.id, 'Utilities', 'zap', '#f59e0b', 'outgoing', true),
    (new.id, 'Food', 'shopping-cart', '#3b82f6', 'outgoing', true),
    (new.id, 'Transport', 'car', '#8b5cf6', 'outgoing', true),
    (new.id, 'Entertainment', 'tv', '#ec4899', 'outgoing', true),
    (new.id, 'Health', 'heart-pulse', '#14b8a6', 'outgoing', true),
    (new.id, 'Other', 'circle', '#6b7280', 'outgoing', true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.goal_contributions;
alter publication supabase_realtime add table public.recurring_rules;
alter publication supabase_realtime add table public.categories;
