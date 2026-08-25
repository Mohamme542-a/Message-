import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { USERNAME_RE, getConfig, usernameToEmail } from "@/lib/ab-api";
import { generateIdentityKeyPair, generateRecoveryCode } from "@/lib/crypto";
import { createVault, vaultExists, type VaultContents } from "@/lib/vault";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الدخول إلى Alpha Byte — مراسلة مشفّرة" },
      {
        name: "description",
        content: "أنشئ هوية Alpha Byte مشفّرة باسم مستخدم وعبارة مرور فقط — بلا هاتف أو بريد.",
      },
      { property: "og:title", content: "الدخول إلى Alpha Byte" },
      { property: "og:description", content: "هويتك هي مفاتيحك. بلا رقم هاتف وبلا بريد." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { session, setVault, refreshVaultFlags } = useSession();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    getConfig<boolean>("registration_open", true).then(setRegistrationOpen).catch(() => {});
  }, []);

  useEffect(() => {
    if (session && vaultExists() && !recovery) navigate({ to: "/lock", replace: true });
  }, [session, recovery, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const uname = username.trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) {
      toast.error(t("auth.username.hint"));
      return;
    }
    if (passphrase.length < 12) {
      toast.error(t("auth.passphrase.hint"));
      return;
    }
    if (mode === "signup" && passphrase !== confirm) {
      toast.error(t("auth.confirm"));
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(uname);
      if (mode === "signup") {
        if (!registrationOpen) {
          toast.error(t("auth.registration.closed"));
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email, password: passphrase });
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error("NO_USER");
        const keys = await generateIdentityKeyPair();
        const code = generateRecoveryCode();
        const deviceId = crypto.randomUUID();
        const { error: profileError } = await supabase.from("profiles").insert({
          id: user.id,
          username: uname,
          display_name: displayName.trim() || uname,
          identity_public_key: keys.publicKey,
        });
        if (profileError) throw profileError;
        await supabase.from("devices").insert({
          id: deviceId,
          user_id: user.id,
          device_name: navigator.userAgent.slice(0, 60),
          platform: "web",
          public_key: keys.publicKey,
        });
        const contents: VaultContents = {
          userId: user.id,
          username: uname,
          deviceId,
          deviceName: navigator.userAgent.slice(0, 60),
          identityPublicKey: keys.publicKey,
          identityPrivateKey: keys.privateKey,
          recoveryCodeHint: code.slice(0, 4),
          createdAt: new Date().toISOString(),
        };
        await createVault(passphrase, contents);
        refreshVaultFlags();
        setVault(contents);
        setRecovery(code);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: passphrase,
        });
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error("NO_USER");
        if (vaultExists()) {
          navigate({ to: "/lock", replace: true });
          return;
        }
        // جهاز جديد: نولّد مفاتيح جديدة لهذا الجهاز — الرسائل القديمة تبقى غير قابلة للفك.
        const keys = await generateIdentityKeyPair();
        const deviceId = crypto.randomUUID();
        await supabase
          .from("profiles")
          .update({ identity_public_key: keys.publicKey })
          .eq("id", user.id);
        await supabase.from("devices").insert({
          id: deviceId,
          user_id: user.id,
          device_name: navigator.userAgent.slice(0, 60),
          platform: "web",
          public_key: keys.publicKey,
        });
        const contents: VaultContents = {
          userId: user.id,
          username: uname,
          deviceId,
          deviceName: navigator.userAgent.slice(0, 60),
          identityPublicKey: keys.publicKey,
          identityPrivateKey: keys.privateKey,
          recoveryCodeHint: "",
          createdAt: new Date().toISOString(),
        };
        await createVault(passphrase, contents);
        refreshVaultFlags();
        setVault(contents);
        navigate({ to: "/chats", replace: true });
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="app-shell aurora flex items-center justify-center px-5">
        <div className="animate-rise w-full max-w-md rounded-3xl border border-border glass p-6 shadow-float">
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">{t("recovery.title")}</h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("recovery.desc")}</p>
          <div className="mt-4 select-all rounded-2xl border border-border bg-muted/40 p-4 text-center font-mono text-base tracking-widest">
            {recovery}
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full press"
            onClick={() => {
              navigator.clipboard.writeText(recovery);
              toast.success(t("recovery.copied"));
            }}
          >
            <Copy className="h-4 w-4" /> {t("recovery.copy")}
          </Button>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} />
            <span>{t("recovery.ack")}</span>
          </label>
          <Button
            className="mt-5 w-full press"
            disabled={!ack}
            onClick={() => navigate({ to: "/chats", replace: true })}
          >
            {t("recovery.continue")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell aurora flex items-center justify-center px-5 py-10">
      <div className="animate-rise w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl brand-bg shadow-glow" aria-label="Alpha Byte">
            <span className="alpha-byte-cover text-2xl">A<span>B</span></span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold">{t("auth.welcome")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border glass p-6 shadow-soft"
        >
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
            {(["signup", "signin"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`press rounded-xl py-2 text-sm font-semibold transition-colors ${
                  mode === value
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground"
                }`}
              >
                {value === "signup" ? t("auth.create") : t("auth.signin")}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.username")}</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              dir="ltr"
              autoComplete="username"
              placeholder="ali_ab"
            />
            <p className="text-xs text-muted-foreground">{t("auth.username.hint")}</p>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="display">{t("auth.display")}</Label>
              <Input
                id="display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pass">{t("auth.passphrase")}</Label>
            <Input
              id="pass"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <p className="text-xs text-muted-foreground">{t("auth.passphrase.hint")}</p>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("auth.confirm")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{t("auth.warning")}</span>
          </div>

          <Button type="submit" className="w-full press" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t("auth.creating") : mode === "signup" ? t("auth.create") : t("auth.signin")}
          </Button>
        </form>
      </div>
    </div>
  );
}
