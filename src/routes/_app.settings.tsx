import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Pursely" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="space-y-4">
        <div className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
          <p className="mt-2 text-sm">{user?.email}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Currency</h2>
          <p className="mt-2 text-sm">GBP (£)</p>
        </div>
        <Button variant="outline" onClick={signOut} className="w-full">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
