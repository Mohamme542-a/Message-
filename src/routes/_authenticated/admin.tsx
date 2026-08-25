import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { hasRole } from "@/lib/ab-api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة تحكم AB" },
      { name: "description", content: "لوحة إدارة AB: الإحصائيات والمستخدمون والبلاغات والصيانة." },
      { property: "og:title", content: "لوحة تحكم AB" },
      { property: "og:description", content: "إدارة AB دون أي وصول إلى محتوى الرسائل." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [term, setTerm] = useState("");

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["isAdmin", userId],
    enabled: Boolean(userId),
    queryFn: () => hasRole(userId, "admin"),
  });

  const { data: stats } = useQuery({
    queryKey: ["adminStats"],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [users, active, fresh, devices, messages, reports] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen", dayAgo),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("devices").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      return {
        users: users.count ?? 0,
        active: active.count ?? 0,
        fresh: fresh.count ?? 0,
        devices: devices.count ?? 0,
        messages: messages.count ?? 0,
        reports: reports.count ?? 0,
      };
    },
  });

  const { data: users } = useQuery({
    queryKey: ["adminUsers", term],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (term.trim()) query = query.ilike("username", `%${term.trim().toLowerCase()}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  const { data: reports } = useQuery({
    queryKey: ["adminReports"],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["adminConfig"],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("key, value");
      const map: Record<string, unknown> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      return map;
    },
  });

  async function setStatus(targetId: string, status: "active" | "suspended" | "banned" | "disabled") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", targetId);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: `profile.status.${status}`,
      target_type: "profile",
      target_id: targetId,
    });
    await queryClient.invalidateQueries({ queryKey: ["adminUsers", term] });
  }

  async function saveConfig(key: string, value: unknown) {
    const { error } = await supabase
      .from("app_config")
      .upsert({ key, value: value as never, updated_at: new Date().toISOString() });
    if (error) toast.error(t("common.error"));
    else {
      toast.success(t("settings.saved"));
      await queryClient.invalidateQueries({ queryKey: ["adminConfig"] });
    }
  }

  if (isLoading) {
    return <p className="p-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-16 text-center">
        <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
        <p className="mt-3 font-semibold">{t("admin.denied")}</p>
        <Link to="/settings" className="mt-4 inline-block text-sm text-primary underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/settings" className="rounded-full p-1.5 text-muted-foreground press">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("admin.title")}</h1>
      </header>
      <p className="mb-4 rounded-2xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        {t("admin.noContent")}
      </p>

      <Tabs defaultValue="dashboard">
        <TabsList className="w-full">
          <TabsTrigger value="dashboard" className="flex-1 text-xs">
            {t("admin.dashboard")}
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-1 text-xs">
            {t("admin.users")}
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex-1 text-xs">
            {t("admin.reports")}
          </TabsTrigger>
          <TabsTrigger value="config" className="flex-1 text-xs">
            {t("admin.config")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 grid grid-cols-2 gap-2">
          {[
            { label: t("admin.totalUsers"), value: stats?.users },
            { label: t("admin.activeUsers"), value: stats?.active },
            { label: t("admin.newUsers"), value: stats?.fresh },
            { label: t("admin.openReports"), value: stats?.reports },
            { label: t("admin.devices"), value: stats?.devices },
            { label: t("admin.messages"), value: stats?.messages },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border glass p-4">
              <p className="text-2xl font-bold">{card.value ?? "—"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-2">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("admin.searchUser")}
          />
          {(users ?? []).map((user) => (
            <div key={user.id} className="rounded-2xl border border-border glass p-4">
              <p className="text-sm font-semibold">{user.display_name || user.username}</p>
              <p className="text-[11px] text-muted-foreground">
                @{user.username} · {user.status}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void setStatus(user.id, "suspended")}>
                  {t("admin.suspend")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void setStatus(user.id, "active")}>
                  {t("admin.unsuspend")}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void setStatus(user.id, "banned")}>
                  {t("admin.ban")}
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-2">
          {(reports ?? []).map((report) => (
            <div key={report.id} className="rounded-2xl border border-border glass p-4 text-sm">
              <p className="font-medium">{report.reason}</p>
              <p className="text-[11px] text-muted-foreground">
                {report.status} · {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          {(reports ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              —
            </p>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-border glass p-4 text-sm">
            <span>{t("admin.registration")}</span>
            <Switch
              checked={config?.["registration_open"] !== false}
              onCheckedChange={(v) => void saveConfig("registration_open", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border glass p-4 text-sm">
            <span>{t("admin.maintenanceMode")}</span>
            <Switch
              checked={config?.["maintenance_mode"] === true}
              onCheckedChange={(v) => void saveConfig("maintenance_mode", v)}
            />
          </div>
          <div className="rounded-2xl border border-border glass p-4">
            <Label className="text-xs">{t("admin.minVersion")}</Label>
            <Input
              className="mt-1"
              defaultValue={String(config?.["min_version"] ?? "")}
              onBlur={(e) => void saveConfig("min_version", e.target.value)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
