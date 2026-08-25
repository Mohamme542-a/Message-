import { createFileRoute } from "@tanstack/react-router";
import { PhoneOff } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/calls")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "المكالمات — Alpha Byte" },
      { name: "description", content: "حالة المكالمات المشفّرة في Alpha Byte وخطة تفعيلها عبر WebRTC." },
      { property: "og:title", content: "المكالمات — Alpha Byte" },
      { property: "og:description", content: "المكالمات المشفّرة في Alpha Byte." },
    ],
  }),
  component: CallsPage,
});

function CallsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold">{t("calls.title")}</h1>
      <div className="rounded-3xl border border-border glass p-8 text-center">
        <PhoneOff className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">{t("calls.empty")}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("calls.notice")}</p>
      </div>
    </div>
  );
}
