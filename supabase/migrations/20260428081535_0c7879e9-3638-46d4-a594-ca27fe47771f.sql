-- ============================================================
-- 1. New tables: households, household_members, household_invites
-- ============================================================
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Budget',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX idx_household_members_user ON public.household_members(user_id);

CREATE TABLE public.household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE INDEX idx_invites_email ON public.household_invites(lower(email)) WHERE accepted_at IS NULL;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Security definer helper to avoid RLS recursion
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.user_household_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = _user_id
$$;

-- ============================================================
-- 3. RLS on the new tables
-- ============================================================
CREATE POLICY "members can view their households"
  ON public.households FOR SELECT
  USING (public.is_household_member(id, auth.uid()));

CREATE POLICY "users create households"
  ON public.households FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "members can update their households"
  ON public.households FOR UPDATE
  USING (public.is_household_member(id, auth.uid()));

CREATE POLICY "members view membership of their households"
  ON public.household_members FOR SELECT
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "members can join via invite acceptance"
  ON public.household_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "members can leave"
  ON public.household_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "members view invites for their household or their email"
  ON public.household_invites FOR SELECT
  USING (
    public.is_household_member(household_id, auth.uid())
    OR lower(email) = lower((auth.jwt() ->> 'email'))
  );

CREATE POLICY "members create invites in their household"
  ON public.household_invites FOR INSERT
  WITH CHECK (
    public.is_household_member(household_id, auth.uid())
    AND auth.uid() = invited_by
  );

CREATE POLICY "members or invitee can update invite (accept)"
  ON public.household_invites FOR UPDATE
  USING (
    public.is_household_member(household_id, auth.uid())
    OR lower(email) = lower((auth.jwt() ->> 'email'))
  );

CREATE POLICY "members can delete invites in their household"
  ON public.household_invites FOR DELETE
  USING (public.is_household_member(household_id, auth.uid()));

-- ============================================================
-- 4. Add household_id to all data tables
-- ============================================================
ALTER TABLE public.transactions     ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.recurring_rules  ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.goals            ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.goal_contributions ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.categories       ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.shopping_items   ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.one_off_bills    ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;

-- ============================================================
-- 5. Migrate existing data: one household per existing user
-- ============================================================
DO $$
DECLARE
  u RECORD;
  new_hh_id uuid;
BEGIN
  FOR u IN SELECT DISTINCT id FROM public.profiles LOOP
    INSERT INTO public.households (name, created_by)
    VALUES ('My Budget', u.id)
    RETURNING id INTO new_hh_id;

    INSERT INTO public.household_members (household_id, user_id)
    VALUES (new_hh_id, u.id);

    UPDATE public.transactions       SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.recurring_rules    SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.goals              SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.goal_contributions SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.categories         SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.shopping_items     SET household_id = new_hh_id WHERE user_id = u.id;
    UPDATE public.one_off_bills      SET household_id = new_hh_id WHERE user_id = u.id;
  END LOOP;
END $$;

-- Make household_id NOT NULL now that everything is migrated
ALTER TABLE public.transactions       ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.recurring_rules    ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.goals              ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.goal_contributions ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.categories         ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.shopping_items     ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.one_off_bills      ALTER COLUMN household_id SET NOT NULL;

-- Useful indexes
CREATE INDEX idx_transactions_household       ON public.transactions(household_id);
CREATE INDEX idx_recurring_rules_household    ON public.recurring_rules(household_id);
CREATE INDEX idx_goals_household              ON public.goals(household_id);
CREATE INDEX idx_goal_contributions_household ON public.goal_contributions(household_id);
CREATE INDEX idx_categories_household         ON public.categories(household_id);
CREATE INDEX idx_shopping_items_household     ON public.shopping_items(household_id);
CREATE INDEX idx_one_off_bills_household      ON public.one_off_bills(household_id);

-- ============================================================
-- 6. Rewrite RLS on data tables to be household-scoped
-- ============================================================
DROP POLICY IF EXISTS "own transactions all"          ON public.transactions;
DROP POLICY IF EXISTS "own recurring all"             ON public.recurring_rules;
DROP POLICY IF EXISTS "own goals all"                 ON public.goals;
DROP POLICY IF EXISTS "own goal contributions all"    ON public.goal_contributions;
DROP POLICY IF EXISTS "own categories all"            ON public.categories;
DROP POLICY IF EXISTS "own shopping items all"        ON public.shopping_items;
DROP POLICY IF EXISTS "Users manage own one-off bills" ON public.one_off_bills;

CREATE POLICY "household transactions all" ON public.transactions
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household recurring all" ON public.recurring_rules
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household goals all" ON public.goals
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household goal contributions all" ON public.goal_contributions
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household categories all" ON public.categories
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household shopping items all" ON public.shopping_items
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household one-off bills all" ON public.one_off_bills
  FOR ALL USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

-- ============================================================
-- 7. Move opening_balance + opening_balance_date to households
--    (so both members see the same starting point)
-- ============================================================
ALTER TABLE public.households ADD COLUMN opening_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.households ADD COLUMN opening_balance_date date;
ALTER TABLE public.households ADD COLUMN currency text NOT NULL DEFAULT 'GBP';

-- Copy existing values from each user's profile to their household
UPDATE public.households h
SET opening_balance = COALESCE(p.opening_balance, 0),
    opening_balance_date = p.opening_balance_date,
    currency = COALESCE(p.currency, 'GBP')
FROM public.profiles p
WHERE h.created_by = p.id;

-- ============================================================
-- 8. Update the new-user trigger so signups get a household
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_hh_id uuid;
  pending_invite RECORD;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  -- If they have a pending invite, join the inviting household.
  SELECT * INTO pending_invite
  FROM public.household_invites
  WHERE lower(email) = lower(new.email)
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF pending_invite.id IS NOT NULL THEN
    INSERT INTO public.household_members (household_id, user_id)
    VALUES (pending_invite.household_id, new.id);

    UPDATE public.household_invites
    SET accepted_at = now()
    WHERE id = pending_invite.id;
  ELSE
    -- Fresh user: spin up their own household + default categories
    INSERT INTO public.households (name, created_by)
    VALUES ('My Budget', new.id)
    RETURNING id INTO new_hh_id;

    INSERT INTO public.household_members (household_id, user_id)
    VALUES (new_hh_id, new.id);

    INSERT INTO public.categories (user_id, household_id, name, icon, color, type, is_default) VALUES
      (new.id, new_hh_id, 'Salary', 'briefcase', '#10b981', 'income', true),
      (new.id, new_hh_id, 'Other Income', 'plus-circle', '#34d399', 'income', true),
      (new.id, new_hh_id, 'Rent', 'home', '#ef4444', 'outgoing', true),
      (new.id, new_hh_id, 'Utilities', 'zap', '#f59e0b', 'outgoing', true),
      (new.id, new_hh_id, 'Food', 'shopping-cart', '#3b82f6', 'outgoing', true),
      (new.id, new_hh_id, 'Transport', 'car', '#8b5cf6', 'outgoing', true),
      (new.id, new_hh_id, 'Entertainment', 'tv', '#ec4899', 'outgoing', true),
      (new.id, new_hh_id, 'Health', 'heart-pulse', '#14b8a6', 'outgoing', true),
      (new.id, new_hh_id, 'Other', 'circle', '#6b7280', 'outgoing', true);
  END IF;

  RETURN new;
END;
$$;

-- Make sure the trigger is wired up (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();