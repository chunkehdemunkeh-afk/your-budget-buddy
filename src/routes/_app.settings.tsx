import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Pursely" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, opening_balance, opening_balance_date")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setOpeningBalance(String(data?.opening_balance ?? 0));
        setOpeningBalanceDate((data as any)?.opening_balance_date ?? "");
      });
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    const bal = parseFloat(openingBalance);
    if (isNaN(bal)) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ 
        display_name: displayName.trim() || null, 
        opening_balance: bal,
        opening_balance_date: openingBalanceDate || null
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
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
            onClick={saveProfile}
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
