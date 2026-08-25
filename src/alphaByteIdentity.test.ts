import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = import.meta.dirname;

describe("Alpha Byte imported-project identity", () => {
  it("uses Alpha Byte on exterior screens while retaining the supplied Supabase client", async () => {
    const [rootRoute, splash, auth, activation, runtime, client] = await Promise.all([
      readFile(path.join(root, "routes/__root.tsx"), "utf8"),
      readFile(path.join(root, "routes/index.tsx"), "utf8"),
      readFile(path.join(root, "routes/auth.tsx"), "utf8"),
      readFile(path.join(root, "components/ActivationGate.tsx"), "utf8"),
      readFile(path.join(root, "..", "server/static-server.mjs"), "utf8"),
      readFile(path.join(root, "integrations/supabase/client.ts"), "utf8"),
    ]);
    expect(rootRoute).toContain("Alpha Byte");
    expect(splash).toContain("alpha-byte-cover");
    expect(auth).toContain("alpha-byte-cover");
    expect(activation).toContain("رمز التفعيل");
    expect(runtime).toContain("process.env.AB_ACTIVATION_CODE");
    expect(runtime).not.toContain("AB_ACTIVATION_CODE =");
    expect(runtime).toContain("firebase-admin");
    expect(client).toContain("VITE_SUPABASE_URL");
    expect(client).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(client).not.toContain("service_role");
  });

  it("publishes a client-rendered static payload to dist/public", async () => {
    const outputDirectory = path.join(root, "..", "dist", "public");
    const [html, runtime, packageJson, viteConfig, assets] = await Promise.all([
      readFile(path.join(outputDirectory, "index.html"), "utf8"),
      readFile(path.join(outputDirectory, "..", "index.js"), "utf8"),
      readFile(path.join(root, "..", "package.json"), "utf8"),
      readFile(path.join(root, "..", "vite.config.ts"), "utf8"),
      readdir(path.join(outputDirectory, "assets")),
    ]);

    expect(packageJson).toContain("prepare-deployment-runtime.mjs");
    expect(viteConfig).toContain('outDir: "dist/public"');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/assets\/index-[\w-]+\.js/);
    expect(html).toMatch(/assets\/styles-[\w-]+\.css/);
    expect(assets.some((asset) => asset.endsWith(".js"))).toBe(true);
    expect(assets.some((asset) => asset.endsWith(".css"))).toBe(true);
    expect(runtime).toContain("process.env.PORT");
    expect(runtime).toContain("publicDirectory");
  });

  it("keeps requested messaging enhancements encrypted, recoverable, and natively visible", async () => {
    const [attachments, chat, push, settings, vault, migration, recoveryMigration, activation, nativeActivity, microphonePlugin, authenticatedShell, runtime, i18n, microphone, session] = await Promise.all([
      readFile(path.join(root, "lib/attachments.ts"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/chat.$id.tsx"), "utf8"),
      readFile(path.join(root, "lib/push-notifications.ts"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/settings.tsx"), "utf8"),
      readFile(path.join(root, "lib/vault.ts"), "utf8"),
      readFile(path.join(root, "..", "supabase/migrations/20260825091000_encrypted_attachment_storage.sql"), "utf8"),
      readFile(path.join(root, "..", "supabase/migrations/20260825103000_add_encrypted_recovery_backup.sql"), "utf8"),
      readFile(path.join(root, "components/ActivationGate.tsx"), "utf8"),
      readFile(path.join(root, "..", "android/app/src/main/java/Com/qarfash/MainActivity.java"), "utf8"),
      readFile(path.join(root, "..", "android/app/src/main/java/Com/qarfash/MicrophonePermissionPlugin.java"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/route.tsx"), "utf8"),
      readFile(path.join(root, "..", "server/static-server.mjs"), "utf8"),
      readFile(path.join(root, "lib/i18n.tsx"), "utf8"),
      readFile(path.join(root, "lib/microphone.ts"), "utf8"),
      readFile(path.join(root, "lib/session.tsx"), "utf8"),
    ]);
    expect(attachments).toContain("encryptFile");
    expect(attachments).toContain("encrypted-attachments");
    expect(chat).toContain("MediaRecorder");
    expect(chat).toContain("uploadEncryptedAttachment");
    expect(chat).toContain("setClock");
    expect(chat).toContain("audio.play()");
    expect(chat).toContain("إيقاف");
    expect(chat).toContain("delivered_at");
    expect(chat).toContain("read_at");
    expect(push).toContain("PushNotifications.requestPermissions");
    expect(push).toContain("LocalNotifications.createChannel");
    expect(push).toContain("alpha_byte_messages");
    expect(settings).toContain("accentColor");
    expect(settings).toContain("createMessageRecovery");
    expect(settings).toContain("مفتاح استعادة الرسائل");
    expect(vault).toContain('theme: "dark" | "light" | "system"');
    expect(vault).toContain("createRecoveryBackup");
    expect(vault).toContain("restoreVaultFromRecovery");
    expect(migration).toContain("conversation members read encrypted attachments");
    expect(recoveryMigration).toContain("recovery_backup");
    expect(activation).toContain("activation-card");
    expect(nativeActivity).toContain("NotificationManager.IMPORTANCE_HIGH");
    expect(nativeActivity.indexOf("registerPlugin(MicrophonePermissionPlugin.class)")).toBeLessThan(nativeActivity.indexOf("super.onCreate(savedInstanceState)"));
    expect(microphonePlugin).toContain('result.put("status", status)');
    expect(microphonePlugin).toContain('resolveWithStatus(call, "granted")');
    expect(runtime).toContain("/api/notifications/status");
    expect(runtime).toContain("Authorization, Content-Type");
    expect(authenticatedShell).toContain('App.addListener("backButton"');
    expect(authenticatedShell).toContain("window.history.back()");
    expect(authenticatedShell).toContain("App.exitApp()");
    expect(i18n).not.toContain("TURN");
    expect(i18n).not.toContain("Capacitor build");
    expect(microphone).toContain("beginVoiceCapture");
    expect(microphone).toContain("getUserMedia");
    expect(vault).toContain('theme: "light"');
    expect(session).toContain("themePreferenceSet");
  });
});
