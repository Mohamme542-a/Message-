import { cacheCiphertextMessages, createConversationKeyMaterial, createEncryptedRecoveryBackup, createRecoveryKey, decryptFile, decryptJson, deleteLocalConversationData, encryptFile, encryptJson, exportConversationKeyRaw, fromB64, getCachedCiphertextMessages, getConversationKey, getDeviceIdentity, hasMessageLockCode, hasUnlockedRecoveryKey, openConversationKey, restoreEncryptedRecoveryBackup, sealConversationKey, setMessageLockCode, storeConversationKey, toB64, unlockRecoveryKey, verifyMessageLockCode } from "./alpha-crypto.js";

const API = "https://abmessenger-miwecp5v.manus.space";
const TOKEN_KEY = "alpha-byte.session";
const ACCOUNT_KEY = "alpha-byte.account";
const app = document.getElementById("app");
const state = { stage: "activation", view: "inbox", mode: "login", code: "", account: null, device: null, legacyIdentityMigrationAllowed: false, notice: "", dark: localStorage.getItem("alpha-byte.theme") !== "light", receipts: localStorage.getItem("alpha-byte.receipts") !== "off", sessions: null, currentSessionId: "", conversations: [], activeConversation: null, messages: [], people: [], search: "", searching: false, collectiveSearch: "", collectivePeople: [], collectiveSearching: false, collective: { kind: "group", members: [], avatarFile: null }, collectiveAdmin: { members: [], links: [], joinRequests: [], search: "", people: [], loading: false, newLink: "" }, inviteJoin: { open: false, value: "" }, conversationTools: false, messageSearch: "", messageSearchOpen: false, replyTo: null, attachmentDraft: null, avatarUrls: {}, attachmentUrls: {}, attachmentLoading: {}, attachmentPreview: null, grants: [], recovery: { unlocked: false, generatedKey: "" }, messageLock: { configured: false }, expiry: "week", busy: false, reactionPicker: false, stickerPicker: false };
let conversationRefreshTimer = null;
let recoveryBackupTimer = null;

const text = (value) => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" })[character]);
const sessionToken = () => localStorage.getItem(TOKEN_KEY) || "";
const namesKey = () => `alpha-byte.conversation-names.${state.account?.accountId || "guest"}`;
const deletedConversationsKey = () => `alpha-byte.deleted-conversations.${state.account?.accountId || "guest"}`;
const accountNames = () => JSON.parse(localStorage.getItem(namesKey()) || "{}");
const rememberName = (conversationId, name) => localStorage.setItem(namesKey(), JSON.stringify({ ...accountNames(), [conversationId]: name }));
const locallyDeletedConversations = () => new Set(JSON.parse(localStorage.getItem(deletedConversationsKey()) || "[]"));
const rememberLocalConversationDeletion = conversationId => localStorage.setItem(deletedConversationsKey(), JSON.stringify([...locallyDeletedConversations(), conversationId]));
const bindNativeSession = token => { try { window.AlphaByteNative?.bindSession?.(token); } catch { /* Browser preview has no native bridge. */ } };
const clearNativeSession = () => { try { window.AlphaByteNative?.clearSession?.(); } catch { /* Browser preview has no native bridge. */ } };
const pendingInviteFromNative = () => { try { return window.AlphaByteNative?.consumePendingInviteToken?.() || ""; } catch { return ""; } };
const messageFor = (code) => ({ ACTIVATION_REQUIRED:"رمز التفعيل غير صحيح", INVALID_ACCESS_INPUT:"تحقق من بيانات الدخول", USERNAME_UNAVAILABLE:"اسم المستخدم غير متاح", INVALID_USERNAME:"استخدم ٣–٣٢ حرفًا صغيرًا أو رقمًا أو شرطة سفلية.", INVALID_CREDENTIALS:"بيانات الدخول غير صحيحة", INVALID_PASSPHRASE_INPUT:"تحقق من العبارة السرية الجديدة؛ يلزم ١٢ حرفًا على الأقل.", CURRENT_PASSPHRASE_INVALID:"العبارة السرية الحالية غير صحيحة.", CURRENT_MESSAGE_LOCK_INVALID:"رمز الرسائل المحلي غير صحيح.", INVALID_MESSAGE_LOCK_CODE:"استخدم رمز رسائل رقميًا من ٦ إلى ٣٢ رقمًا.", INVALID_TRIAL_FEATURE:"هذه الميزة لا تتضمن تجربة مجانية.", TRIAL_ALREADY_USED:"استُخدمت التجربة المجانية لهذه الميزة سابقًا.", SESSION_REQUIRED:"انتهت جلسة هذا الجهاز", RECIPIENT_DEVICE_UNAVAILABLE:"هذا الحساب غير جاهز للمراسلة الآن؛ يجب أن يفتح Alpha Byte ويسجل جهازه أولًا.", FEATURE_APPROVAL_REQUIRED:"تحتاج موافقة المدير على هذا الامتياز.", CONVERSATION_ACCESS_REQUIRED:"لا تملك وصولًا إلى هذه المحادثة", CONVERSATION_MANAGE_REQUIRED:"هذه العملية متاحة للمالك أو المشرف فقط.", CONVERSATION_OWNER_REQUIRED:"تغيير دور المشرف متاح للمالك فقط.", CHANNEL_PUBLISH_REQUIRED:"النشر في القناة متاح للمالك والمشرفين فقط.", ACCOUNT_BLOCKED:"لا يمكنك مراسلة هذا الحساب لأنه حظرك أو لأن المحادثة مقيدة.", INVALID_REPORT:"تحقق من الحساب ونوع الإبلاغ.", DEVICE_ACCESS_REQUIRED:"تعذر التحقق من جهاز الإرسال؛ أعد تسجيل الدخول.", DEVICE_BOUND_TO_ANOTHER_ACCOUNT:"معرّف هذا الجهاز مرتبط بحساب آخر؛ أعد تثبيت التطبيق أو تواصل مع الدعم.", KEY_MATERIAL_UNAVAILABLE:"تم مسح مفتاح هذا الجهاز؛ أدخل مفتاح الاستعادة من الإعدادات إن كنت أنشأته سابقًا.", RECOVERY_BACKUP_NOT_FOUND:"لا توجد نسخة استعادة مشفّرة لهذا الحساب بعد.", INVALID_RECOVERY_KEY:"مفتاح الاستعادة غير صالح.", INVALID_RECOVERY_BACKUP:"تعذر التحقق من نسخة الاستعادة المشفّرة.", RECOVERY_BACKUP_ACCOUNT_MISMATCH:"لا تخص هذه النسخة الحساب المسجّل حاليًا.", INVALID_CONVERSATION_INPUT:"تعذر إنشاء المحادثة. حاول مرة أخرى.", INVALID_COLLECTIVE_INPUT:"تحقق من نوع المجموعة واسمها المشفّر.", INVALID_COLLECTIVE_MEMBER:"تعذر إضافة أحد الأعضاء إلى المجموعة.", ATTACHMENT_UNAVAILABLE:"الملف غير متاح أو انتهت مدة الاحتفاظ به.", NETWORK_ERROR:"تعذر الاتصال بخادم Alpha Byte.", CRYPTO_UNAVAILABLE:"هذا الجهاز لا يدعم التشفير المطلوب" }[code] || "تعذر إتمام الطلب الآن");

