import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/hooks/useAuth";
import { EntryForm } from "@/components/EntryForm";

export const Route = createFileRoute("/add/income")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Add income — Pursely" }] }),
  component: () => (
    <AuthProvider>
      <EntryForm kind="income" title="Add income" accentClass="text-success" />
    </AuthProvider>
  ),
});
