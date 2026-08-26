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
    const [attachments, chat, push, settings, vault, migration, recoveryMigration, activation, nativeActivity, microphonePlugin, authenticatedShell, runtime, i18n, microphone, session, styles] = await Promise.all([
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
      readFile(path.join(root, "styles.css"), "utf8"),
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
    expect(microphonePlugin).toContain("startCapture");
    expect(microphonePlugin).toContain("stopCapture");
    expect(microphonePlugin).toContain("MediaRecorder.OutputFormat.MPEG_4");
    expect(runtime).toContain("/api/notifications/status");
    expect(runtime).toContain("Authorization, Content-Type");
    expect(authenticatedShell).toContain('App.addListener("backButton"');
    expect(authenticatedShell).toContain("window.history.back()");
    expect(authenticatedShell).toContain("App.exitApp()");
    expect(i18n).not.toContain("TURN");
    expect(i18n).not.toContain("Capacitor build");
    expect(microphone).toContain("beginVoiceCapture");
    expect(microphone).toContain("startNativeVoiceCapture");
    expect(microphone).toContain("finishNativeVoiceCapture");
    expect(microphone).toContain("getUserMedia");
    expect(vault).toContain('theme: "light"');
    expect(session).toContain("themePreferenceSet");
    expect(chat).toContain("chat-composer");
    expect(styles).toContain("padding-bottom: max(env(safe-area-inset-bottom), 1rem)");
  });

  it("keeps professional community, subscription, and quiet-notification features within their intended boundaries", async () => {
    const [chat, attachments, push, groups, groupCrypto, groupRoute, verifiedBadge, subscriptions, admin, settings, migration, groupFallbackMigration, viteConfig, packageJson, androidBuild, authenticatedShell, capacitorConfig] = await Promise.all([
      readFile(path.join(root, "routes/_authenticated/chat.$id.tsx"), "utf8"),
      readFile(path.join(root, "lib/attachments.ts"), "utf8"),
      readFile(path.join(root, "lib/push-notifications.ts"), "utf8"),
      readFile(path.join(root, "lib/groups.ts"), "utf8"),
      readFile(path.join(root, "lib/group-crypto.ts"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/group.$id.tsx"), "utf8"),
      readFile(path.join(root, "components/VerifiedBadge.tsx"), "utf8"),
      readFile(path.join(root, "lib/subscriptions.ts"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/admin.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/settings.tsx"), "utf8"),
      readFile(path.join(root, "..", "supabase/migrations/20260825180000_community_and_subscription_features.sql"), "utf8"),
      readFile(path.join(root, "..", "supabase/migrations/20260826113000_fix_group_creator_fallback_policy.sql"), "utf8"),
      readFile(path.join(root, "..", "vite.config.ts"), "utf8"),
      readFile(path.join(root, "..", "package.json"), "utf8"),
      readFile(path.join(root, "..", "android/app/build.gradle"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/route.tsx"), "utf8"),
      readFile(path.join(root, "..", "capacitor.config.ts"), "utf8"),
    ]);

    expect(chat).toContain("wasAtBottomRef");
    expect(chat).toContain("publishTyping");
    expect(chat).toContain("reply_to");
    expect(chat).toContain("video/*");
    expect(attachments).toContain('"video"');
    expect(attachments).toContain("80 * 1024 * 1024");
    expect(push).toContain('addListener("pushNotificationReceived"');
    expect(push).not.toContain("LocalNotifications.schedule");
    expect(groups).toContain("create_group");
    expect(groups).toContain("group_key_envelopes");
    expect(groups).toContain("GROUP_RPC_FAILED");
    expect(groupCrypto).toContain("sealGroupKeyForMember");
    expect(groupCrypto).toContain("openGroupKeyForMember");
    expect(groupRoute).toContain("إدارة الأعضاء");
    expect(groupRoute).toContain("set_group_member_role");
    expect(verifiedBadge).toContain("BadgeCheck");
    expect(subscriptions).toContain("create_subscription_code");
    expect(admin).toContain("createSubscriptionCode");
    expect(admin).toContain("setVerified");
    expect(settings).toContain("redeemSubscriptionCode");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.groups");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.subscription_codes");
    expect(migration).toContain("digest(normalized, 'sha256')");
    expect(migration).toContain("profile-avatars");
    expect(groupFallbackMigration).toContain("member_id = auth.uid()");
    expect(groupFallbackMigration).toContain("role = 'owner'");
    expect(viteConfig).toContain("tanstackRouter");
    expect(packageJson).toContain("android:admin:debug");
    expect(androidBuild).toContain("applicationId \"Com.qarfash.admin\"");
    expect(androidBuild).toContain("processAdmin");
    expect(authenticatedShell).toContain("isAdminEdition");
    expect(capacitorConfig).toContain("AB_APP_EDITION");
    expect(capacitorConfig).toContain("Com.qarfash.admin");
  });

  it("uses one viewport owner and explicit scroll containers for phone pages", async () => {
    const [styles, shell, settings, chats, calls, contacts, devices, security, profile, group] = await Promise.all([
      readFile(path.join(root, "styles.css"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/route.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/settings.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/chats.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/calls.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/contacts.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/devices.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/security.$id.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/profile.$id.tsx"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/group.$id.tsx"), "utf8"),
    ]);

    expect(styles).toContain("#root");
    expect(styles).toContain("@utility page-scroll");
    expect(styles).toContain("height: 100dvh");
    expect(styles).toContain("overflow-y: auto");
    expect(shell).toContain('className="app-shell flex min-h-0 flex-col overflow-hidden bg-background"');
    for (const page of [settings, chats, calls, contacts, devices, security, profile]) {
      expect(page).toContain("page-scroll");
    }
    expect(group).toContain("h-full");
    expect(group).not.toContain("h-[100dvh]");
  });

  it("keeps community creation and message actions usable without exposing forwarding metadata", async () => {
    const [groups, chat, stickers] = await Promise.all([
      readFile(path.join(root, "lib/groups.ts"), "utf8"),
      readFile(path.join(root, "routes/_authenticated/chat.$id.tsx"), "utf8"),
      readFile(path.join(root, "lib/premium-stickers.ts"), "utf8"),
    ]);

    expect(groups).toContain('communityClient.rpc("create_group"');
    expect(groups).toContain("GROUP_RPC_FAILED");
    expect(groups).toContain("group_key_envelopes");
    expect(groups).not.toContain("nextGroupId");
    expect(chat).toContain("startMessageGesture");
    expect(chat).toContain("horizontalDistance >= 56");
    expect(chat).toContain("DrawerContent");
    expect(chat).toContain("_alphaByteForwarded");
    expect(chat).toContain("محولة من");
    expect(stickers).toContain("bytey-crown");
    expect(stickers).toContain("bytey-ninja");
  });
});
