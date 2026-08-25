import { useState } from "react";
import { Loader2 } from "lucide-react";
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
      <main className="activation-shell app-shell flex w-screen max-w-screen items-center justify-center overflow-x-hidden px-5 py-10">
      <section className="activation-card animate-rise box-border w-full max-w-[calc(100vw-2.5rem)] p-6 sm:max-w-md">
        <div className="text-center">
          <div className="ab-emblem mx-auto" aria-label="Alpha Byte">
            <span className="alpha-byte-cover">A<span>B</span></span>
          </div>
          <p className="mt-6 text-xs font-semibold tracking-[0.28em] text-zinc-400">ALPHA BYTE</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white">Alpha Byte</h1>
        </div>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="activation-label space-y-2 text-sm font-bold text-white" htmlFor="activation-code">
            <span>رمز التفعيل</span>
            <Input id="activation-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="text" placeholder="" disabled={busy} />
          </label>
          <Button className="activation-submit w-full press" disabled={busy} type="submit">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "جارٍ التحقق" : "متابعة"}
          </Button>
        </form>
      </section>
    </main>
  );
}
