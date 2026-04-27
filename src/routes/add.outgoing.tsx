import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/hooks/useAuth";
import { EntryForm } from "@/components/EntryForm";

export const Route = createFileRoute("/add/outgoing")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Add outgoing — Pursely" }] }),
  component: () => (
    <AuthProvider>
      <EntryForm kind="outgoing" title="Add outgoing" accentClass="text-destructive" />
    </AuthProvider>
  ),
});
