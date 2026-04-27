import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/transactions")({
  head: () => ({ meta: [{ title: "Activity — Pursely" }] }),
  component: () => (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Activity</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming next — full transaction list with filters.</p>
    </div>
  ),
});
