import { BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export function VerifiedBadge({ className, label = "حساب موثّق" }: { className?: string; label?: string }) {
  return (
    <span className={cn("ab-verified-mark", className)} title={label} aria-label={label}>
      <BadgeCheck className="h-full w-full" strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
