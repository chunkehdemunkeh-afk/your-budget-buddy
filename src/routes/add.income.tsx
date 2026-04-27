import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/add/income")({
  head: () => ({ meta: [{ title: "Add income — Pursely" }] }),
  component: () => (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">Add income</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming in the next stage.</p>
    </div>
  ),
});
