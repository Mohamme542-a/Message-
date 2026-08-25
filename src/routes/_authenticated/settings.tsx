import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Copy,
  KeyRound,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, hasRole } from "@/lib/ab-api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { createRecoveryBackup, disablePin, enablePin } from "@/lib/vault";
import { generateRecoveryCode } from "@/lib/crypto";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الإعدادات — Alpha Byte" },
      { name: "description", content: "إدارة ملفك الشخصي وخصوصيتك وقفل التطبيق في Alpha Byte." },
      { property: "og:title", content: "الإعدادات — Alpha Byte" },
      { property: "og:description", content: "إعدادات الخصوصية والأمان في Alpha Byte." },
    ],
  }),
  component: SettingsPage,
});

type PrivacyField = "read_receipts" | "typing_indicator" | "show_last_seen" | "show_online";

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, vault, settings, updateSettings, signOut, emergencyWipe, hasPin, refreshVaultFlags } =
    useSession();
  const userId = session?.user.id ?? "";

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pin, setPin] = useState("");
  const [wipeAck, setWipeAck] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: () => getMyProfile(userId),
  });

  const { data: isAdmin } = useQuery({
    queryKey: ["isAdmin", userId],
    enabled: Boolean(userId),
    queryFn: () => hasRole(userId, "admin"),
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBio(profile.bio);
    }
  }, [profile]);

  async function saveProfile() {
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, bio })
      .eq("id", userId);
    if (error) toast.error(t("common.error"));
    else {
      toast.success(t("settings.saved"));
      await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    }
  }

  async function togglePrivacy(field: PrivacyField, value: boolean) {
    const patch =
      field === "read_receipts"
        ? { read_receipts: value }
        : field === "typing_indicator"
          ? { typing_indicator: value }
          : field === "show_last_seen"
            ? { show_last_seen: value }
            : { show_online: value };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) toast.error(t("common.error"));
    else await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
  }

  async function handleSetPin() {
    if (!vault || pin.length < 4) return;
    await enablePin(pin, vault);
    setPin("");
    refreshVaultFlags();
    toast.success(t("settings.saved"));
  }

  function handleRemovePin() {
    disablePin();
    refreshVaultFlags();
    toast.success(t("settings.saved"));
  }

  async function createMessageRecovery() {
    if (!vault || !userId) return;
    const code = generateRecoveryCode();
    const { error } = await supabase
      .from("profiles")
      .update({ recovery_backup: await createRecoveryBackup(code, vault) })
      .eq("id", userId);
    if (error) {
      toast.error("تعذر حفظ نسخة الاستعادة المشفرة.");
      return;
    }
    setRecoveryCode(code);
    toast.success("تم إنشاء مفتاح الاستعادة.");
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleWipe() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await emergencyWipe();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pt-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <section className="rounded-3xl border border-border glass p-5">
        <h2 className="mb-4 text-sm font-semibold">{t("settings.profile")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">@{profile?.username ?? "—"}</p>
        <Label className="text-xs">{t("settings.displayName")}</Label>
        <Input className="mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Label className="mt-3 block text-xs">{t("settings.bio")}</Label>
        <Textarea className="mt-1" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        <Button className="mt-4 w-full press" onClick={() => void saveProfile()}>
          {t("settings.save")}
        </Button>
      </section>

      <section className="rounded-3xl border border-border glass p-5">
        <h2 className="mb-4 text-sm font-semibold">{t("settings.privacy")}</h2>
        {[
          { field: "read_receipts" as const, label: t("privacy.readReceipts") },
          { field: "typing_indicator" as const, label: t("privacy.typing") },
          { field: "show_last_seen" as const, label: t("privacy.lastSeen") },
          { field: "show_online" as const, label: t("privacy.online") },
        ].map((row) => (
          <div key={row.field} className="flex items-center justify-between py-2 text-sm">
            <span>{row.label}</span>
            <Switch
              checked={Boolean((profile as Record<string, unknown> | null)?.[row.field])}
              onCheckedChange={(v) => void togglePrivacy(row.field, v)}
            />
          </div>
        ))}
        <div className="flex items-center justify-between py-2 text-sm">
          <span>
            {t("privacy.notifications")}
            <span className="block text-[11px] text-muted-foreground">
              {t("privacy.notifications.hint")}
            </span>
          </span>
          <Switch
            checked={settings.hideNotificationContent}
            onCheckedChange={(v) => updateSettings({ hideNotificationContent: v })}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-border glass p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("settings.security")}
        </h2>
        <Label className="text-xs">{hasPin ? t("security.pin.change") : t("security.pin.set")}</Label>
        <div className="mt-1 flex gap-2">
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
          />
          <Button onClick={() => void handleSetPin()} disabled={pin.length < 4}>
            {t("settings.save")}
          </Button>
        </div>
        {hasPin && (
          <button
            type="button"
            onClick={handleRemovePin}
            className="mt-2 text-xs text-muted-foreground underline"
          >
            {t("security.pin.remove")}
          </button>
        )}
        <div className="mt-4">
          <Label className="text-xs">{t("security.autolock")}</Label>
          <Input
            type="number"
            min={1}
            className="mt-1"
            value={settings.autoLockMinutes}
            onChange={(e) => updateSettings({ autoLockMinutes: Number(e.target.value) || 1 })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("security.autolock.hint")}</p>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>
            {t("security.screenshot")}
            <span className="block text-[11px] text-muted-foreground">
              {t("security.screenshot.hint")}
            </span>
          </span>
          <Switch
            checked={settings.blockScreenshots}
            onCheckedChange={(v) => updateSettings({ blockScreenshots: v })}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">مفتاح استعادة الرسائل</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">أنشئ مفتاحًا تحفظه خارج الهاتف. النسخة المحفوظة على الخادم مشفرة به ولا يمكن فتحها من دونه.</p>
            </div>
          </div>
          {recoveryCode ? (
            <div className="mt-3 select-all rounded-xl bg-muted p-3 text-center font-mono text-sm tracking-wider">{recoveryCode}</div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => void createMessageRecovery()}>إنشاء مفتاح</Button>
            {recoveryCode ? <Button variant="outline" size="icon" onClick={() => { void navigator.clipboard.writeText(recoveryCode); toast.success("تم النسخ"); }} aria-label="نسخ مفتاح الاستعادة"><Copy className="h-4 w-4" /></Button> : null}
          </div>
        </div>
        <Link
          to="/devices"
          className="mt-4 flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm press"
        >
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t("settings.devices")}
          </span>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </section>

      <section className="rounded-3xl border border-border glass p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Languages className="h-4 w-4" />
          {t("settings.appearance")}
        </h2>
        <div className="flex gap-2">
          {(["ar", "en"] as const).map((code) => (
            <Button
              key={code}
              variant={lang === code ? "default" : "outline"}
              className="flex-1"
              onClick={() => setLang(code)}
            >
              {code === "ar" ? "العربية" : "English"}
            </Button>
          ))}
        </div>
        <p className="mb-2 mt-5 text-xs font-semibold">المظهر</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "dark" as const, label: "داكن", icon: Moon },
            { value: "light" as const, label: "فاتح", icon: Sun },
            { value: "system" as const, label: "النظام", icon: Monitor },
          ].map((option) => {
            const Icon = option.icon;
            return <Button key={option.value} variant={settings.theme === option.value ? "default" : "outline"} className="gap-1 text-xs" onClick={() => updateSettings({ theme: option.value })}><Icon className="h-3.5 w-3.5" />{option.label}</Button>;
          })}
        </div>
        <p className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold"><Palette className="h-3.5 w-3.5" />لون التطبيق</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: "aqua" as const, label: "فيروزي", color: "bg-cyan-400" },
            { value: "violet" as const, label: "بنفسجي", color: "bg-violet-500" },
            { value: "rose" as const, label: "وردي", color: "bg-rose-500" },
            { value: "amber" as const, label: "كهرماني", color: "bg-amber-400" },
          ].map((option) => <button key={option.value} type="button" onClick={() => updateSettings({ accentColor: option.value })} className={`rounded-2xl border p-2 text-center text-[10px] press ${settings.accentColor === option.value ? "border-primary ring-2 ring-primary/30" : "border-border"}`}><span className={`mx-auto mb-1 block h-5 w-5 rounded-full ${option.color}`} />{option.label}</button>)}
        </div>
      </section>

      {isAdmin && (
        <Link
          to="/admin"
          className="flex items-center justify-between rounded-3xl border border-border glass px-5 py-4 text-sm press"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            {t("admin.title")}
          </span>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      )}

      <section className="rounded-3xl border border-destructive/40 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t("security.emergency")}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("security.emergency.desc")}</p>
        <label className="mt-3 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={wipeAck}
            onChange={(e) => setWipeAck(e.target.checked)}
            className="mt-0.5"
          />
          {t("security.emergency.confirm")}
        </label>
        <Button
          variant="destructive"
          className="mt-3 w-full"
          disabled={!wipeAck}
          onClick={() => void handleWipe()}
        >
          {t("security.emergency.action")}
        </Button>
      </section>

      <Button variant="outline" className="w-full" onClick={() => void handleSignOut()}>
        <LogOut className="me-2 h-4 w-4" />
        {t("settings.signout")}
      </Button>
    </div>
  );
}
