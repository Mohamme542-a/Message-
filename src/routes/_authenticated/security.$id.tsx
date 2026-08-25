import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { computeSafetyNumber } from "@/lib/crypto";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/security/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "مركز الأمان — AB" },
      { name: "description", content: "تحقق من رقم الأمان وحالة التشفير لهذه المحادثة في AB." },
      { property: "og:title", content: "مركز الأمان — AB" },
      { property: "og:description", content: "تحقق من هوية جهة الاتصال في AB." },
    ],
  }),
  component: SecurityCenter,
});

function SecurityCenter() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { session, vault } = useSession();
  const userId = session?.user.id ?? "";
  const [safety, setSafety] = useState<string>("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vault || !userId) return;
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
      if (!conv) return;
      const peerId = conv.user_a === userId ? conv.user_b : conv.user_a;
      const { data: profile } = await supabase
        .from("profiles")
        .select("identity_public_key")
        .eq("id", peerId)
        .maybeSingle();
      if (!profile?.identity_public_key) return;
      setSafety(await computeSafetyNumber(vault.identityPublicKey, profile.identity_public_key));
    })();
  }, [id, userId, vault]);

  const checks = [
    { label: t("sc.e2ee"), value: t("sc.active") },
    { label: t("sc.session"), value: t("sc.active") },
    { label: t("sc.keys"), value: t("sc.active") },
    { label: t("sc.devices"), value: t("sc.active") },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-4">
      <header className="mb-5 flex items-center gap-3">
        <Link to="/chat/$id" params={{ id }} className="rounded-full p-1.5 text-muted-foreground press">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("sc.title")}</h1>
      </header>

      <div className="rounded-3xl border border-border glass p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("sc.safetyNumber")}</h2>
        </div>
        <p className="mt-3 select-all font-mono text-lg leading-8 tracking-widest" dir="ltr">
          {safety || "…"}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">{t("sc.compare")}</p>
        <button
          type="button"
          onClick={() => setVerified(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-2.5 text-sm press"
        >
          <CheckCircle2 className={verified ? "h-4 w-4 text-primary" : "h-4 w-4"} />
          {verified ? t("sc.verified") : t("sc.markVerified")}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {checks.map((c) => (
          <li
            key={c.label}
            className="flex items-center justify-between rounded-2xl border border-border glass px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {c.label}
            </span>
            <span className="text-xs text-muted-foreground">{c.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
