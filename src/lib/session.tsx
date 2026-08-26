/**
 * AB — حالة الجلسة: حساب Lovable Cloud + الخزنة المحلية للمفاتيح.
 * المفتاح الخاص يبقى في الذاكرة أثناء الاستخدام فقط، ومغلّفاً في التخزين المحلي.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  destroyLocalKeys,
  loadSettings,
  pinEnabled,
  saveSettings,
  unlockWithPassphrase,
  unlockWithPin,
  vaultExists,
  type LocalSettings,
  type VaultContents,
} from "./vault";

interface SessionValue {
  ready: boolean;
  session: Session | null;
  vault: VaultContents | null;
  hasVault: boolean;
  hasPin: boolean;
  settings: LocalSettings;
  updateSettings: (patch: Partial<LocalSettings>) => void;
  setVault: (vault: VaultContents | null) => void;
  unlock: (secret: string, mode: "pin" | "passphrase") => Promise<void>;
  lock: () => void;
  signOut: () => Promise<void>;
  emergencyWipe: () => Promise<void>;
  refreshVaultFlags: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [vault, setVault] = useState<VaultContents | null>(null);
  const [hasVault, setHasVault] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [settings, setSettings] = useState<LocalSettings>(loadSettings());

  const refreshVaultFlags = useCallback(() => {
    setHasVault(vaultExists());
    setHasPin(pinEnabled());
  }, []);

  useEffect(() => {
    refreshVaultFlags();
    setSettings(loadSettings());
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshVaultFlags]);

  useEffect(() => {
    const root = document.documentElement;
    const dark =
      settings.theme === "dark" ||
      (settings.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.dataset["accent"] = settings.accentColor;
    root.dataset["premiumChatStyle"] = settings.premiumChatStyle;
    root.dataset["premiumAvatarFrame"] = settings.premiumAvatarFrame ? "on" : "off";
    root.dataset["premiumProfileEffect"] = settings.premiumProfileEffect;
  }, [settings.theme, settings.accentColor, settings.premiumChatStyle, settings.premiumAvatarFrame, settings.premiumProfileEffect]);

  const updateSettings = useCallback((patch: Partial<LocalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch, ...(patch.theme ? { themePreferenceSet: true } : {}) };
      saveSettings(next);
      return next;
    });
  }, []);

  const unlock = useCallback(
    async (secret: string, mode: "pin" | "passphrase") => {
      const contents =
        mode === "pin" ? await unlockWithPin(secret) : await unlockWithPassphrase(secret);
      setVault(contents);
    },
    [],
  );

  const lock = useCallback(() => setVault(null), []);

  const signOut = useCallback(async () => {
    setVault(null);
    await supabase.auth.signOut();
  }, []);

  const emergencyWipe = useCallback(async () => {
    destroyLocalKeys();
    setVault(null);
    setHasVault(false);
    setHasPin(false);
    await supabase.auth.signOut({ scope: "global" });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      vault,
      hasVault,
      hasPin,
      settings,
      updateSettings,
      setVault: (next: VaultContents | null) => {
        setVault(next);
        setHasVault(next !== null || vaultExists());
      },
      unlock,
      lock,
      signOut,
      emergencyWipe,
      refreshVaultFlags,
    }),
    [
      ready,
      session,
      vault,
      hasVault,
      hasPin,
      settings,
      updateSettings,
      unlock,
      lock,
      signOut,
      emergencyWipe,
      refreshVaultFlags,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
