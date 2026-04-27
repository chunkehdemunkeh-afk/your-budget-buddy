import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/add/shopping")({
  head: () => ({ meta: [{ title: "Add shopping — Pursely" }] }),
  component: () => (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">Add shopping</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming in stage 4.</p>
    </div>
  ),
});
