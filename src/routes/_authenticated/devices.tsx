import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/devices")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الأجهزة — Alpha Byte" },
      { name: "description", content: "راجع أجهزتك المسجّلة في Alpha Byte وأبطل أي جهاز لا تعرفه." },
      { property: "og:title", content: "الأجهزة — Alpha Byte" },
      { property: "og:description", content: "إدارة أجهزة Alpha Byte ومفاتيحها العامة." },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { session, vault } = useSession();
  const userId = session?.user.id ?? "";

  const { data: devices } = useQuery({
    queryKey: ["devices", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("*")
        .eq("user_id", userId)
        .order("last_active", { ascending: false });
      return data ?? [];
    },
  });

  async function revoke(deviceId: string) {
    const { error } = await supabase.from("devices").update({ revoked: true }).eq("id", deviceId);
    if (error) toast.error(t("common.error"));
    else await queryClient.invalidateQueries({ queryKey: ["devices", userId] });
  }

  return (
    <div className="page-scroll mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/settings" className="rounded-full p-1.5 text-muted-foreground press">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("devices.title")}</h1>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">{t("devices.note")}</p>

      <ul className="space-y-2">
        {(devices ?? []).map((device) => (
          <li
            key={device.id}
            className="flex items-center gap-3 rounded-2xl border border-border glass px-4 py-3"
          >
            <Smartphone className="h-5 w-5 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {device.device_name}
                {device.id === vault?.deviceId && (
                  <span className="ms-2 text-[10px] text-primary">({t("devices.current")})</span>
                )}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t("devices.lastActive")}: {new Date(device.last_active).toLocaleString()}
              </span>
            </span>
            {device.revoked ? (
              <span className="text-[11px] text-destructive">{t("devices.revoked")}</span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => void revoke(device.id)}>
                {t("devices.revoke")}
              </Button>
            )}
          </li>
        ))}
        {(devices ?? []).length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            —
          </li>
        )}
      </ul>
    </div>
  );
}
