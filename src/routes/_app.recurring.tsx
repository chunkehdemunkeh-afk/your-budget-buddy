import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/recurring")({
  head: () => ({ meta: [{ title: "Recurring — Pursely" }] }),
  component: () => (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Recurring</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming next — store repeating bills and income streams.</p>
    </div>
  ),
});
