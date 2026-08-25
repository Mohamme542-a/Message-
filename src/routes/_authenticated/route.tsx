import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { MessageCircle, Users, Phone, Settings } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { registerPushNotifications } from "@/lib/push-notifications";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { ready, session, hasVault, vault } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!ready) return;
    if (!session || !hasVault) navigate({ to: "/auth", replace: true });
    else if (!vault) navigate({ to: "/lock", replace: true });
  }, [ready, session, hasVault, vault, navigate]);

  useEffect(() => {
    if (!session?.user.id || !vault?.deviceId) return;
    let dispose = () => {};
    void registerPushNotifications(session.user.id, vault.deviceId, () => {
      toast.info("لديك رسالة جديدة في Alpha Byte");
    }).then((cleanup) => {
      dispose = cleanup;
    });
    return () => dispose();
  }, [session?.user.id, vault?.deviceId]);

  if (!ready || !session || !vault) {
    return (
      <div className="app-shell flex items-center justify-center bg-background">
        <p className="animate-pulse text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const hideNav = pathname.startsWith("/chat/") || pathname.startsWith("/security/");

  const items = [
    { to: "/chats", icon: MessageCircle, label: t("nav.chats") },
    { to: "/contacts", icon: Users, label: t("nav.contacts") },
    { to: "/calls", icon: Phone, label: t("nav.calls") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ] as const;

  return (
    <div className="app-shell flex min-h-screen flex-col bg-background">
      <div className={cn("flex-1", !hideNav && "pb-20")}>
        <Outlet />
      </div>
      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border glass">
          <ul className="mx-auto flex max-w-lg items-stretch">
            {items.map((item) => {
              const active = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to} className="flex-1">
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 text-[11px] transition-colors",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