async function api(path, method = "GET", body, headers = {}) {
  const allHeaders = { ...headers };
  if (body && !(body instanceof Uint8Array)) allHeaders["Content-Type"] = "application/json";
  if (sessionToken()) allHeaders.Authorization = `Bearer ${sessionToken()}`;
  const response = await fetch(`${API}${path}`, { method, headers: allHeaders, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({ ok: false, error: "NETWORK_ERROR" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "NETWORK_ERROR");
  return payload;
}

const isGranted = key => state.grants.some(item => item.featureKey === key);
const profileThemeKey = () => `alpha-byte.profile-theme.${state.account?.accountId || "guest"}`;
const profileTheme = () => isGranted("profile_theme") ? localStorage.getItem(profileThemeKey()) || "graphite" : "graphite";
const setNotice = value => { state.notice = value; render(); };
const mark = () => '<svg class="mark" viewBox="0 0 108 108" role="img" aria-label="Alpha Byte"><rect width="108" height="108" fill="#050505"/><path fill="#F4F4F5" d="M17 82 43 25h12l26 57H68l-6-14H35l-6 14Zm23-25h18L49 36Z"/><path fill="#A3A3A3" d="M56 26h14c14 0 21 7 21 16 0 6-3 11-8 13 7 2 10 7 10 13 0 10-8 17-22 17H56Zm12 10v15h4c5 0 8-3 8-8 0-5-3-7-9-7Zm0 24v16h5c6 0 9-3 9-8 0-5-4-8-10-8Z"/><path fill="#050505" d="M54 24h7v61h-7z"/></svg>';
const busy = value => { state.busy = value; render(); };

function resetAccountState() {
  stopConversationRefresh();
  Object.values(state.avatarUrls).forEach(url => { try { URL.revokeObjectURL(url); } catch { /* Ignore an already released object URL. */ } });
  Object.values(state.attachmentUrls).forEach(url => { try { URL.revokeObjectURL(url); } catch { /* Ignore an already released object URL. */ } });
  if (state.attachmentDraft?.url) { try { URL.revokeObjectURL(state.attachmentDraft.url); } catch { /* Ignore an already released object URL. */ } }
  state.device = null;
  state.legacyIdentityMigrationAllowed = false;
  state.sessions = null;
  state.currentSessionId = "";
  state.conversations = [];
  state.activeConversation = null;
  state.messages = [];
  state.people = [];
  state.search = "";
  state.searching = false;
  state.collectiveSearch = "";
  state.collectivePeople = [];
  state.collectiveSearching = false;
  state.collective = { kind: "group", members: [], avatarFile: null };
  state.collectiveAdmin = { members: [], links: [], joinRequests: [], search: "", people: [], loading: false, newLink: "" };
  state.inviteJoin = { open: false, value: "" };
  state.conversationTools = false;
  state.messageSearch = "";
  state.messageSearchOpen = false;
  state.replyTo = null;
  state.attachmentDraft = null;
  state.avatarUrls = {};
  state.attachmentUrls = {};
  state.attachmentLoading = {};
  state.attachmentPreview = null;
  state.grants = [];
  state.recovery = { unlocked: false, generatedKey: "" };
  state.messageLock = { configured: false };
  state.reactionPicker = false;
  state.stickerPicker = false;
}

function clearAttachmentDraft() {
  if (state.attachmentDraft?.url) { try { URL.revokeObjectURL(state.attachmentDraft.url); } catch { /* Ignore an already released object URL. */ } }
  state.attachmentDraft = null;
}

function setAttachmentDraft(file) {
  clearAttachmentDraft();
  if (!file) return;
  const mimeType = file.type || resolvedAttachmentMime({ name: file.name, mimeType: file.type });
  const image = mimeType.startsWith("image/") || /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name || "");
  state.attachmentDraft = { file, name: file.name || "ملف مشفّر", mimeType, image, url: image ? URL.createObjectURL(file) : "" };
}

async function registerDevice() {
  if (!state.account?.accountId) throw new Error("SESSION_REQUIRED");
  const identity = await getDeviceIdentity(state.account.accountId, { allowLegacyMigration: state.legacyIdentityMigrationAllowed });
  await api("/api/native/device", "POST", { deviceId: identity.deviceId, deviceLabel: "Alpha Byte Android", identityPublicKey: toB64(new TextEncoder().encode(JSON.stringify(identity.publicJwk))) });
  state.device = identity;
  state.legacyIdentityMigrationAllowed = false;
  return identity;
}

async function ensureSenderDevice() {
  if (!state.account?.accountId) throw new Error("SESSION_REQUIRED");
  return registerDevice();
}

async function loadGrants() { const data = await api("/api/native/features"); state.grants = data.grants; if (!isGranted("profile_theme")) localStorage.removeItem(profileThemeKey()); }
async function loadSessions() { state.sessions = null; render(); try { const data = await api("/api/native/sessions"); state.sessions = data.sessions; state.currentSessionId = data.currentSessionId; } catch (error) { state.sessions = []; state.notice = messageFor(error.message); } render(); }
async function loadConversations() { const data = await api("/api/native/conversations"); const deleted = locallyDeletedConversations(); state.conversations = data.conversations.filter(conversation => !deleted.has(conversation.id)); }

async function loadRecoveryStatus() {
  state.recovery.unlocked = Boolean(state.account?.accountId && await hasUnlockedRecoveryKey(state.account.accountId));
}

async function uploadRecoveryBackup() {
  if (!state.account?.accountId) return false;
  const backup = await createEncryptedRecoveryBackup(state.account.accountId);
  if (!backup) return false;
  await api("/api/native/recovery-backup", "PUT", backup);
  return true;
}

function scheduleRecoveryBackup() {
  if (!state.account?.accountId) return;
  if (recoveryBackupTimer) clearTimeout(recoveryBackupTimer);
  recoveryBackupTimer = setTimeout(() => { recoveryBackupTimer = null; void uploadRecoveryBackup().catch(() => { /* Local messaging is not interrupted when a backup refresh is temporarily unavailable. */ }); }, 450);
}

async function createRecoveryBackup() {
  if (!state.account?.accountId) throw new Error("SESSION_REQUIRED");
  const recoveryKey = createRecoveryKey();
  await unlockRecoveryKey(state.account.accountId, recoveryKey);
  await uploadRecoveryBackup();
  state.recovery = { unlocked: true, generatedKey: recoveryKey };
}

async function restoreRecoveryBackup(recoveryKey) {
  if (!state.account?.accountId) throw new Error("SESSION_REQUIRED");
  const result = await api("/api/native/recovery-backup");
  const restored = await restoreEncryptedRecoveryBackup(state.account.accountId, recoveryKey, result.backup);
  state.recovery = { unlocked: true, generatedKey: "" };
  await loadConversations();
  scheduleRecoveryBackup();
  return restored;
}

async function loadMessageLockStatus() {
  state.messageLock.configured = Boolean(state.account?.accountId && await hasMessageLockCode(state.account.accountId));
}

async function changeMessageLock(currentCode, nextCode) {
  if (!state.account?.accountId) throw new Error("SESSION_REQUIRED");
  if (state.messageLock.configured && !await verifyMessageLockCode(state.account.accountId, currentCode)) throw new Error("CURRENT_MESSAGE_LOCK_INVALID");
  await setMessageLockCode(state.account.accountId, nextCode);
  state.messageLock.configured = true;
}

async function unlockMessageLock(code) {
  if (!state.account?.accountId || !await verifyMessageLockCode(state.account.accountId, code)) throw new Error("CURRENT_MESSAGE_LOCK_INVALID");
  state.stage = "app";
  openPendingInvite(pendingInviteFromNative());
}

async function deleteConversationFromThisDevice() {
  const conversationId = state.activeConversation?.id;
  if (!conversationId || !state.account?.accountId) return;
  await deleteLocalConversationData(state.account.accountId, conversationId);
  rememberLocalConversationDeletion(conversationId);
  stopConversationRefresh();
  state.activeConversation = null;
  state.messages = [];
  state.view = "inbox";
  await loadConversations();
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("alpha-byte:conversation-key-stored", event => {
  if (event.detail?.accountId === state.account?.accountId) scheduleRecoveryBackup();
});

function stopConversationRefresh() {
  if (conversationRefreshTimer) clearInterval(conversationRefreshTimer);
  conversationRefreshTimer = null;
}

const messageFingerprint = messages => messages.map(message => message.id).join("|");
const attachmentMime = value => String(value?.mimeType || "").toLowerCase();
const attachmentName = value => String(value?.name || "alpha-byte-file");
const isImageAttachment = value => attachmentMime(value).startsWith("image/") || /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(attachmentName(value));
const resolvedAttachmentMime = value => attachmentMime(value) || (/\.(?:jpe?g)$/i.test(attachmentName(value)) ? "image/jpeg" : /\.png$/i.test(attachmentName(value)) ? "image/png" : /\.webp$/i.test(attachmentName(value)) ? "image/webp" : /\.gif$/i.test(attachmentName(value)) ? "image/gif" : "application/octet-stream");
const messageTime = value => { try { return value ? new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "مشفّرة"; } catch { return "مشفّرة"; } };

async function decodeConversationMessages(conversationId, key, envelopes) {
  await cacheCiphertextMessages(state.account.accountId, conversationId, envelopes);
  const cached = await getCachedCiphertextMessages(state.account.accountId, conversationId);
  const merged = Array.from(new Map([...cached, ...envelopes].map(envelope => [envelope.id, envelope])).values());
  const messages = [];
  for (const envelope of merged) {
    try { messages.push({ ...envelope, clear: await decryptJson(key, envelope.encryptedPayload) }); }
    catch { messages.push({ ...envelope, clear: { kind: "unreadable" } }); }
  }
  return messages;
}

async function refreshOpenConversation() {
  const conversation = state.activeConversation;
  if (!conversation?.id || !conversation.key || state.view !== "conversation" || state.busy || document.visibilityState === "hidden") return;
  try {
    const result = await api(`/api/native/conversations/${conversation.id}/messages`);
    if (state.activeConversation?.id !== conversation.id || state.activeConversation.key !== conversation.key) return;
    const messages = await decodeConversationMessages(conversation.id, conversation.key, result.messages);
    if (messageFingerprint(messages) !== messageFingerprint(state.messages)) {
      state.messages = messages;
      render();
    }
  } catch { /* A transient refresh failure must not replace the open conversation or interrupt typing. */ }
}

function startConversationRefresh() {
  stopConversationRefresh();
  conversationRefreshTimer = setInterval(() => { void refreshOpenConversation(); }, 3000);
}

async function loadConversationAvatar(key, assetId) {
  if (!assetId) return "";
  if (state.avatarUrls[assetId]) return state.avatarUrls[assetId];
  const response = await fetch(`${API}/api/native/conversation-assets/${encodeURIComponent(assetId)}`, { headers: { Authorization: `Bearer ${sessionToken()}` } });
  if (!response.ok) return "";
  const clear = await decryptFile(key, new Uint8Array(await response.arrayBuffer()));
  const url = URL.createObjectURL(new Blob([clear], { type: "image/*" }));
  state.avatarUrls[assetId] = url;
  return url;
}

async function openConversation(conversation) {
  busy(true);
  try {
    if (!state.device) await ensureSenderDevice();
    let key = await getConversationKey(state.account.accountId, conversation.id);
    const [result, metadata] = await Promise.all([api(`/api/native/conversations/${conversation.id}/messages`), api(`/api/native/conversations/${conversation.id}`)]);
    if (!key && result.encryptedConversationKey) {
      try { key = await openConversationKey(result.encryptedConversationKey, state.device); }
      catch { throw new Error("KEY_MATERIAL_UNAVAILABLE"); }
      await storeConversationKey(state.account.accountId, conversation.id, key);
    }
    if (!key) throw new Error("KEY_MATERIAL_UNAVAILABLE");
    if (metadata.conversation?.encryptedTitle) { try { const title = await decryptJson(key, metadata.conversation.encryptedTitle); if (title?.title) rememberName(conversation.id, title.title); } catch { /* Keep the safe generic title if this device cannot open the wrapped key. */ } }
    const messages = await decodeConversationMessages(conversation.id, key, result.messages);
    const avatarUrl = await loadConversationAvatar(key, metadata.conversation?.avatarAssetId).catch(() => "");
    state.activeConversation = { ...conversation, ...metadata.conversation, memberRole: metadata.membership?.memberRole, avatarUrl, key };
    state.messages = messages;
    state.view = "conversation";
    startConversationRefresh();
  } catch (error) { state.notice = messageFor(error.message); }
  state.busy = false; render();
}

function render() {
  document.body.className = [state.dark ? "" : "light", `profile-${profileTheme()}`].filter(Boolean).join(" ");
  if (state.stage === "activation") return renderActivation();
  if (state.stage === "access") return renderAccess();
  if (state.stage === "message-lock") return renderMessageLock();
  renderApp();
}

function renderActivation() {
  app.innerHTML = `<section class="auth-shell"><div class="auth-card">${mark()}<h1 class="auth-title">Alpha Byte</h1><p class="auth-copy">رمز التفعيل يفتح هذا الجهاز فقط</p><form class="form" id="activation-form"><label class="field">رمز التفعيل<input id="activation-code" type="password" autocomplete="one-time-code" autofocus required /></label><p class="notice">${text(state.notice)}</p><button class="primary" type="submit"><span>متابعة</span><span class="arrow">‹</span></button></form><p class="security">⌁ <span>تشفير محلي قبل الإرسال وحذف خادمي خلال أسبوع</span></p></div></section>`;
  document.getElementById("activation-form").addEventListener("submit", async event => { event.preventDefault(); const code = document.getElementById("activation-code").value.trim(); if (!code) return setNotice("أدخل رمز التفعيل"); try { await api("/api/native/activate", "POST", { activationCode: code }); state.code = code; state.stage = "access"; state.notice = ""; render(); } catch (error) { setNotice(messageFor(error.message)); } });
}

function renderAccess() {
  const login = state.mode === "login";
  app.innerHTML = `<section class="auth-shell"><div class="auth-card"><div class="access-head"><b>Alpha Byte</b><span>مراسلة خاصة</span></div><div class="switch"><button class="${login ? "selected" : ""}" id="login-tab" type="button">دخول</button><button class="${!login ? "selected" : ""}" id="register-tab" type="button">حساب جديد</button></div><form class="form" id="access-form"><label class="field">اسم المستخدم<input id="username" autocomplete="username" placeholder="username" required /></label><label class="field">العبارة السرية<input id="secret" type="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="12 حرفًا على الأقل" minlength="12" required /></label><p class="notice">${text(state.notice)}</p><button class="primary" type="submit"><span>${login ? "دخول" : "إنشاء الحساب"}</span><span class="arrow">‹</span></button></form><button class="link-button" id="change-code" type="button">تغيير رمز التفعيل</button><p class="security">⌁ <span>لا نطلب رقم هاتف أو بريدًا إلكترونيًا</span></p></div></section>`;
  document.getElementById("login-tab").onclick = () => { state.mode = "login"; state.notice = ""; render(); };
  document.getElementById("register-tab").onclick = () => { state.mode = "register"; state.notice = ""; render(); };
  document.getElementById("change-code").onclick = () => { state.stage = "activation"; state.notice = ""; render(); };
  document.getElementById("access-form").addEventListener("submit", async event => { event.preventDefault(); const username = document.getElementById("username").value.trim(); const secret = document.getElementById("secret").value; busy(true); try { const legacyAccount = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null"); const data = await api("/api/native/access", "POST", { action: state.mode, username, secret, activationCode: state.code, deviceLabel: "Alpha Byte Android" }); resetAccountState(); localStorage.setItem(TOKEN_KEY, data.token); bindNativeSession(data.token); localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ username: data.username, accountId: data.accountId })); state.account = { username: data.username, accountId: data.accountId }; state.legacyIdentityMigrationAllowed = legacyAccount?.accountId === data.accountId; await registerDevice(); await Promise.all([loadGrants(), loadConversations(), loadMessageLockStatus()]); state.stage = state.messageLock.configured ? "message-lock" : "app"; state.notice = ""; if (state.stage === "app") openPendingInvite(pendingInviteFromNative()); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
}

function renderMessageLock() {
  app.innerHTML = `<section class="auth-shell"><div class="auth-card"><div class="access-head"><b>Alpha Byte</b><span>قفل الرسائل المحلي</span></div><p class="auth-copy">أدخل رمز الرسائل المحفوظ على هذا الجهاز. لا يستبدل هذا الرمز عبارة دخول حسابك أو مفتاح الاستعادة.</p><form class="form" id="message-lock-form"><label class="field">رمز الرسائل<input id="message-lock-code" inputmode="numeric" autocomplete="one-time-code" type="password" minlength="6" maxlength="32" required autofocus /></label><p class="notice">${text(state.notice)}</p><button class="primary" type="submit"><span>فتح الرسائل</span><span class="arrow">‹</span></button></form><button class="link-button" id="message-lock-logout" type="button">تسجيل الخروج من هذا الجهاز</button></div></section>`;
  document.getElementById("message-lock-form").onsubmit = async event => { event.preventDefault(); busy(true); try { await unlockMessageLock(document.getElementById("message-lock-code")?.value || ""); state.notice = ""; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  document.getElementById("message-lock-logout").onclick = () => { resetAccountState(); localStorage.removeItem(TOKEN_KEY); clearNativeSession(); localStorage.removeItem(ACCOUNT_KEY); state.stage = "activation"; state.account = null; state.code = ""; render(); };
}

const sessionSection = () => {
  if (state.sessions === null) return '<p class="session-title">الأجهزة والجلسات</p><p class="muted">جارٍ التحقق…</p>';
  if (!state.sessions.length) return '<p class="session-title">الأجهزة والجلسات</p><p class="muted">لا توجد جلسات ظاهرة.</p>';
  return `<p class="session-title">الأجهزة والجلسات</p>${state.sessions.map(item => `<div class="device"><span><strong>${text(item.deviceLabel || "جهاز غير مسمى")}${item.id === state.currentSessionId ? " · هذا الجهاز" : ""}</strong><small>${item.state === "active" ? "نشطة" : "ملغاة"}</small></span>${item.state === "active" ? `<button class="revoke" data-revoke="${text(item.id)}" type="button">إبطال</button>` : "<span>◌</span>"}</div>`).join("")}`;
};

function recoverySection() {
  const generated = state.recovery.generatedKey ? `<div class="recovery-key"><strong>انسخ مفتاح الاستعادة الآن</strong><code>${text(state.recovery.generatedKey)}</code><small>لن يظهر هذا المفتاح مرة أخرى، ولا يُحفظ كنص في التطبيق أو الخادم.</small><button id="copy-recovery-key" type="button">نسخ المفتاح</button><button id="dismiss-recovery-key" type="button">فهمت، أخفيه</button></div>` : "";
  const create = state.recovery.unlocked ? '<button class="setting" id="backup-recovery-now" type="button"><span><strong>تحديث النسخة المشفّرة الآن</strong><small>نسخ مفاتيح المحادثات المتاحة على هذا الجهاز</small></span><i class="setting-icon">↻</i></button>' : '<button class="setting" id="create-recovery-key" type="button"><span><strong>إنشاء مفتاح استعادة</strong><small>يلزم لاستعادة مفاتيح محادثاتك على هاتف جديد</small></span><i class="setting-icon">⌁</i></button>';
  return `<section class="recovery-section"><p class="session-title">استعادة المحادثات المشفّرة</p>${generated}<div class="settings-card">${create}</div><form class="recovery-restore" id="restore-recovery-form"><label class="field">مفتاح الاستعادة<input id="recovery-key-input" autocomplete="off" spellcheck="false" placeholder="ألصق مفتاحك هنا" required /></label><button class="secondary" type="submit">استعادة من النسخة المشفّرة</button></form><p class="muted">تستعيد المفاتيح فقط؛ لا تستعيد ذاكرة المرفقات أو هوية الجهاز. قد لا تتوفر رسائل انتهت مدة الاحتفاظ الخادمية بها (حدها أسبوع).</p></section>`;
}

function featureTiles() { const catalog = [["verified_badge","شارة تحقق Alpha","تظهر بجانب اسمك"],["sticker_pack","ملصقات حصرية","حزمة رموز موسعة"],["profile_theme","مظهر حساب حصري","ألوان وهوية مميزة"]]; return `<div class="feature-grid">${catalog.map(([key,label,description]) => { const grant = state.grants.find(item => item.featureKey === key); const trial = key === "sticker_pack" || key === "profile_theme"; const status = grant ? (grant.expiresAt ? `تجربة حتى ${new Intl.DateTimeFormat("ar", { day:"numeric", month:"short" }).format(new Date(grant.expiresAt))}` : "مفعلة") : (trial ? `تجربة مجانية ٣ أيام · ${text(description)}` : `طلب موافقة · ${text(description)}`); return `<button class="feature-tile ${grant ? "granted" : ""}" ${grant ? "" : trial ? `data-trial="${key}"` : `data-feature="${key}"`} type="button"><strong>${text(label)}</strong><small>${status}</small></button>`; }).join("")}</div>`; }

function accountSecuritySection() {
  return `<section class="account-security"><p class="session-title">الحساب والقفل المحلي</p><form class="settings-form" id="username-form"><label class="field">اسم المستخدم<input id="account-username" value="${text(state.account?.username || "")}" pattern="[a-z0-9_]{3,32}" autocomplete="username" required /></label><button class="secondary" type="submit">حفظ اسم المستخدم</button></form><form class="settings-form" id="passphrase-form"><label class="field">العبارة السرية الحالية<input id="current-passphrase" type="password" autocomplete="current-password" required /></label><label class="field">عبارة سرية جديدة<input id="next-passphrase" type="password" minlength="12" autocomplete="new-password" required /></label><button class="secondary" type="submit">تغيير عبارة الدخول</button></form><form class="settings-form" id="message-lock-settings-form"><label class="field">${state.messageLock.configured ? "رمز الرسائل الحالي" : "رمز الرسائل"}<input id="current-message-lock" inputmode="numeric" type="password" minlength="6" maxlength="32" ${state.messageLock.configured ? "required" : ""} /></label><label class="field">${state.messageLock.configured ? "رمز رسائل جديد" : "تعيين رمز رسائل"}<input id="next-message-lock" inputmode="numeric" type="password" minlength="6" maxlength="32" required /></label><button class="secondary" type="submit">${state.messageLock.configured ? "تغيير رمز الرسائل" : "تفعيل قفل الرسائل"}</button><p class="muted">هذا القفل محلي لهذا الجهاز فقط، وليس عبارة دخول الحساب أو مفتاح الاستعادة.</p></form></section>`;
}

function profileThemePicker() {
  if (!isGranted("profile_theme")) return "";
  const choices = [["graphite", "غرافيت"], ["cobalt", "كوبالت"], ["violet", "بنفسجي"]];
  return `<section class="profile-theme-picker"><p class="session-title">مظهر الحساب الحصري</p><div>${choices.map(([key, label]) => `<button class="${profileTheme() === key ? "selected" : ""}" data-profile-theme="${key}" type="button"><i></i>${label}</button>`).join("")}</div></section>`;
}

function peopleResults() {
  if (state.search.trim().length < 2) return '<p class="muted">اكتب حرفين على الأقل للبحث عن حساب جاهز للمراسلة.</p>';
  if (state.searching) return '<p class="muted">جارٍ البحث…</p>';
  if (!state.people.length) return '<p class="muted">لا توجد حسابات جاهزة للمراسلة بهذا الاسم.</p>';
  return state.people.map(person => `<article class="person-row"><span class="avatar">${text(person.username.slice(0,1).toUpperCase())}</span><span><strong>${text(person.username)}</strong><small>${text(person.accountId)}</small></span><button class="person-action" data-person="${text(person.accountId)}" data-person-name="${text(person.username)}" type="button" ${state.busy ? "disabled" : ""}>${state.busy ? "جارٍ الفتح…" : "مراسلة"}</button></article>`).join("");
}

function conversationList() { if (!state.conversations.length) return `<section class="empty"><div class="empty-ring">✦</div><p>ابدأ محادثة مشفّرة</p><small>ابحث عن شخص من تبويب الأشخاص، أو أنشئ مجموعة أو قناة.</small></section>`; return `<section class="conversation-list">${state.conversations.map(item => { const kind = item.kind === "channel" ? "قناة مشفّرة" : item.kind === "group" ? "مجموعة مشفّرة" : "محادثة خاصة مشفّرة"; return `<button class="conversation-row" data-conversation="${text(item.id)}"><span class="avatar">${text((accountNames()[item.id] || "A").slice(0,1).toUpperCase())}</span><span><strong>${text(accountNames()[item.id] || (item.kind === "channel" ? "قناة" : item.kind === "group" ? "مجموعة" : "محادثة خاصة"))}</strong><small>${kind} · حذف خادمي خلال أسبوع</small></span><i>‹</i></button>`; }).join("")}</section>`; }

function collectiveMemberResults() {
  if (state.collectiveSearch.trim().length < 2) return '<p class="muted">ابحث باسم المستخدم لإضافة أعضاء حقيقيين.</p>';
  if (state.collectiveSearching) return '<p class="muted">جارٍ البحث…</p>';
  const selected = new Set(state.collective.members.map(member => member.accountId));
  const people = state.collectivePeople.filter(person => !selected.has(person.accountId));
  if (!people.length) return '<p class="muted">لا توجد حسابات جاهزة للإضافة.</p>';
  return people.map(person => `<article class="person-row"><span class="avatar">${text(person.username.slice(0, 1).toUpperCase())}</span><span><strong>${text(person.username)}</strong><small>${text(person.accountId)}</small></span><button class="person-action" data-collective-add="${text(person.accountId)}" data-collective-name="${text(person.username)}" type="button">إضافة</button></article>`).join("");
}

function renderCollectiveBuilder() {
  const collective = state.collective;
  const members = collective.members.length ? collective.members.map(member => `<div class="collective-member"><span><strong>${text(member.username)}</strong><small>${member.memberRole === "admin" ? "مشرف" : "عضو"}</small></span><button type="button" data-collective-role="${text(member.accountId)}">${member.memberRole === "admin" ? "عضو" : "مشرف"}</button><button type="button" data-collective-remove="${text(member.accountId)}">×</button></div>`).join("") : '<p class="muted">يمكنك الإنشاء الآن ثم إضافة أعضاء لاحقًا، أو أضفهم من البحث.</p>';
  return `<section class="page collective-builder"><div class="page-head"><button class="back-button" id="collective-back" type="button">›</button><h2>إنشاء مساحة</h2></div><div class="switch collective-kind"><button class="${collective.kind === "group" ? "selected" : ""}" data-collective-kind="group" type="button">مجموعة</button><button class="${collective.kind === "channel" ? "selected" : ""}" data-collective-kind="channel" type="button">قناة</button></div><p class="muted">${collective.kind === "channel" ? "المالك والمشرفون فقط ينشرون في القناة." : "كل أعضاء المجموعة يستطيعون الإرسال."}</p><label class="field">الاسم<input id="collective-title" maxlength="64" placeholder="اسم ${collective.kind === "channel" ? "القناة" : "المجموعة"}" required /></label><label class="collective-avatar-input">＋ <span>${collective.avatarFile ? text(collective.avatarFile.name) : "صورة مشفّرة اختيارية"}</span><input id="collective-avatar" type="file" accept="image/*" hidden /></label><p class="session-title">الأعضاء</p><label class="search-box"><input id="collective-search" value="${text(state.collectiveSearch)}" placeholder="ابحث باسم المستخدم" autocomplete="off" /><span>⌕</span></label><div class="people-results">${collectiveMemberResults()}</div><div class="collective-members">${members}</div><button class="primary" id="create-collective" type="button" ${state.busy ? "disabled" : ""}>${state.busy ? "جارٍ الإنشاء…" : `إنشاء ${collective.kind === "channel" ? "القناة" : "المجموعة"}`}</button></section>`;
}

function renderApp() {
  const account = state.account || { username: "", accountId: "" };
  let content = "";
  if (state.view === "inbox") content = `<section class="inbox-title"><div><p class="eyebrow">${text(account.username)}</p><h1>Alpha Byte</h1></div><button class="compose" id="open-people" type="button" aria-label="محادثة جديدة">＋</button></section><button class="collective-cta" id="open-collective" type="button"><span class="collective-cta-icon">◈</span><span><strong>إنشاء مجموعة أو قناة</strong><small>مجانًا · اسم وصورة وأدوار مالك ومشرف وعضو</small></span><i>‹</i></button><button class="invite-join-toggle" id="open-invite-join" type="button">لديك رابط دعوة؟ انضم بطلب موافقة <i>‹</i></button>${state.inviteJoin.open ? `<form class="invite-join-form" id="invite-join-form"><input id="invite-join-input" value="${text(state.inviteJoin.value)}" placeholder="الصق رابط أو رمز الدعوة" autocomplete="off"/><button type="submit">إرسال الطلب</button></form>` : ""}${conversationList()}`;
  if (state.view === "people") content = `<section class="page"><div class="page-head"><span class="page-icon">⌕</span><h2>الأشخاص</h2></div><label class="search-box"><input id="people-search" value="${text(state.search)}" placeholder="ابحث باسم المستخدم" autocomplete="off" /><span>⌕</span></label><div class="people-results">${peopleResults()}</div></section>`;
  if (state.view === "collective-create") content = renderCollectiveBuilder();
  if (state.view === "settings") content = `<section class="page"><div class="page-head"><span class="page-icon">⚙</span><h2>الإعدادات</h2></div><div class="settings-card"><div class="setting"><span><strong>${text(account.username)}${isGranted("verified_badge") ? ' <b class="verified-badge">✓ موثّق</b>' : ""}</strong><small>${text(account.accountId)}</small></span><i class="setting-icon">◉</i></div><button class="setting" id="theme-toggle"><span><strong>المظهر</strong><small>${state.dark ? "داكن" : "فاتح"}</small></span><i class="setting-icon">◐</i></button><button class="setting" id="receipt-toggle"><span><strong>إيصالات القراءة</strong><small>${state.receipts ? "مفعلة" : "متوقفة"}</small></span><i class="setting-icon">✓</i></button><div class="setting permission-note"><span><strong>الصور والملفات</strong><small>اختيار من منتقي النظام، والكاميرا تطلب الإذن عند استخدامها فقط.</small></span><i class="setting-icon">⌁</i></div></div>${accountSecuritySection()}${recoverySection()}<p class="session-title">امتيازات الحساب</p>${featureTiles()}${profileThemePicker()}${sessionSection()}<div class="settings-card"><button class="setting danger" id="logout"><span><strong>تسجيل الخروج</strong><small>إنهاء جلسة هذا الجهاز</small></span><i class="setting-icon">×</i></button></div></section>`;
  if (state.view === "conversation" && state.activeConversation) content = renderConversation();
  app.innerHTML = `<main class="app-shell ${state.view === "conversation" ? "chat-shell" : ""}">${state.view !== "conversation" ? `<header class="topbar">${mark().replace('class="mark"','class="mark mark-sm"')}<button class="icon-button" id="settings-button" type="button" aria-label="الإعدادات">⚙</button></header>` : ""}${state.notice ? `<p class="app-notice" role="status">${text(state.notice)}</p>` : ""}${content}</main>${state.view !== "conversation" ? `<nav class="nav"><button class="${state.view === "inbox" ? "current" : ""}" data-view="inbox"><i>✦</i><span>المحادثات</span></button><button class="${state.view === "people" ? "current" : ""}" data-view="people"><i>⌕</i><span>الأشخاص</span></button><button class="${state.view === "settings" ? "current" : ""}" data-view="settings"><i>⚙</i><span>الإعدادات</span></button></nav>` : ""}`;
  bindApp();
  if (state.view === "conversation") void loadVisibleImagePreviews();
}

function renderConversationTools() {
  if (!state.conversationTools || !state.activeConversation) return "";
  const collective = isCollectiveConversation();
  const manager = canManageActiveConversation();
  const admin = state.collectiveAdmin;
  if (admin.loading) return '<section class="conversation-tools"><p class="muted">جارٍ تحميل أدوات المحادثة…</p></section>';
  if (!collective) {
    const peer = admin.members.find(member => member.accountId !== state.account?.accountId);
    return `<section class="conversation-tools"><p class="tools-title">خصوصية المحادثة</p><p class="muted">${peer ? `الحساب: ${text(peer.username || peer.accountId)}` : "جارٍ التحقق من الطرف الآخر."}</p><div class="tools-actions"><button data-report-peer="spam" type="button">إبلاغ عن إزعاج</button><button class="danger" id="block-peer" type="button">حظر الحساب</button><button class="danger" id="delete-local-conversation" type="button">حذف من هذا الجهاز</button></div><p class="muted">يحذف المفتاح والنسخة المخزنة محليًا فقط؛ لا يحذف رسائل الطرف الآخر أو النسخ الخادمية المحتفظ بها مؤقتًا.</p></section>`;
  }
  const members = admin.members.map(member => { const canChangeRole = state.activeConversation.memberRole === "owner" && member.memberRole !== "owner"; const canRemove = manager && member.memberRole !== "owner" && (state.activeConversation.memberRole === "owner" || member.memberRole === "member"); return `<div class="managed-member"><span><strong>${text(member.username || member.accountId)}</strong><small>${member.memberRole === "owner" ? "المالك" : member.memberRole === "admin" ? "مشرف" : "عضو"}</small></span>${canChangeRole ? `<button data-manage-role="${text(member.accountId)}" data-next-role="${member.memberRole === "admin" ? "member" : "admin"}" type="button">${member.memberRole === "admin" ? "إزالة الإشراف" : "ترقية مشرف"}</button>` : ""}${canRemove ? `<button class="danger" data-manage-remove="${text(member.accountId)}" type="button">إخراج</button>` : ""}</div>`; }).join("") || '<p class="muted">لا توجد عضوية ظاهرة.</p>';
  const addResults = admin.people.filter(person => !admin.members.some(member => member.accountId === person.accountId)).map(person => `<button class="tool-search-row" data-manage-add="${text(person.accountId)}" data-manage-name="${text(person.username)}" type="button"><span>${text(person.username)}</span><b>إضافة</b></button>`).join("");
  const links = admin.links.map(link => `<div class="invite-link-row"><span><strong>رابط دعوة</strong><small>${link.state === "active" ? "نشط · يطلب موافقة مدير لإضافة المفتاح" : "ملغى"}</small></span>${link.state === "active" ? `<button class="danger" data-invite-revoke="${text(link.id)}" type="button">إلغاء</button>` : ""}</div>`).join("");
  const joinRequests = admin.joinRequests.map(request => `<div class="invite-link-row"><span><strong>${text(request.username || request.requesterAccountId)}</strong><small>طلب انضمام عبر رابط</small></span><button data-join-approve="${text(request.id)}" data-join-account="${text(request.requesterAccountId)}" type="button">قبول</button><button class="danger" data-join-decline="${text(request.id)}" data-join-account="${text(request.requesterAccountId)}" type="button">رفض</button></div>`).join("");
  return `<section class="conversation-tools"><div class="tools-head"><p class="tools-title">إدارة ${state.activeConversation.kind === "channel" ? "القناة" : "المجموعة"}</p><button id="close-conversation-tools" type="button">إغلاق</button></div><div class="tools-actions"><button class="danger" id="delete-local-conversation" type="button">حذف من هذا الجهاز</button></div><p class="muted">يحذف المفتاح والنسخة المحلية فقط، ولا يزيل المجموعة أو القناة من بقية الأعضاء.</p>${manager ? `<form id="manage-title-form" class="manage-title"><input id="manage-title" value="${text(accountNames()[state.activeConversation.id] || "")}" maxlength="64" placeholder="اسم المساحة"/><button type="submit">حفظ الاسم</button></form><label class="manage-avatar">تحديث الصورة المشفّرة<input id="manage-avatar" type="file" accept="image/*" hidden /></label><div class="invite-create"><button id="create-invite-link" type="button">إنشاء رابط دعوة</button>${admin.newLink ? `<button id="copy-invite-link" type="button">نسخ الرابط</button>` : ""}</div>${admin.newLink ? `<p class="invite-value">${text(admin.newLink)}</p>` : ""}` : '<p class="muted">عرض الأعضاء متاح لك؛ التعديل للمالك أو المشرف فقط.</p>'}<p class="tools-subtitle">الأعضاء</p>${members}${manager ? `<label class="tool-search"><input id="manage-member-search" value="${text(admin.search)}" placeholder="ابحث لإضافة عضو" autocomplete="off"/><span>⌕</span></label><div class="manage-search-results">${addResults || (admin.search.length >= 2 ? '<p class="muted">لا توجد حسابات جاهزة للإضافة.</p>' : "")}</div><p class="tools-subtitle">طلبات الانضمام</p>${joinRequests || '<p class="muted">لا توجد طلبات معلقة.</p>'}<p class="tools-subtitle">روابط الدعوة</p>${links || '<p class="muted">لا يوجد رابط نشط بعد.</p>'}` : ""}</section>`;
}

function renderConversation() {
  const name = accountNames()[state.activeConversation.id] || "محادثة خاصة";
  const channelReadOnly = state.activeConversation.kind === "channel" && !["owner", "admin"].includes(state.activeConversation.memberRole);
  const filteredMessages = state.messageSearch.trim() ? state.messages.filter(message => String(message.clear?.text || "").toLocaleLowerCase().includes(state.messageSearch.trim().toLocaleLowerCase())) : state.messages;
  const items = filteredMessages.map(message => { const clear = message.clear || {}; const direction = message.senderDeviceId === state.device?.deviceId ? "outgoing" : "incoming"; const meta = `<small class="message-meta">${text(messageTime(message.serverReceivedAt))}</small>`; const reply = clear.replyTo ? `<div class="reply-context"><span>رد على رسالة</span><p>${text(clear.replyPreview || "رسالة مشفّرة")}</p></div>` : ""; const actions = clear.kind === "text" ? `<div class="message-actions"><button data-message-reply="${text(message.id)}" type="button">رد</button><button data-message-copy="${text(clear.text || "")}" type="button">نسخ</button></div>` : ""; if (clear.kind === "reaction") return `<div class="reaction-event">${text(clear.emoji || "✦")} تفاعل مشفّر</div>`; if (clear.kind === "sticker") return `<div class="sticker-event ${direction}"><b>${text(clear.glyph || "✦")}</b><span>${text(clear.label || "ALPHA")}</span>${meta}</div>`; if (clear.kind === "attachment") { const attachmentId = text(clear.attachmentId || ""); const preview = state.attachmentUrls[clear.attachmentId]; const image = isImageAttachment(clear); return `<div class="message-bubble attachment-card ${direction}">${reply}${image && preview ? `<button class="image-preview" data-attachment-open="${attachmentId}" data-file-name="${text(attachmentName(clear))}" data-file-mime="${text(resolvedAttachmentMime(clear))}" type="button"><img src="${text(preview)}" alt="صورة مشفّرة بعد فكها محليًا"/></button>` : ""}<strong>${image ? "صورة مشفّرة" : "ملف مشفّر"}</strong><small>${text(attachmentName(clear))}</small><button class="file-open" data-attachment-open="${attachmentId}" data-file-name="${text(attachmentName(clear))}" data-file-mime="${text(resolvedAttachmentMime(clear))}" type="button">${image ? "عرض بعد فك التشفير" : "تنزيل بعد فك التشفير"}</button>${meta}</div>`; } if (clear.kind === "unreadable") return '<div class="reaction-event">تعذر فتح رسالة مشفّرة على هذا الجهاز.</div>'; return `<div class="message-bubble ${direction}">${reply}<p>${text(clear.text || "")}</p>${actions}${meta}</div>`; }).join("") || '<section class="empty compact"><div class="empty-ring">✦</div><p>لا توجد رسائل مطابقة</p><small>جرّب كلمة مختلفة أو امسح البحث.</small></section>';
  const reactions = ["👍", "❤️", "😂", "😮", "😢"];
  const stickers = [["✦", "ALPHA"], ["◈", "BYTE"], ["↗", "RISE"], ["∞", "PRIVATE"]];
  const attachmentDraft = state.attachmentDraft ? `<section class="attachment-draft" aria-label="مرفق قبل الإرسال">${state.attachmentDraft.image ? `<img src="${text(state.attachmentDraft.url)}" alt="معاينة قبل الإرسال"/>` : '<span class="draft-file-icon">⌁</span>'}<span><strong>${text(state.attachmentDraft.name)}</strong><small>${state.attachmentDraft.image ? "صورة جاهزة للتشفير" : "ملف جاهز للتشفير"}</small></span><button id="remove-attachment-draft" type="button" aria-label="إزالة المرفق">×</button></section>` : "";
  const composer = channelReadOnly ? '<p class="channel-readonly">هذه قناة: النشر متاح للمالك والمشرفين فقط.</p>' : `${attachmentDraft}<form class="composer" id="message-form"><button class="send" type="submit" aria-label="إرسال" ${state.busy ? "disabled" : ""}>${state.busy ? '<span class="send-pending">جارٍ الإرسال…</span>' : "➤"}</button><label class="attach ${state.busy ? "disabled" : ""}" title="اختيار صورة أو ملف"><span>⌇</span><input id="attachment-file" type="file" accept="image/*,application/pdf,text/plain,.doc,.docx,.zip" hidden ${state.busy ? "disabled" : ""}/></label><input id="message-text" placeholder="اكتب رسالة" autocomplete="off" ${state.busy ? "disabled" : ""}/><select id="expiry" aria-label="مدة الاحتفاظ" ${state.busy ? "disabled" : ""}><option value="day" ${state.expiry === "day" ? "selected" : ""}>١ي</option><option value="week" ${state.expiry === "week" ? "selected" : ""}>٧ي</option><option value="month" ${state.expiry === "month" ? "selected" : ""}>٣٠ي</option></select><button class="attach camera" id="camera-button" type="button" title="التقاط صورة" ${state.busy ? "disabled" : ""}>⌾</button><input id="camera-file" type="file" accept="image/*" capture="environment" hidden ${state.busy ? "disabled" : ""}/></form>`;
  const conversationAvatar = state.activeConversation.avatarUrl ? `<img class="conversation-avatar" src="${text(state.activeConversation.avatarUrl)}" alt=""/>` : `<span class="conversation-avatar conversation-avatar-fallback">${text(name.slice(0, 1).toUpperCase())}</span>`;
  const preview = state.attachmentPreview ? `<div class="attachment-modal" role="dialog" aria-modal="true"><button id="close-attachment-preview" type="button" aria-label="إغلاق">×</button><img src="${text(state.attachmentPreview.url)}" alt="${text(state.attachmentPreview.name)}"/><p>${text(state.attachmentPreview.name)}</p></div>` : "";
  const messageSearch = state.messageSearchOpen ? `<form class="message-search" id="message-search-form"><input id="message-search-input" value="${text(state.messageSearch)}" placeholder="ابحث في الرسائل المفتوحة على هذا الجهاز" autocomplete="off"/><button type="submit">بحث</button><button id="clear-message-search" type="button">مسح</button></form>` : "";
  const replyDraft = state.replyTo ? `<div class="reply-draft"><span>رد على: ${text(state.replyTo.clear?.text || "رسالة")}</span><button id="cancel-reply" type="button">×</button></div>` : "";
  return `<section class="conversation-page"><div class="conversation-head"><button class="back-button" id="back-inbox" type="button">›</button>${conversationAvatar}<div><strong>${text(name)}</strong><small>${state.activeConversation.kind === "channel" ? "قناة مشفّرة" : state.activeConversation.kind === "group" ? "مجموعة مشفّرة" : "تشفير محلي قبل الإرسال"}</small></div><button class="icon-button small" id="message-search-toggle" type="button" aria-label="بحث في الرسائل">⌕</button><button class="icon-button small" id="conversation-tools" type="button" aria-label="أدوات المحادثة">⋮</button><button class="icon-button small" id="reaction-button" type="button">☺</button>${isGranted("sticker_pack") ? '<button class="icon-button small" id="sticker-button" type="button">✦</button>' : ""}</div>${messageSearch}${state.reactionPicker ? `<div class="reaction-picker">${reactions.map(emoji => `<button type="button" data-reaction="${emoji}">${emoji}</button>`).join("")}</div>` : ""}${state.stickerPicker ? `<div class="sticker-picker">${stickers.map(([glyph, label]) => `<button type="button" data-sticker-glyph="${glyph}" data-sticker-label="${label}"><b>${glyph}</b><span>${label}</span></button>`).join("")}</div>` : ""}${renderConversationTools()}<div class="message-scroll">${items}</div>${replyDraft}${composer}<p class="retention-note">* تحتفظ الأجهزة بنسخها وفق اختيارها، لكن الخادم يحذف كل النسخ خلال أسبوع.</p>${preview}</section>`;
}

async function startConversation(accountId, username) {
  if (!accountId || state.busy) return;
  state.notice = "جارٍ تجهيز محادثة مشفّرة…";
  busy(true);
  try {
    await ensureSenderDevice();
    const recipient = await api(`/api/native/people/${accountId}/device`);
    const remotePublicJwk = JSON.parse(new TextDecoder().decode(fromB64(recipient.device.identityPublicKey)));
    const material = await createConversationKeyMaterial();
    const senderWrap = await sealConversationKey(material.raw, state.device, state.device.publicJwk);
    const recipientWrap = await sealConversationKey(material.raw, state.device, remotePublicJwk);
    const result = await api("/api/native/conversations", "POST", { recipientAccountId: accountId, senderEncryptedConversationKey: senderWrap, recipientEncryptedConversationKey: recipientWrap });
    await storeConversationKey(state.account.accountId, result.conversationId, material.key);
    rememberName(result.conversationId, username);
    await loadConversations();
    const conversation = state.conversations.find(item => item.id === result.conversationId) || { id: result.conversationId };
    state.notice = "";
    await openConversation(conversation);
  } catch (error) { state.notice = messageFor(error.message); state.busy = false; render(); }
}

async function createCollective(kind, title, avatarFile) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("INVALID_COLLECTIVE_INPUT");
  const senderDevice = await ensureSenderDevice();
  const material = await createConversationKeyMaterial();
  const creatorEncryptedConversationKey = await sealConversationKey(material.raw, senderDevice, senderDevice.publicJwk);
  const members = [];
  for (const member of state.collective.members) {
    const recipient = await api(`/api/native/people/${member.accountId}/device`);
    const publicJwk = JSON.parse(new TextDecoder().decode(fromB64(recipient.device.identityPublicKey)));
    members.push({ accountId: member.accountId, memberRole: member.memberRole, encryptedConversationKey: await sealConversationKey(material.raw, senderDevice, publicJwk) });
  }
  const encryptedTitle = await encryptJson(material.key, { title: cleanTitle, kind });
  const result = await api("/api/native/collectives", "POST", { kind, encryptedTitle, creatorEncryptedConversationKey, members });
  await storeConversationKey(state.account.accountId, result.conversationId, material.key);
  rememberName(result.conversationId, cleanTitle);
  if (avatarFile) {
    const cipher = await encryptFile(material.key, avatarFile);
    await api(`/api/native/conversations/${result.conversationId}/avatar`, "POST", cipher, { "Content-Type": "application/octet-stream" });
  }
  await loadConversations();
  state.collective = { kind: "group", members: [], avatarFile: null };
  state.collectivePeople = [];
  state.collectiveSearch = "";
  await openConversation(state.conversations.find(item => item.id === result.conversationId) || { id: result.conversationId, kind });
}

const isCollectiveConversation = () => ["group", "channel"].includes(state.activeConversation?.kind);
const canManageActiveConversation = () => isCollectiveConversation() && ["owner", "admin"].includes(state.activeConversation?.memberRole);

async function loadConversationTools() {
  const conversation = state.activeConversation;
  if (!conversation?.id) return;
  state.collectiveAdmin.loading = true;
  render();
  try {
    const members = await api(`/api/native/conversations/${conversation.id}/members`);
    let links = [], joinRequests = [];
    if (canManageActiveConversation()) {
      [links, joinRequests] = await Promise.all([
        api(`/api/native/conversations/${conversation.id}/invite-links`).then(result => result.links),
        api(`/api/native/conversations/${conversation.id}/join-requests`).then(result => result.requests),
      ]);
    }
    state.collectiveAdmin = { ...state.collectiveAdmin, members: members.members, links, joinRequests, loading: false };
  } catch (error) { state.collectiveAdmin.loading = false; state.notice = messageFor(error.message); }
  render();
}

async function saveCollectiveTitle(value) {
  const conversation = state.activeConversation;
  const title = value.trim();
  if (!conversation?.key || !title) throw new Error("INVALID_COLLECTIVE_INPUT");
  const encryptedTitle = await encryptJson(conversation.key, { title, kind: conversation.kind });
  await api(`/api/native/conversations/${conversation.id}/title`, "POST", { encryptedTitle });
  rememberName(conversation.id, title);
  state.activeConversation.encryptedTitle = encryptedTitle;
}

async function saveCollectiveAvatar(file) {
  const conversation = state.activeConversation;
  if (!conversation?.key || !file) return;
  const cipher = await encryptFile(conversation.key, file);
  const result = await api(`/api/native/conversations/${conversation.id}/avatar`, "POST", cipher, { "Content-Type": "application/octet-stream" });
  const url = URL.createObjectURL(new Blob([file], { type: file.type || "image/*" }));
  if (conversation.avatarAssetId && state.avatarUrls[conversation.avatarAssetId]) URL.revokeObjectURL(state.avatarUrls[conversation.avatarAssetId]);
  state.avatarUrls[result.assetId] = url;
  state.activeConversation.avatarAssetId = result.assetId;
  state.activeConversation.avatarUrl = url;
}

async function addCollectiveAdminMember(accountId, username) {
  const conversation = state.activeConversation;
  if (!conversation?.key || !accountId || state.collectiveAdmin.members.some(member => member.accountId === accountId)) return;
  const recipient = await api(`/api/native/people/${accountId}/device`);
  const publicJwk = JSON.parse(new TextDecoder().decode(fromB64(recipient.device.identityPublicKey)));
  const encryptedConversationKey = await sealConversationKey(await exportConversationKeyRaw(conversation.key), state.device, publicJwk);
  await api(`/api/native/conversations/${conversation.id}/members`, "POST", { accountId, memberRole: "member", encryptedConversationKey });
  state.collectiveAdmin.members.push({ accountId, username, memberRole: "member" });
  state.collectiveAdmin.people = state.collectiveAdmin.people.filter(person => person.accountId !== accountId);
}

async function changeCollectiveAdminRole(accountId, role) {
  const conversation = state.activeConversation;
  if (!conversation) return;
  await api(`/api/native/conversations/${conversation.id}/members/${accountId}/role`, "POST", { memberRole: role });
  const member = state.collectiveAdmin.members.find(item => item.accountId === accountId);
  if (member) member.memberRole = role;
}

async function removeCollectiveAdminMember(accountId) {
  const conversation = state.activeConversation;
  if (!conversation) return;
  await api(`/api/native/conversations/${conversation.id}/members/${accountId}/remove`, "POST");
  state.collectiveAdmin.members = state.collectiveAdmin.members.filter(member => member.accountId !== accountId);
}

async function createCollectiveInviteLink() {
  const conversation = state.activeConversation;
  if (!conversation) return;
  const result = await api(`/api/native/conversations/${conversation.id}/invite-links`, "POST");
  const link = `alphabyte://join?invite=${encodeURIComponent(result.token)}`;
  state.collectiveAdmin.links = [{ id: result.id, state: "active", createdAt: new Date().toISOString(), link }, ...state.collectiveAdmin.links];
  state.collectiveAdmin.newLink = link;
}

async function revokeCollectiveLink(inviteLinkId) {
  const conversation = state.activeConversation;
  if (!conversation) return;
  await api(`/api/native/conversations/${conversation.id}/invite-links/${inviteLinkId}/revoke`, "POST");
  const link = state.collectiveAdmin.links.find(item => item.id === inviteLinkId);
  if (link) link.state = "revoked";
}

async function decideCollectiveJoinRequest(requestId, accountId, decision) {
  const conversation = state.activeConversation;
  if (!conversation) return;
  if (decision === "approve") {
    const recipient = await api(`/api/native/people/${accountId}/device`);
    const publicJwk = JSON.parse(new TextDecoder().decode(fromB64(recipient.device.identityPublicKey)));
    const encryptedConversationKey = await sealConversationKey(await exportConversationKeyRaw(conversation.key), state.device, publicJwk);
    await api(`/api/native/conversations/${conversation.id}/join-requests/${requestId}/approve`, "POST", { encryptedConversationKey });
    state.collectiveAdmin.members.push({ accountId, username: accountId, memberRole: "member" });
  } else {
    await api(`/api/native/conversations/${conversation.id}/join-requests/${requestId}/decline`, "POST");
  }
  state.collectiveAdmin.joinRequests = state.collectiveAdmin.joinRequests.filter(request => request.id !== requestId);
}

async function copyText(value) {
  if (!value) return;
  try { await navigator.clipboard?.writeText(value); state.notice = "تم النسخ"; }
  catch { state.notice = `رابط الدعوة: ${value}`; }
  render();
}

async function blockConversationPeer() {
  const peer = state.collectiveAdmin.members.find(member => member.accountId !== state.account?.accountId);
  if (!peer) throw new Error("INVALID_ACCOUNT");
  await api("/api/native/blocks", "POST", { accountId: peer.accountId });
  state.notice = `تم حظر ${peer.username || "الحساب"}`;
}

async function reportConversationPeer(category) {
  const peer = state.collectiveAdmin.members.find(member => member.accountId !== state.account?.accountId);
  if (!peer) throw new Error("INVALID_ACCOUNT");
  const latest = [...state.messages].reverse().find(message => message.senderDeviceId !== state.device?.deviceId);
  await api("/api/native/reports", "POST", { reportedAccountId: peer.accountId, category, messageReference: latest?.id });
  state.notice = "تم إرسال البلاغ للمراجعة";
}

function inviteTokenFromInput(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return raw;
  try { return new URL(raw).searchParams.get("invite") || ""; } catch { return ""; }
}

function openPendingInvite(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ""))) return;
  state.inviteJoin = { open: true, value: `alphabyte://join?invite=${token}` };
  if (state.stage !== "app") return;
  state.view = "inbox";
  state.busy = true;
  render();
  void requestInviteJoin(String(token)).catch(error => {
    state.inviteJoin = { open: true, value: `alphabyte://join?invite=${token}` };
    state.notice = error.message === "ALREADY_A_MEMBER" ? "أنت عضو بالفعل في هذه المساحة." : messageFor(error.message);
  }).finally(() => { state.busy = false; render(); });
}

async function requestInviteJoin(value) {
  const token = inviteTokenFromInput(value);
  if (!token) throw new Error("INVALID_INVITE_LINK");
  await api("/api/native/invite-links/request", "POST", { token });
  state.inviteJoin = { open: false, value: "" };
  state.notice = "أُرسل طلب الانضمام؛ سيضيفك المالك أو المشرف بعد الموافقة.";
}

async function sendEnvelope(value, attachmentFile) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const senderDevice = await ensureSenderDevice();
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const expiryMap = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000 };
  let payload = { kind: "text", text: value.trim(), replyTo: state.replyTo?.id || undefined, replyPreview: state.replyTo?.clear?.text?.slice(0, 96) || undefined };
  const expiresAt = Date.now() + expiryMap[state.expiry];
  if (attachmentFile) {
    const cipher = await encryptFile(conversation.key, attachmentFile);
    const uploaded = await api("/api/native/attachments", "POST", cipher, { "Content-Type": "application/octet-stream", "x-alpha-message-id": messageId, "x-alpha-conversation-id": conversation.id, "x-alpha-retention-deadline": String(expiresAt) });
    payload = { kind: "attachment", name: attachmentFile.name, mimeType: attachmentFile.type || "application/octet-stream", attachmentId: uploaded.attachmentId, replyTo: state.replyTo?.id || undefined, replyPreview: state.replyTo?.clear?.text?.slice(0, 96) || undefined };
  }
  const encryptedPayload = await encryptJson(conversation.key, payload);
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: senderDevice.deviceId, encryptedPayload, encryptedHeader, expiresAt });
  state.replyTo = null;
  await openConversation(conversation);
}

