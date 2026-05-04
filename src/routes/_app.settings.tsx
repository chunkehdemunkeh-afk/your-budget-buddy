import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Save, Loader2, UserPlus, X, Mail, Utensils } from "lucide-react";
import { toast } from "sonner";
import { calculateFoodBudget, FOOD_RATES } from "@/lib/food-budget";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Pursely" }] }),
  component: SettingsPage,
});

interface Member {
  user_id: string;
  joined_at: string;
  display_name: string | null;
  email: string | null;
}

interface Invite {
  id: string;
  email: string;
  created_at: string;
}

function SettingsPage() {
  const { user, householdId, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [pets, setPets] = useState("0");
  const [foodBudgetOverride, setFoodBudgetOverride] = useState("");
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [user]);

  useEffect(() => {
    if (!householdId) return;
    let mounted = true;

    async function loadHousehold() {
      const { data: hh } = await supabase
        .from("households")
        .select("name, opening_balance, opening_balance_date, adults, children, pets, food_budget_override")
        .eq("id", householdId!)
        .maybeSingle();
      if (!mounted) return;
      setHouseholdName(hh?.name ?? "");
      setOpeningBalance(String(hh?.opening_balance ?? 0));
      setOpeningBalanceDate(hh?.opening_balance_date ?? "");
      setAdults(String((hh as { adults?: number } | null)?.adults ?? 2));
      setChildren(String((hh as { children?: number } | null)?.children ?? 0));
      setPets(String((hh as { pets?: number } | null)?.pets ?? 0));
      setFoodBudgetOverride(
        (hh as { food_budget_override?: number | null } | null)?.food_budget_override != null
          ? String((hh as { food_budget_override?: number | null }).food_budget_override)
          : "",
      );

      const { data: mem } = await supabase
        .from("household_members")
        .select("user_id, joined_at, profiles(display_name)")
        .eq("household_id", householdId!)
        .order("joined_at", { ascending: true });
      if (!mounted) return;
      // We can't read auth.users emails from the client; show display_name + own email.
      const enriched: Member[] = ((mem as unknown as Array<{ user_id: string; joined_at: string; profiles: { display_name: string | null } | null }>) ?? []).map((m) => ({
        user_id: m.user_id,
        joined_at: m.joined_at,
        display_name: m.profiles?.display_name ?? null,
        email: m.user_id === user?.id ? user?.email ?? null : null,
      }));
      setMembers(enriched);

      const { data: inv } = await supabase
        .from("household_invites")
        .select("id, email, created_at")
        .eq("household_id", householdId!)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (!mounted) return;
      setInvites((inv as Invite[]) ?? []);
    }

    loadHousehold();
    const channel = supabase
      .channel("household-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members" }, loadHousehold)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_invites" }, loadHousehold)
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [householdId, user]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  async function saveHousehold() {
    if (!householdId) return;
    const bal = parseFloat(openingBalance);
    if (isNaN(bal)) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSaving(true);
    const overrideTrim = foodBudgetOverride.trim();
    const overrideNum = overrideTrim === "" ? null : parseFloat(overrideTrim);
    if (overrideNum != null && (isNaN(overrideNum) || overrideNum < 0)) {
      setSaving(false);
      toast.error("Food budget must be a positive number");
      return;
    }
    const { error } = await supabase
      .from("households")
      .update({
        name: householdName.trim() || "My Budget",
        opening_balance: bal,
        opening_balance_date: openingBalanceDate || null,
        adults: Math.max(0, parseInt(adults, 10) || 0),
        children: Math.max(0, parseInt(children, 10) || 0),
        pets: Math.max(0, parseInt(pets, 10) || 0),
        food_budget_override: overrideNum,
      })
      .eq("id", householdId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !householdId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setInviting(true);
    const { error } = await supabase.from("household_invites").insert({
      household_id: householdId,
      email,
      invited_by: user.id,
    });
    setInviting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInviteEmail("");
    toast.success(`Invited ${email}`, {
      description: "They'll join your household when they sign up or sign in with this email.",
    });
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase.from("household_invites").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  async function removeMember(userId: string) {
    if (!householdId) return;
    if (userId === user?.id) {
      if (!confirm("Leave this household? You'll lose access to its data.")) return;
    } else {
      if (!confirm("Remove this member from the household?")) return;
    }
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", householdId)
      .eq("user_id", userId);
    if (error) toast.error(error.message);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-10 md:pt-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>

      <div className="space-y-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Profile</h2>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dn" className="text-xs">Display name</Label>
              <Input
                id="dn"
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <Button
              onClick={saveProfile}
              disabled={saving}
              className="h-10 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Household</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Everyone in this household sees and edits the same budget data.
          </p>

          <div className="mb-4">
            <Label htmlFor="hn" className="text-xs">Household name</Label>
            <Input
              id="hn"
              maxLength={80}
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="Carter Household"
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div className="mb-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Members ({members.length})
            </p>
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.display_name ?? "Member"}
                      {m.user_id === user?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember(m.user_id)}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={m.user_id === user?.id ? "Leave household" : "Remove member"}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {invites.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pending invites
              </p>
              <ul className="space-y-2">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="truncate text-sm">{i.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => cancelInvite(i.id)}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Cancel invite"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={sendInvite} className="mt-4 space-y-2">
            <Label htmlFor="invite" className="text-xs">Invite by email</Label>
            <div className="flex gap-2">
              <Input
                id="invite"
                type="email"
                placeholder="partner@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11 flex-1 rounded-xl"
              />
              <Button
                type="submit"
                disabled={inviting || !inviteEmail}
                className="h-11 rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground"
              >
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              They'll join automatically when they sign up or sign in with this email.
            </p>
          </form>

          <Button
            onClick={saveHousehold}
            disabled={saving}
            className="mt-4 h-10 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save household"}
          </Button>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Opening balance</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Your current account balance. Pursely uses this as the starting point to calculate your running total.
          </p>
          <div className="flex items-center rounded-2xl border border-border bg-muted/40 px-4 py-3 focus-within:border-primary">
            <span className="text-lg font-semibold text-muted-foreground">£</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value.replace(/[^\d.]/g, ""))}
              className="ml-2 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="mt-4">
            <Label className="text-xs">As of date</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={openingBalanceDate}
                onChange={(e) => setOpeningBalanceDate(e.target.value)}
                className="h-11 flex-1 rounded-xl"
              />
              <Button
                variant="outline"
                onClick={() => setOpeningBalanceDate(new Date().toISOString().slice(0, 10))}
                className="h-11 rounded-xl"
              >
                Today
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Transactions before this date will be completely ignored, acting as a fresh start.
            </p>
          </div>

          <Button
            onClick={saveHousehold}
            disabled={saving}
            className="mt-3 h-10 w-full rounded-xl bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save balance"}
          </Button>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Currency</h2>
          <p className="text-sm">GBP (£)</p>
        </section>

        <Button variant="outline" onClick={signOut} className="h-11 w-full rounded-xl">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
