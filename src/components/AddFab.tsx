import { useState } from "react";
import { Plus, TrendingUp, TrendingDown, ShoppingCart, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function AddFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
        {open && (
          <div className="pointer-events-auto flex flex-col items-end gap-2.5">
            <FabAction
              to="/add/income"
              label="Income"
              icon={<TrendingUp className="h-5 w-5" />}
              color="bg-success text-success-foreground"
              onClick={() => setOpen(false)}
            />
            <FabAction
              to="/add/outgoing"
              label="Outgoing"
              icon={<TrendingDown className="h-5 w-5" />}
              color="bg-destructive text-destructive-foreground"
              onClick={() => setOpen(false)}
            />
            <FabAction
              to="/add/shopping"
              label="Shopping"
              icon={<ShoppingCart className="h-5 w-5" />}
              color="bg-primary text-primary-foreground"
              onClick={() => setOpen(false)}
            />
          </div>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close" : "Add entry"}
          className={cn(
            "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-[var(--shadow-glow)] transition-transform",
            "bg-[image:var(--gradient-primary)] text-primary-foreground",
            open && "rotate-45",
          )}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>
    </>
  );
}

function FabAction({
  to,
  label,
  icon,
  color,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-full bg-card px-3 py-2 pr-4 shadow-[var(--shadow-soft)] transition-transform hover:scale-105"
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", color)}>
        {icon}
      </span>
      <span className="text-sm font-medium text-card-foreground">{label}</span>
    </Link>
  );
}