async function sendReaction(emoji) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const senderDevice = await ensureSenderDevice();
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const encryptedPayload = await encryptJson(conversation.key, { kind: "reaction", emoji });
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: senderDevice.deviceId, encryptedPayload, encryptedHeader, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  await openConversation(conversation);
}

async function sendSticker(glyph, label) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const senderDevice = await ensureSenderDevice();
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const encryptedPayload = await encryptJson(conversation.key, { kind: "sticker", glyph, label });
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: senderDevice.deviceId, encryptedPayload, encryptedHeader, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  await openConversation(conversation);
}

async function getDecryptedAttachment(attachmentId) {
  const conversation = state.activeConversation; if (!conversation?.key || !attachmentId) return;
  const response = await fetch(`${API}/api/native/attachments/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Bearer ${sessionToken()}` } });
  if (!response.ok) throw new Error("ATTACHMENT_UNAVAILABLE");
  return decryptFile(conversation.key, new Uint8Array(await response.arrayBuffer()));
}

async function getImageAttachmentUrl(attachmentId, mimeType) {
  if (state.attachmentUrls[attachmentId]) return state.attachmentUrls[attachmentId];
  const clear = await getDecryptedAttachment(attachmentId);
  const objectUrl = URL.createObjectURL(new Blob([clear], { type: mimeType }));
  state.attachmentUrls[attachmentId] = objectUrl;
  return objectUrl;
}

