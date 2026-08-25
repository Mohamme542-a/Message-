import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateWithCode } from "@/lib/activation";

export function ActivationGate({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      toast.error("أدخل رمز التفعيل.");
      return;
    }

    setBusy(true);
    try {
      await activateWithCode(code);
      toast.success("تم التفعيل بنجاح.");
      onActivated();
    } catch {
      toast.error("رمز التفعيل غير صحيح أو تعذر التحقق منه الآن.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell aurora flex items-center justify-center px-5 py-10">
      <section className="animate-rise w-full max-w-md rounded-3xl border border-border glass p-6 shadow-float">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl brand-bg shadow-glow" aria-label="Alpha Byte">
            <span className="alpha-byte-cover text-2xl">A<span>B</span></span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold">Alpha Byte</h1>
          <p className="mt-2 text-sm text-muted-foreground">تفعيل الدخول الآمن إلى التطبيق</p>
        </div>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="space-y-2 text-sm font-semibold" htmlFor="activation-code">
            <span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> رمز التفعيل</span>
            <Input id="activation-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="text" placeholder="أدخل الرمز الذي استلمته" disabled={busy} />
          </label>
          <p className="rounded-2xl border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">يُرسل الرمز للتحقق على الخادم فقط ولا يُضمّن في التطبيق.</p>
          <Button className="w-full press" disabled={busy} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? "جارٍ التحقق" : "تفعيل المتابعة"}
          </Button>
        </form>
      </section>
    </main>
  );
}
