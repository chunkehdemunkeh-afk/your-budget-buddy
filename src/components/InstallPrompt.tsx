import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pursely.install.dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already installed (display-mode standalone)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      // @ts-expect-error legacy iOS API
      window.navigator.standalone === true;
    if (standalone) return;

    // Don't show if dismissed in last 14 days
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissed && Date.now() - dismissed < 14 * 24 * 60 * 60 * 1000) return;

    // Don't show inside Lovable preview iframe
    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Detect iOS Safari (no beforeinstallprompt support)
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos) {
      setShowIos(true);
      setHidden(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setHidden(true);
    } else {
      dismiss();
    }
  }

  if (hidden) return null;

  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-[image:var(--gradient-primary)]/10 p-3 shadow-[var(--shadow-soft)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
        <Download className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Pursely</p>
        <p className="text-xs text-muted-foreground">
          {showIos ? (
            <span className="inline-flex items-center gap-1">
              Tap <Share className="inline h-3 w-3" /> then "Add to Home Screen"
            </span>
          ) : (
            "Add to your home screen for one-tap access"
          )}
        </p>
      </div>
      {!showIos && deferred && (
        <Button onClick={install} size="sm" className="rounded-lg">
          Install
        </Button>
      )}
      <button
        onClick={dismiss}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
