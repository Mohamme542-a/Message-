import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { validateActivation } from "@/lib/activation";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const { ready, session, hasVault, vault } = useSession();

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const activated = await validateActivation();
      if (!active) return;
      if (!activated || !session || !hasVault) navigate({ to: "/auth", replace: true });
      else if (!vault) navigate({ to: "/lock", replace: true });
      else navigate({ to: "/chats", replace: true });
    }, 700);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [ready, session, hasVault, vault, navigate]);

  return (
    <div className="splash-shell app-shell flex flex-col items-center justify-center gap-7">
      <div className="relative">
        <div className="ab-emblem ab-emblem-large relative" aria-label="Alpha Byte">
          <span className="alpha-byte-cover">A<span>B</span></span>
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight text-white">Alpha Byte</h1>
      </div>
      <span className="splash-indicator" aria-label="جارٍ الفتح" />
    </div>
  );
}
