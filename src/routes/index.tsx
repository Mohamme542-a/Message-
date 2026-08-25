import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Splash,
});

function Splash() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { ready, session, hasVault, vault } = useSession();

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      if (!session || !hasVault) navigate({ to: "/auth", replace: true });
      else if (!vault) navigate({ to: "/lock", replace: true });
      else navigate({ to: "/chats", replace: true });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [ready, session, hasVault, vault, navigate]);

  return (
    <div className="app-shell aurora flex flex-col items-center justify-center gap-6 bg-background">
      <div className="relative">
        <span className="pulse-ring absolute inset-0 rounded-3xl brand-bg" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl brand-bg shadow-glow" aria-label="Alpha Byte">
          <span className="alpha-byte-cover">A<span>B</span></span>
        </div>
      </div>
      <div className="text-center">
        <h1 className="brand-text text-4xl font-extrabold tracking-tight">Alpha Byte</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("app.tagline")}</p>
      </div>
      <p className="animate-pulse text-xs text-muted-foreground">{t("splash.loading")}</p>
    </div>
  );
}