async function loadVisibleImagePreviews() {
  for (const message of state.messages) {
    const clear = message.clear || {};
    const attachmentId = clear.attachmentId;
    if (clear.kind !== "attachment" || !attachmentId || !isImageAttachment(clear) || state.attachmentUrls[attachmentId] || state.attachmentLoading[attachmentId]) continue;
    state.attachmentLoading[attachmentId] = true;
    try { await getImageAttachmentUrl(attachmentId, resolvedAttachmentMime(clear)); }
    catch { /* The attachment keeps its safe open action if its preview is unavailable. */ }
    finally { delete state.attachmentLoading[attachmentId]; }
    if (state.view === "conversation") render();
  }
}

async function openAttachment(attachmentId, filename, mimeType) {
  const clear = await getDecryptedAttachment(attachmentId);
  if (String(mimeType).startsWith("image/")) {
    const objectUrl = state.attachmentUrls[attachmentId] || URL.createObjectURL(new Blob([clear], { type: mimeType }));
    state.attachmentUrls[attachmentId] = objectUrl;
    state.attachmentPreview = { url: objectUrl, name: filename };
    render();
    return;
  }
  const objectUrl = URL.createObjectURL(new Blob([clear], { type: mimeType || "application/octet-stream" }));
  const link = document.createElement("a"); link.href = objectUrl; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function bindApp() {
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = async () => { state.view = button.dataset.view; if (state.view === "settings") { render(); await Promise.all([loadSessions(), loadGrants(), loadRecoveryStatus(), loadMessageLockStatus()]); render(); } else render(); });
  const settings = document.getElementById("settings-button"); if (settings) settings.onclick = async () => { state.view = "settings"; render(); await Promise.all([loadSessions(), loadGrants(), loadRecoveryStatus(), loadMessageLockStatus()]); render(); };
  const openPeople = document.getElementById("open-people"); if (openPeople) openPeople.onclick = () => { state.view = "people"; render(); };
  const openCollective = document.getElementById("open-collective"); if (openCollective) openCollective.onclick = () => { state.view = "collective-create"; state.notice = ""; render(); };
  const openInviteJoin = document.getElementById("open-invite-join"); if (openInviteJoin) openInviteJoin.onclick = () => { state.inviteJoin.open = !state.inviteJoin.open; render(); };
  const inviteJoinForm = document.getElementById("invite-join-form"); if (inviteJoinForm) inviteJoinForm.onsubmit = async event => { event.preventDefault(); busy(true); try { await requestInviteJoin(document.getElementById("invite-join-input")?.value || ""); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const collectiveBack = document.getElementById("collective-back"); if (collectiveBack) collectiveBack.onclick = () => { state.view = "inbox"; render(); };
  document.querySelectorAll("[data-collective-kind]").forEach(button => button.onclick = () => { state.collective.kind = button.dataset.collectiveKind; render(); });
  const collectiveAvatar = document.getElementById("collective-avatar"); if (collectiveAvatar) collectiveAvatar.onchange = event => { state.collective.avatarFile = event.target.files?.[0] || null; render(); };
  const collectiveSearch = document.getElementById("collective-search"); if (collectiveSearch) collectiveSearch.oninput = async event => { const query = event.target.value; state.collectiveSearch = query; state.collectivePeople = []; state.collectiveSearching = query.trim().length >= 2; const results = document.querySelector(".people-results"); if (results) results.innerHTML = collectiveMemberResults(); if (query.trim().length < 2) return; try { const data = await api(`/api/native/people?q=${encodeURIComponent(query)}`); if (state.collectiveSearch === query) { state.collectivePeople = data.people; state.collectiveSearching = false; const current = document.querySelector(".people-results"); if (current) { current.innerHTML = collectiveMemberResults(); bindCollectiveButtons(); } } } catch (error) { if (state.collectiveSearch === query) { state.collectiveSearching = false; state.notice = messageFor(error.message); render(); } } };
  bindCollectiveButtons();
  document.querySelectorAll("[data-conversation]").forEach(button => button.onclick = () => openConversation(state.conversations.find(item => item.id === button.dataset.conversation)));
  const search = document.getElementById("people-search"); if (search) search.oninput = async event => { const query = event.target.value; state.search = query; state.people = []; state.searching = query.trim().length >= 2; const results = document.querySelector(".people-results"); if (results) results.innerHTML = peopleResults(); if (query.trim().length < 2) return; try { const data = await api(`/api/native/people?q=${encodeURIComponent(query)}`); if (state.search === query) { state.people = data.people; state.searching = false; const currentResults = document.querySelector(".people-results"); if (currentResults) { currentResults.innerHTML = peopleResults(); bindPeopleButtons(); } } } catch (error) { if (state.search === query) { state.searching = false; state.notice = messageFor(error.message); render(); } } };
  bindPeopleButtons();
  const theme = document.getElementById("theme-toggle"); if (theme) theme.onclick = () => { state.dark = !state.dark; localStorage.setItem("alpha-byte.theme", state.dark ? "dark" : "light"); render(); };
  document.querySelectorAll("[data-profile-theme]").forEach(button => button.onclick = () => { if (!isGranted("profile_theme")) return; localStorage.setItem(profileThemeKey(), button.dataset.profileTheme); render(); });
  const receipts = document.getElementById("receipt-toggle"); if (receipts) receipts.onclick = () => { state.receipts = !state.receipts; localStorage.setItem("alpha-byte.receipts", state.receipts ? "on" : "off"); render(); };
  const createRecovery = document.getElementById("create-recovery-key"); if (createRecovery) createRecovery.onclick = async () => { busy(true); try { await createRecoveryBackup(); state.notice = "تم إنشاء نسخة مفاتيح مشفّرة. انسخ مفتاح الاستعادة الآن واحفظه في مكان آمن."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const backupRecovery = document.getElementById("backup-recovery-now"); if (backupRecovery) backupRecovery.onclick = async () => { busy(true); try { await uploadRecoveryBackup(); state.notice = "تم تحديث النسخة المشفّرة للمفاتيح المتاحة على هذا الجهاز."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const copyRecovery = document.getElementById("copy-recovery-key"); if (copyRecovery) copyRecovery.onclick = () => copyText(state.recovery.generatedKey);
  const dismissRecovery = document.getElementById("dismiss-recovery-key"); if (dismissRecovery) dismissRecovery.onclick = () => { state.recovery.generatedKey = ""; render(); };
  const restoreRecovery = document.getElementById("restore-recovery-form"); if (restoreRecovery) restoreRecovery.onsubmit = async event => { event.preventDefault(); busy(true); try { const restored = await restoreRecoveryBackup(document.getElementById("recovery-key-input")?.value || ""); state.notice = restored ? `تمت استعادة مفاتيح ${restored} محادثة على هذا الجهاز.` : "لم تتضمن النسخة أي مفتاح محادثة متاح."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const usernameForm = document.getElementById("username-form"); if (usernameForm) usernameForm.onsubmit = async event => { event.preventDefault(); busy(true); try { const username = document.getElementById("account-username")?.value || ""; const result = await api("/api/native/account/username", "POST", { username }); state.account.username = result.username; localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...state.account })); state.notice = "تم تغيير اسم المستخدم."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const passphraseForm = document.getElementById("passphrase-form"); if (passphraseForm) passphraseForm.onsubmit = async event => { event.preventDefault(); busy(true); try { await api("/api/native/account/passphrase", "POST", { currentSecret: document.getElementById("current-passphrase")?.value || "", nextSecret: document.getElementById("next-passphrase")?.value || "" }); state.notice = "تم تغيير عبارة الدخول؛ لا تتغير مفاتيح محادثاتك."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const messageLockForm = document.getElementById("message-lock-settings-form"); if (messageLockForm) messageLockForm.onsubmit = async event => { event.preventDefault(); busy(true); try { await changeMessageLock(document.getElementById("current-message-lock")?.value || "", document.getElementById("next-message-lock")?.value || ""); state.notice = "تم حفظ رمز الرسائل محليًا على هذا الجهاز."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const logout = document.getElementById("logout"); if (logout) logout.onclick = () => { resetAccountState(); localStorage.removeItem(TOKEN_KEY); clearNativeSession(); localStorage.removeItem(ACCOUNT_KEY); state.stage = "activation"; state.account = null; state.code = ""; state.view = "inbox"; render(); };
  document.querySelectorAll("[data-revoke]").forEach(button => button.onclick = async () => { try { const result = await api(`/api/native/sessions/${button.dataset.revoke}/revoke`, "POST"); if (result.currentSessionRevoked) { resetAccountState(); localStorage.removeItem(TOKEN_KEY); clearNativeSession(); state.stage = "activation"; state.account = null; render(); } else loadSessions(); } catch (error) { setNotice(messageFor(error.message)); } });
  document.querySelectorAll("[data-trial]").forEach(button => button.onclick = async () => { busy(true); try { const result = await api("/api/native/features/trial", "POST", { featureKey: button.dataset.trial }); state.grants.push({ featureKey: result.trial.featureKey, state: "enabled", grantedAt: new Date().toISOString(), expiresAt: result.trial.expiresAt }); state.notice = "بدأت تجربة الميزة لمدة ثلاثة أيام."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  document.querySelectorAll("[data-feature]").forEach(button => button.onclick = async () => { if (isGranted(button.dataset.feature)) return; try { await api("/api/native/feature-requests", "POST", { featureKey: button.dataset.feature }); state.notice = "أُرسل طلبك إلى المدير للمراجعة"; } catch (error) { state.notice = messageFor(error.message); } render(); });
  const back = document.getElementById("back-inbox"); if (back) back.onclick = () => { stopConversationRefresh(); state.view = "inbox"; state.activeConversation = null; render(); };
  const messageSearchToggle = document.getElementById("message-search-toggle"); if (messageSearchToggle) messageSearchToggle.onclick = () => { state.messageSearchOpen = !state.messageSearchOpen; render(); };
  const messageSearchForm = document.getElementById("message-search-form"); if (messageSearchForm) messageSearchForm.onsubmit = event => { event.preventDefault(); state.messageSearch = document.getElementById("message-search-input")?.value || ""; render(); };
  const clearMessageSearch = document.getElementById("clear-message-search"); if (clearMessageSearch) clearMessageSearch.onclick = () => { state.messageSearch = ""; state.messageSearchOpen = false; render(); };
  document.querySelectorAll("[data-message-reply]").forEach(button => button.onclick = () => { state.replyTo = state.messages.find(message => message.id === button.dataset.messageReply) || null; render(); });
  document.querySelectorAll("[data-message-copy]").forEach(button => button.onclick = () => copyText(button.dataset.messageCopy));
  const cancelReply = document.getElementById("cancel-reply"); if (cancelReply) cancelReply.onclick = () => { state.replyTo = null; render(); };
  const conversationTools = document.getElementById("conversation-tools"); if (conversationTools) conversationTools.onclick = async () => { state.conversationTools = !state.conversationTools; render(); if (state.conversationTools) await loadConversationTools(); };
  const closeConversationTools = document.getElementById("close-conversation-tools"); if (closeConversationTools) closeConversationTools.onclick = () => { state.conversationTools = false; render(); };
  const titleForm = document.getElementById("manage-title-form"); if (titleForm) titleForm.onsubmit = async event => { event.preventDefault(); busy(true); try { await saveCollectiveTitle(document.getElementById("manage-title")?.value || ""); state.notice = "تم تحديث الاسم المشفّر"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const manageAvatar = document.getElementById("manage-avatar"); if (manageAvatar) manageAvatar.onchange = async event => { const file = event.target.files?.[0]; if (!file) return; busy(true); try { await saveCollectiveAvatar(file); state.notice = "تم تحديث الصورة المشفّرة"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const memberSearch = document.getElementById("manage-member-search"); if (memberSearch) memberSearch.oninput = async event => { const query = event.target.value; state.collectiveAdmin.search = query; state.collectiveAdmin.people = []; render(); if (query.trim().length < 2) return; try { const result = await api(`/api/native/people?q=${encodeURIComponent(query)}`); if (state.collectiveAdmin.search === query) { state.collectiveAdmin.people = result.people; render(); } } catch (error) { state.notice = messageFor(error.message); render(); } };
  document.querySelectorAll("[data-manage-add]").forEach(button => button.onclick = async () => { busy(true); try { await addCollectiveAdminMember(button.dataset.manageAdd, button.dataset.manageName); state.notice = "تمت إضافة العضو مع مفتاحه المغلف"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  document.querySelectorAll("[data-manage-role]").forEach(button => button.onclick = async () => { busy(true); try { await changeCollectiveAdminRole(button.dataset.manageRole, button.dataset.nextRole); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  document.querySelectorAll("[data-manage-remove]").forEach(button => button.onclick = async () => { busy(true); try { await removeCollectiveAdminMember(button.dataset.manageRemove); state.notice = "تم إخراج العضو من المساحة"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  const createInviteLink = document.getElementById("create-invite-link"); if (createInviteLink) createInviteLink.onclick = async () => { busy(true); try { await createCollectiveInviteLink(); state.notice = "تم إنشاء رابط دعوة يحتاج موافقة مدير لإضافة العضو"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const copyInviteLink = document.getElementById("copy-invite-link"); if (copyInviteLink) copyInviteLink.onclick = () => copyText(state.collectiveAdmin.newLink);
  document.querySelectorAll("[data-invite-revoke]").forEach(button => button.onclick = async () => { busy(true); try { await revokeCollectiveLink(button.dataset.inviteRevoke); state.notice = "تم إلغاء رابط الدعوة"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  document.querySelectorAll("[data-join-approve]").forEach(button => button.onclick = async () => { busy(true); try { await decideCollectiveJoinRequest(button.dataset.joinApprove, button.dataset.joinAccount, "approve"); state.notice = "تم قبول الطلب وتغليف مفتاح المساحة للعضو"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  document.querySelectorAll("[data-join-decline]").forEach(button => button.onclick = async () => { busy(true); try { await decideCollectiveJoinRequest(button.dataset.joinDecline, button.dataset.joinAccount, "decline"); state.notice = "تم رفض طلب الانضمام"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  const deleteLocalConversation = document.getElementById("delete-local-conversation"); if (deleteLocalConversation) deleteLocalConversation.onclick = async () => { if (typeof window.confirm === "function" && !window.confirm("حذف المفتاح والنسخة المحلية من هذا الجهاز فقط؟")) return; busy(true); try { await deleteConversationFromThisDevice(); state.notice = "تم حذف المحادثة من هذا الجهاز فقط."; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const blockPeer = document.getElementById("block-peer"); if (blockPeer) blockPeer.onclick = async () => { busy(true); try { await blockConversationPeer(); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  document.querySelectorAll("[data-report-peer]").forEach(button => button.onclick = async () => { busy(true); try { await reportConversationPeer(button.dataset.reportPeer); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
  const reaction = document.getElementById("reaction-button"); if (reaction) reaction.onclick = () => { state.reactionPicker = !state.reactionPicker; render(); };
  document.querySelectorAll("[data-reaction]").forEach(button => button.onclick = async () => { try { await sendReaction(button.dataset.reaction); state.reactionPicker = false; } catch (error) { state.notice = messageFor(error.message); render(); } });
  const sticker = document.getElementById("sticker-button"); if (sticker) sticker.onclick = () => { state.stickerPicker = !state.stickerPicker; render(); };
  document.querySelectorAll("[data-sticker-glyph]").forEach(button => button.onclick = async () => { try { await sendSticker(button.dataset.stickerGlyph, button.dataset.stickerLabel); state.stickerPicker = false; } catch (error) { state.notice = messageFor(error.message); render(); } });
  const attachmentInput = document.getElementById("attachment-file"); if (attachmentInput) { attachmentInput.onclick = () => { try { window.AlphaByteNative?.requestMediaPermission?.(); } catch { /* Browser preview uses the system file chooser. */ } }; attachmentInput.onchange = event => { setAttachmentDraft(event.target.files?.[0]); render(); }; }
  const cameraButton = document.getElementById("camera-button"); if (cameraButton) cameraButton.onclick = () => { try { window.AlphaByteNative?.requestCameraPermission?.(); } catch { /* Browser preview uses the system file chooser. */ } document.getElementById("camera-file")?.click(); };
  const cameraFile = document.getElementById("camera-file"); if (cameraFile) cameraFile.onchange = event => { setAttachmentDraft(event.target.files?.[0]); render(); };
  const removeAttachmentDraft = document.getElementById("remove-attachment-draft"); if (removeAttachmentDraft) removeAttachmentDraft.onclick = () => { clearAttachmentDraft(); render(); };
  const form = document.getElementById("message-form"); if (form) form.onsubmit = async event => { event.preventDefault(); const input = document.getElementById("message-text"); const attachment = state.attachmentDraft?.file || null; state.expiry = document.getElementById("expiry").value; if (!input.value.trim() && !attachment) return; busy(true); try { await sendEnvelope(input.value, attachment); clearAttachmentDraft(); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  const createCollectiveButton = document.getElementById("create-collective"); if (createCollectiveButton) createCollectiveButton.onclick = async () => { const title = document.getElementById("collective-title")?.value || ""; busy(true); try { await createCollective(state.collective.kind, title, state.collective.avatarFile); state.notice = "تم إنشاء المساحة المشفّرة"; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  document.querySelectorAll("[data-attachment-open]").forEach(button => button.onclick = async () => { try { await openAttachment(button.dataset.attachmentOpen, button.dataset.fileName, button.dataset.fileMime); } catch (error) { state.notice = messageFor(error.message); render(); } });
  const closeAttachmentPreview = document.getElementById("close-attachment-preview"); if (closeAttachmentPreview) closeAttachmentPreview.onclick = () => { state.attachmentPreview = null; render(); };
}

function bindPeopleButtons() { document.querySelectorAll("[data-person]").forEach(button => button.onclick = () => startConversation(button.dataset.person, button.dataset.personName)); }

function bindCollectiveButtons() {
  document.querySelectorAll("[data-collective-add]").forEach(button => button.onclick = () => { if (state.collective.members.some(member => member.accountId === button.dataset.collectiveAdd)) return; state.collective.members.push({ accountId: button.dataset.collectiveAdd, username: button.dataset.collectiveName, memberRole: "member" }); state.collectivePeople = state.collectivePeople.filter(person => person.accountId !== button.dataset.collectiveAdd); render(); });
  document.querySelectorAll("[data-collective-remove]").forEach(button => button.onclick = () => { state.collective.members = state.collective.members.filter(member => member.accountId !== button.dataset.collectiveRemove); render(); });
  document.querySelectorAll("[data-collective-role]").forEach(button => button.onclick = () => { const member = state.collective.members.find(item => item.accountId === button.dataset.collectiveRole); if (member) member.memberRole = member.memberRole === "admin" ? "member" : "admin"; render(); });
}

async function restoreSession() {
  if (!sessionToken()) return render();
  try { const legacyAccount = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null"); const data = await api("/api/native/session"); resetAccountState(); state.account = { username: data.username, accountId: data.accountId }; state.legacyIdentityMigrationAllowed = legacyAccount?.accountId === data.accountId; state.currentSessionId = data.sessionId; await registerDevice(); await Promise.all([loadGrants(), loadConversations(), loadMessageLockStatus()]); state.stage = state.messageLock.configured ? "message-lock" : "app"; if (state.stage === "app") openPendingInvite(pendingInviteFromNative()); }
  catch { resetAccountState(); localStorage.removeItem(TOKEN_KEY); clearNativeSession(); localStorage.removeItem(ACCOUNT_KEY); }
  render();
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("alpha-byte-invite", event => openPendingInvite(event.detail));
restoreSession();
