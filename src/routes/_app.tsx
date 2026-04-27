import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DesktopSidebar, MobileTabBar } from "@/components/AppNav";
import { AddFab } from "@/components/AddFab";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "You";

  return (
    <div className="flex min-h-screen bg-background">
      <DesktopSidebar displayName={displayName} />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
      <AddFab />
    </div>
  );
}
