import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/lock")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alpha Byte مقفل — أدخل رمزك" },
      { name: "description", content: "افتح تطبيق Alpha Byte برمز PIN أو عبارة المرور الخاصة بك." },
      { property: "og:title", content: "Alpha Byte مقفل" },
      { property: "og:description", content: "افتح Alpha Byte برمز PIN أو عبارة المرور." },
    ],
  }),
  component: LockPage,
});

function LockPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hasVault, hasPin, vault, unlock, signOut } = useSession();
  const [mode, setMode] = useState<"pin" | "passphrase">("passphrase");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMode(hasPin ? "pin" : "passphrase"), [hasPin]);
  useEffect(() => {
    if (vault) navigate({ to: "/chats", replace: true });
    else if (!hasVault) navigate({ to: "/auth", replace: true });
  }, [vault, hasVault, navigate]);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await unlock(secret, mode);
      navigate({ to: "/chats", replace: true });
    } catch {
      toast.error(t("lock.wrong"));
      setSecret("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell aurora flex items-center justify-center px-5">
      <form
        onSubmit={handleUnlock}
        className="animate-rise w-full max-w-sm rounded-3xl border border-border glass p-7 text-center shadow-float"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl brand-bg shadow-glow">
          <span className="alpha-byte-cover text-2xl">A<span>B</span></span>
        </div>
        <h1 className="mt-4 text-2xl font-bold">{t("lock.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "pin" ? t("lock.pin") : t("lock.passphrase")}
        </p>
        <Input
          className="mt-5 text-center tracking-widest"
          type="password"
          inputMode={mode === "pin" ? "numeric" : "text"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoFocus
        />
        <Button type="submit" className="mt-4 w-full press" disabled={busy || !secret}>
          {t("lock.unlock")}
        </Button>
        {mode === "pin" && (
          <button
            type="button"
            className="mt-3 text-xs text-muted-foreground underline"
            onClick={() => {
              setMode("passphrase");
              setSecret("");
            }}
          >
            {t("lock.usePassphrase")}
          </button>
        )}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Fingerprint className="h-4 w-4" />
          <span>{t("lock.biometric.note")}</span>
        </div>
        <button
          type="button"
          className="mt-4 text-xs text-destructive underline"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          {t("settings.signout")}
        </button>
      </form>
    </div>
  );
}
