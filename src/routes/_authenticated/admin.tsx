import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Copy, ShieldAlert, TicketCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { hasRole } from "@/lib/ab-api";
import { isAdminEdition } from "@/lib/app-edition";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { createSubscriptionCode } from "@/lib/subscriptions";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة تحكم Alpha Byte" },
      { name: "description", content: "لوحة إدارة Alpha Byte: الإحصائيات والمستخدمون والبلاغات والصيانة." },
      { property: "og:title", content: "لوحة تحكم Alpha Byte" },
      { property: "og:description", content: "إدارة Alpha Byte دون أي وصول إلى محتوى الرسائل." },
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
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeUses, setCodeUses] = useState(1);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuingCode, setIssuingCode] = useState(false);

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
      const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
      let query = profilesTable
        .select("id, username, display_name, status, is_verified, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (term.trim()) query = query.ilike("username", `%${term.trim().toLowerCase()}%`);
      const { data } = await query;
      return (data ?? []) as Array<{ id: string; username: string; display_name: string; status: string; is_verified: boolean; created_at: string }>;
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

  const { data: subscriptionCodes } = useQuery({
    queryKey: ["adminSubscriptionCodes"],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const codesTable = (supabase as unknown as { from: (table: string) => any }).from("subscription_codes");
      const { data } = await codesTable.select("id, duration_days, max_redemptions, redemption_count, disabled, expires_at, created_at").order("created_at", { ascending: false }).limit(8);
      return (data ?? []) as Array<{ id: string; duration_days: number; max_redemptions: number; redemption_count: number; disabled: boolean; expires_at: string | null; created_at: string }>;
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

  async function setVerified(targetId: string, verified: boolean) {
    const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
    const { error } = await profilesTable.update({ is_verified: verified }).eq("id", targetId);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
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

  async function issueSubscriptionCode() {
    if (issuingCode) return;
    setIssuingCode(true);
    try {
      const result = await createSubscriptionCode(codeDuration, codeUses);
      setIssuedCode(result.code);
      await queryClient.invalidateQueries({ queryKey: ["adminSubscriptionCodes"] });
      toast.success("تم إنشاء الكود.");
    } catch {
      toast.error("تعذر إنشاء الكود.");
    } finally {
      setIssuingCode(false);
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
        {isAdminEdition ? (
          <Button className="mt-4" variant="outline" onClick={() => void supabase.auth.signOut()}>
            تسجيل الخروج
          </Button>
        ) : (
          <Link to="/settings" className="mt-4 inline-block text-sm text-primary underline">
            {t("common.back")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <header className="mb-4 flex items-center gap-3">
        {!isAdminEdition && (
          <Link to="/settings" className="rounded-full p-1.5 text-muted-foreground press">
            <ArrowRight className="h-5 w-5" />
          </Link>
        )}
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
          <div className="col-span-2 rounded-2xl border border-border glass p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><TicketCheck className="h-4 w-4 text-primary" />أكواد الاشتراك</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">يظهر الكود الجديد هنا مرة واحدة فقط؛ لا تحفظ المنظومة نص الأكواد في قاعدة البيانات.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">{[7, 30, 365].map((days) => <Button key={days} type="button" size="sm" variant={codeDuration === days ? "default" : "outline"} onClick={() => setCodeDuration(days)}>{days === 7 ? "أسبوع" : days === 30 ? "شهر" : "سنة"}</Button>)}</div>
            <div className="mt-2 flex gap-2"><Input type="number" min={1} max={10000} value={codeUses} onChange={(event) => setCodeUses(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))} /><Button type="button" disabled={issuingCode} onClick={() => void issueSubscriptionCode()}>{issuingCode ? "…" : "إنشاء"}</Button></div>
            {issuedCode ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted p-3"><code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold">{issuedCode}</code><Button type="button" size="icon" variant="outline" onClick={() => { void navigator.clipboard.writeText(issuedCode); toast.success("تم النسخ"); }} aria-label="نسخ الكود"><Copy className="h-4 w-4" /></Button></div> : null}
            {(subscriptionCodes ?? []).length ? <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">{(subscriptionCodes ?? []).map((code) => <p key={code.id}>{code.duration_days} يومًا · {code.redemption_count}/{code.max_redemptions} استخدامات · {new Date(code.created_at).toLocaleDateString()}</p>)}</div> : null}
          </div>
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
                <Button size="sm" variant="outline" onClick={() => void setVerified(user.id, !user.is_verified)}>
                  {user.is_verified ? "إزالة التوثيق" : "توثيق"}
                </Button>
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
