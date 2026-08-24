import { cacheCiphertextMessages, createConversationKeyMaterial, decryptFile, decryptJson, encryptFile, encryptJson, fromB64, getCachedCiphertextMessages, getConversationKey, getDeviceIdentity, openConversationKey, sealConversationKey, storeConversationKey, toB64 } from "./alpha-crypto.js";

const API = "https://abmessenger-miwecp5v.manus.space";
const TOKEN_KEY = "alpha-byte.session";
const ACCOUNT_KEY = "alpha-byte.account";
const NAMES_KEY = "alpha-byte.conversation-names";
const app = document.getElementById("app");
const state = { stage: "activation", view: "inbox", mode: "login", code: "", account: null, device: null, notice: "", dark: localStorage.getItem("alpha-byte.theme") !== "light", receipts: localStorage.getItem("alpha-byte.receipts") !== "off", sessions: null, currentSessionId: "", conversations: [], activeConversation: null, messages: [], people: [], search: "", searching: false, grants: [], expiry: "week", busy: false, reactionPicker: false, stickerPicker: false };

const text = (value) => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" })[character]);
const sessionToken = () => localStorage.getItem(TOKEN_KEY) || "";
const accountNames = () => JSON.parse(localStorage.getItem(NAMES_KEY) || "{}");
const rememberName = (conversationId, name) => localStorage.setItem(NAMES_KEY, JSON.stringify({ ...accountNames(), [conversationId]: name }));
const bindNativeSession = token => { try { window.AlphaByteNative?.bindSession?.(token); } catch { /* Browser preview has no native bridge. */ } };
const clearNativeSession = () => { try { window.AlphaByteNative?.clearSession?.(); } catch { /* Browser preview has no native bridge. */ } };
const messageFor = (code) => ({ ACTIVATION_REQUIRED:"رمز التفعيل غير صحيح", INVALID_ACCESS_INPUT:"تحقق من بيانات الدخول", USERNAME_UNAVAILABLE:"اسم المستخدم غير متاح", INVALID_CREDENTIALS:"بيانات الدخول غير صحيحة", SESSION_REQUIRED:"انتهت جلسة هذا الجهاز", RECIPIENT_DEVICE_UNAVAILABLE:"هذا الحساب غير جاهز للمراسلة الآن؛ يجب أن يفتح Alpha Byte ويسجل جهازه أولًا.", FEATURE_APPROVAL_REQUIRED:"تحتاج موافقة المدير على هذا الامتياز.", CONVERSATION_ACCESS_REQUIRED:"لا تملك وصولًا إلى هذه المحادثة", DEVICE_ACCESS_REQUIRED:"تعذر التحقق من جهاز الإرسال؛ أعد تسجيل الدخول.", INVALID_CONVERSATION_INPUT:"تعذر إنشاء المحادثة. حاول مرة أخرى.", ATTACHMENT_UNAVAILABLE:"الملف غير متاح أو انتهت مدة الاحتفاظ به.", NETWORK_ERROR:"تعذر الاتصال بخادم Alpha Byte.", CRYPTO_UNAVAILABLE:"هذا الجهاز لا يدعم التشفير المطلوب" }[code] || "تعذر إتمام الطلب الآن");

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
const mark = () => '<div class="mark" aria-label="Alpha Byte">A<span>B</span></div>';
const busy = value => { state.busy = value; render(); };

async function registerDevice() {
  const identity = await getDeviceIdentity();
  await api("/api/native/device", "POST", { deviceId: identity.deviceId, deviceLabel: "Alpha Byte Android", identityPublicKey: toB64(new TextEncoder().encode(JSON.stringify(identity.publicJwk))) });
  state.device = identity;
}

async function loadGrants() { const data = await api("/api/native/features"); state.grants = data.grants; if (!isGranted("profile_theme")) localStorage.removeItem(profileThemeKey()); }
async function loadSessions() { state.sessions = null; render(); try { const data = await api("/api/native/sessions"); state.sessions = data.sessions; state.currentSessionId = data.currentSessionId; } catch (error) { state.sessions = []; state.notice = messageFor(error.message); } render(); }
async function loadConversations() { const data = await api("/api/native/conversations"); state.conversations = data.conversations; }

async function openConversation(conversation) {
  busy(true);
  try {
    let key = await getConversationKey(conversation.id);
    const result = await api(`/api/native/conversations/${conversation.id}/messages`);
    if (!key && result.encryptedConversationKey) { key = await openConversationKey(result.encryptedConversationKey, state.device); await storeConversationKey(conversation.id, key); }
    if (!key) throw new Error("CRYPTO_UNAVAILABLE");
    await cacheCiphertextMessages(conversation.id, result.messages);
    const cached = await getCachedCiphertextMessages(conversation.id);
    const envelopes = Array.from(new Map([...cached, ...result.messages].map(envelope => [envelope.id, envelope])).values());
    const messages = [];
    for (const envelope of envelopes) {
      try { messages.push({ ...envelope, clear: await decryptJson(key, envelope.encryptedPayload) }); } catch { messages.push({ ...envelope, clear: { kind: "unreadable" } }); }
    }
    state.activeConversation = { ...conversation, key };
    state.messages = messages;
    state.view = "conversation";
  } catch (error) { state.notice = messageFor(error.message); }
  state.busy = false; render();
}

function render() {
  document.body.className = [state.dark ? "" : "light", `profile-${profileTheme()}`].filter(Boolean).join(" ");
  if (state.stage === "activation") return renderActivation();
  if (state.stage === "access") return renderAccess();
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
  document.getElementById("access-form").addEventListener("submit", async event => { event.preventDefault(); const username = document.getElementById("username").value.trim(); const secret = document.getElementById("secret").value; busy(true); try { const data = await api("/api/native/access", "POST", { action: state.mode, username, secret, activationCode: state.code, deviceLabel: "Alpha Byte Android" }); localStorage.setItem(TOKEN_KEY, data.token); bindNativeSession(data.token); localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ username: data.username, accountId: data.accountId })); state.account = { username: data.username, accountId: data.accountId }; await registerDevice(); await Promise.all([loadGrants(), loadConversations()]); state.stage = "app"; state.notice = ""; } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); });
}

const sessionSection = () => {
  if (state.sessions === null) return '<p class="session-title">الأجهزة والجلسات</p><p class="muted">جارٍ التحقق…</p>';
  if (!state.sessions.length) return '<p class="session-title">الأجهزة والجلسات</p><p class="muted">لا توجد جلسات ظاهرة.</p>';
  return `<p class="session-title">الأجهزة والجلسات</p>${state.sessions.map(item => `<div class="device"><span><strong>${text(item.deviceLabel || "جهاز غير مسمى")}${item.id === state.currentSessionId ? " · هذا الجهاز" : ""}</strong><small>${item.state === "active" ? "نشطة" : "ملغاة"}</small></span>${item.state === "active" ? `<button class="revoke" data-revoke="${text(item.id)}" type="button">إبطال</button>` : "<span>◌</span>"}</div>`).join("")}`;
};

function featureTiles() { const catalog = [["verified_badge","شارة تحقق Alpha","تظهر بجانب اسمك"],["sticker_pack","ملصقات حصرية","حزمة رموز موسعة"],["profile_theme","مظهر حساب حصري","ألوان وهوية مميزة"]]; return `<div class="feature-grid">${catalog.map(([key,label,description]) => `<button class="feature-tile ${isGranted(key) ? "granted" : ""}" data-feature="${key}" type="button"><strong>${text(label)}</strong><small>${isGranted(key) ? "مفعلة" : `طلب موافقة · ${text(description)}`}</small></button>`).join("")}</div>`; }

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

function conversationList() { if (!state.conversations.length) return `<section class="empty"><div class="empty-ring">✦</div><p>ابدأ محادثة مشفّرة</p><small>ابحث عن شخص من تبويب الأشخاص.</small></section>`; return `<section class="conversation-list">${state.conversations.map(item => `<button class="conversation-row" data-conversation="${text(item.id)}"><span class="avatar">${text((accountNames()[item.id] || "A").slice(0,1).toUpperCase())}</span><span><strong>${text(accountNames()[item.id] || "محادثة خاصة")}</strong><small>محتوى مشفّر · حذف خادمي خلال أسبوع</small></span><i>‹</i></button>`).join("")}</section>`; }

function renderApp() {
  const account = state.account || { username: "", accountId: "" };
  let content = "";
  if (state.view === "inbox") content = `<section class="inbox-title"><div><p class="eyebrow">${text(account.username)}</p><h1>Alpha Byte</h1></div><button class="compose" id="open-people" type="button" aria-label="محادثة جديدة">＋</button></section>${conversationList()}`;
  if (state.view === "people") content = `<section class="page"><div class="page-head"><span class="page-icon">⌕</span><h2>الأشخاص</h2></div><label class="search-box"><input id="people-search" value="${text(state.search)}" placeholder="ابحث باسم المستخدم" autocomplete="off" /><span>⌕</span></label><div class="people-results">${peopleResults()}</div></section>`;
  if (state.view === "settings") content = `<section class="page"><div class="page-head"><span class="page-icon">⚙</span><h2>الإعدادات</h2></div><div class="settings-card"><div class="setting"><span><strong>${text(account.username)}${isGranted("verified_badge") ? ' <b class="verified-badge">✓ موثّق</b>' : ""}</strong><small>${text(account.accountId)}</small></span><i class="setting-icon">◉</i></div><button class="setting" id="theme-toggle"><span><strong>المظهر</strong><small>${state.dark ? "داكن" : "فاتح"}</small></span><i class="setting-icon">◐</i></button><button class="setting" id="receipt-toggle"><span><strong>إيصالات القراءة</strong><small>${state.receipts ? "مفعلة" : "متوقفة"}</small></span><i class="setting-icon">✓</i></button><div class="setting permission-note"><span><strong>الصور والملفات</strong><small>اختيار من منتقي النظام، والكاميرا تطلب الإذن عند استخدامها فقط.</small></span><i class="setting-icon">⌁</i></div></div><p class="session-title">امتيازات الحساب</p>${featureTiles()}${profileThemePicker()}${sessionSection()}<div class="settings-card"><button class="setting danger" id="logout"><span><strong>تسجيل الخروج</strong><small>إنهاء جلسة هذا الجهاز</small></span><i class="setting-icon">×</i></button></div></section>`;
  if (state.view === "conversation" && state.activeConversation) content = renderConversation();
  app.innerHTML = `<main class="app-shell"><header class="topbar">${mark().replace('class="mark"','class="mark mark-sm"')}<button class="icon-button" id="settings-button" type="button" aria-label="الإعدادات">⚙</button></header>${state.notice ? `<p class="app-notice" role="status">${text(state.notice)}</p>` : ""}${content}</main>${state.view !== "conversation" ? `<nav class="nav"><button class="${state.view === "inbox" ? "current" : ""}" data-view="inbox"><i>✦</i><span>المحادثات</span></button><button class="${state.view === "people" ? "current" : ""}" data-view="people"><i>⌕</i><span>الأشخاص</span></button><button class="${state.view === "settings" ? "current" : ""}" data-view="settings"><i>⚙</i><span>الإعدادات</span></button></nav>` : ""}`;
  bindApp();
}

function renderConversation() {
  const name = accountNames()[state.activeConversation.id] || "محادثة خاصة";
  const items = state.messages.map(message => { const clear = message.clear || {}; if (clear.kind === "reaction") return `<div class="reaction-event">${text(clear.emoji || "✦")} تفاعل مشفّر</div>`; if (clear.kind === "sticker") return `<div class="sticker-event"><b>${text(clear.glyph || "✦")}</b><span>${text(clear.label || "ALPHA")}</span></div>`; if (clear.kind === "attachment") return `<div class="message-bubble"><strong>ملف مشفّر</strong><small>${text(clear.name || "مرفق")}</small><button class="file-open" data-download="${text(clear.attachmentId || "")}" data-file-name="${text(clear.name || "alpha-byte-file")}" type="button">فتح بعد فك التشفير</button></div>`; if (clear.kind === "unreadable") return '<div class="reaction-event">تعذر فتح رسالة مشفّرة على هذا الجهاز.</div>'; return `<div class="message-bubble"><p>${text(clear.text || "")}</p><small>حذف الخادم: خلال أسبوع</small></div>`; }).join("") || '<section class="empty compact"><div class="empty-ring">✦</div><p>لا توجد رسائل بعد</p><small>ابدأ رسالة مشفّرة من جهازك.</small></section>';
  const reactions = ["👍", "❤️", "😂", "😮", "😢"];
  const stickers = [["✦", "ALPHA"], ["◈", "BYTE"], ["↗", "RISE"], ["∞", "PRIVATE"]];
  return `<section class="conversation-page"><div class="conversation-head"><button class="back-button" id="back-inbox" type="button">›</button><div><strong>${text(name)}</strong><small>تشفير محلي قبل الإرسال</small></div><button class="icon-button small" id="reaction-button" type="button">☺</button>${isGranted("sticker_pack") ? '<button class="icon-button small" id="sticker-button" type="button">✦</button>' : ""}</div>${state.reactionPicker ? `<div class="reaction-picker">${reactions.map(emoji => `<button type="button" data-reaction="${emoji}">${emoji}</button>`).join("")}</div>` : ""}${state.stickerPicker ? `<div class="sticker-picker">${stickers.map(([glyph, label]) => `<button type="button" data-sticker-glyph="${glyph}" data-sticker-label="${label}"><b>${glyph}</b><span>${label}</span></button>`).join("")}</div>` : ""}<div class="message-scroll">${items}</div><form class="composer" id="message-form"><input id="message-text" placeholder="رسالة مشفّرة" autocomplete="off" ${state.busy ? "disabled" : ""}/><select id="expiry" ${state.busy ? "disabled" : ""}><option value="day" ${state.expiry === "day" ? "selected" : ""}>يوم</option><option value="week" ${state.expiry === "week" ? "selected" : ""}>أسبوع</option><option value="month" ${state.expiry === "month" ? "selected" : ""}>شهر*</option></select><label class="attach ${state.busy ? "disabled" : ""}" title="اختيار ملف">＋<input id="attachment-file" type="file" hidden ${state.busy ? "disabled" : ""}/></label><button class="attach camera" id="camera-button" type="button" title="التقاط صورة" ${state.busy ? "disabled" : ""}>◉</button><input id="camera-file" type="file" accept="image/*" capture="environment" hidden ${state.busy ? "disabled" : ""}/><button class="send" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "جارٍ الإرسال…" : "↑"}</button></form><p class="retention-note">* تحتفظ الأجهزة بنسخها وفق اختيارها، لكن الخادم يحذف كل النسخ خلال أسبوع.</p></section>`;
}

async function startConversation(accountId, username) {
  if (!accountId || state.busy) return;
  state.notice = "جارٍ تجهيز محادثة مشفّرة…";
  busy(true);
  try {
    const recipient = await api(`/api/native/people/${accountId}/device`);
    const remotePublicJwk = JSON.parse(new TextDecoder().decode(fromB64(recipient.device.identityPublicKey)));
    const material = await createConversationKeyMaterial();
    const senderWrap = await sealConversationKey(material.raw, state.device, state.device.publicJwk);
    const recipientWrap = await sealConversationKey(material.raw, state.device, remotePublicJwk);
    const result = await api("/api/native/conversations", "POST", { recipientAccountId: accountId, senderEncryptedConversationKey: senderWrap, recipientEncryptedConversationKey: recipientWrap });
    await storeConversationKey(result.conversationId, material.key);
    rememberName(result.conversationId, username);
    await loadConversations();
    const conversation = state.conversations.find(item => item.id === result.conversationId) || { id: result.conversationId };
    state.notice = "";
    await openConversation(conversation);
  } catch (error) { state.notice = messageFor(error.message); state.busy = false; render(); }
}

async function sendEnvelope(value, attachmentFile) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const expiryMap = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000 };
  let payload = { kind: "text", text: value.trim() };
  const expiresAt = Date.now() + expiryMap[state.expiry];
  if (attachmentFile) {
    const cipher = await encryptFile(conversation.key, attachmentFile);
    const uploaded = await api("/api/native/attachments", "POST", cipher, { "Content-Type": "application/octet-stream", "x-alpha-message-id": messageId, "x-alpha-conversation-id": conversation.id, "x-alpha-retention-deadline": String(expiresAt) });
    payload = { kind: "attachment", name: attachmentFile.name, attachmentId: uploaded.attachmentId };
  }
  const encryptedPayload = await encryptJson(conversation.key, payload);
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: state.device.deviceId, encryptedPayload, encryptedHeader, expiresAt });
  await openConversation(conversation);
}

async function sendReaction(emoji) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const encryptedPayload = await encryptJson(conversation.key, { kind: "reaction", emoji });
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: state.device.deviceId, encryptedPayload, encryptedHeader, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  await openConversation(conversation);
}

async function sendSticker(glyph, label) {
  const conversation = state.activeConversation; if (!conversation?.key) return;
  const messageId = `Msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const encryptedPayload = await encryptJson(conversation.key, { kind: "sticker", glyph, label });
  const encryptedHeader = await encryptJson(conversation.key, { v: "ALPHA-LOCAL-1" });
  await api("/api/native/messages", "POST", { format: "AB-CIPHERTEXT-v1", messageId, conversationId: conversation.id, senderDeviceId: state.device.deviceId, encryptedPayload, encryptedHeader, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  await openConversation(conversation);
}

async function downloadAttachment(attachmentId, filename) {
  const conversation = state.activeConversation; if (!conversation?.key || !attachmentId) return;
  const response = await fetch(`${API}/api/native/attachments/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Bearer ${sessionToken()}` } });
  if (!response.ok) throw new Error("ATTACHMENT_UNAVAILABLE");
  const clear = await decryptFile(conversation.key, new Uint8Array(await response.arrayBuffer()));
  const objectUrl = URL.createObjectURL(new Blob([clear], { type: "application/octet-stream" }));
  const link = document.createElement("a"); link.href = objectUrl; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function bindApp() {
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = async () => { state.view = button.dataset.view; if (state.view === "settings") { render(); await Promise.all([loadSessions(), loadGrants()]); } else render(); });
  const settings = document.getElementById("settings-button"); if (settings) settings.onclick = async () => { state.view = "settings"; render(); await Promise.all([loadSessions(), loadGrants()]); };
  const openPeople = document.getElementById("open-people"); if (openPeople) openPeople.onclick = () => { state.view = "people"; render(); };
  document.querySelectorAll("[data-conversation]").forEach(button => button.onclick = () => openConversation(state.conversations.find(item => item.id === button.dataset.conversation)));
  const search = document.getElementById("people-search"); if (search) search.oninput = async event => { const query = event.target.value; state.search = query; state.people = []; state.searching = query.trim().length >= 2; const results = document.querySelector(".people-results"); if (results) results.innerHTML = peopleResults(); if (query.trim().length < 2) return; try { const data = await api(`/api/native/people?q=${encodeURIComponent(query)}`); if (state.search === query) { state.people = data.people; state.searching = false; const currentResults = document.querySelector(".people-results"); if (currentResults) { currentResults.innerHTML = peopleResults(); bindPeopleButtons(); } } } catch (error) { if (state.search === query) { state.searching = false; state.notice = messageFor(error.message); render(); } } };
  bindPeopleButtons();
  const theme = document.getElementById("theme-toggle"); if (theme) theme.onclick = () => { state.dark = !state.dark; localStorage.setItem("alpha-byte.theme", state.dark ? "dark" : "light"); render(); };
  document.querySelectorAll("[data-profile-theme]").forEach(button => button.onclick = () => { if (!isGranted("profile_theme")) return; localStorage.setItem(profileThemeKey(), button.dataset.profileTheme); render(); });
  const receipts = document.getElementById("receipt-toggle"); if (receipts) receipts.onclick = () => { state.receipts = !state.receipts; localStorage.setItem("alpha-byte.receipts", state.receipts ? "on" : "off"); render(); };
  const logout = document.getElementById("logout"); if (logout) logout.onclick = () => { localStorage.removeItem(TOKEN_KEY); clearNativeSession(); localStorage.removeItem(ACCOUNT_KEY); state.stage = "activation"; state.account = null; state.code = ""; state.view = "inbox"; render(); };
  document.querySelectorAll("[data-revoke]").forEach(button => button.onclick = async () => { try { const result = await api(`/api/native/sessions/${button.dataset.revoke}/revoke`, "POST"); if (result.currentSessionRevoked) { localStorage.removeItem(TOKEN_KEY); clearNativeSession(); state.stage = "activation"; state.account = null; render(); } else loadSessions(); } catch (error) { setNotice(messageFor(error.message)); } });
  document.querySelectorAll("[data-feature]").forEach(button => button.onclick = async () => { if (isGranted(button.dataset.feature)) return; try { await api("/api/native/feature-requests", "POST", { featureKey: button.dataset.feature }); state.notice = "أُرسل طلبك إلى المدير للمراجعة"; } catch (error) { state.notice = messageFor(error.message); } render(); });
  const back = document.getElementById("back-inbox"); if (back) back.onclick = () => { state.view = "inbox"; state.activeConversation = null; render(); };
  const reaction = document.getElementById("reaction-button"); if (reaction) reaction.onclick = () => { state.reactionPicker = !state.reactionPicker; render(); };
  document.querySelectorAll("[data-reaction]").forEach(button => button.onclick = async () => { try { await sendReaction(button.dataset.reaction); state.reactionPicker = false; } catch (error) { state.notice = messageFor(error.message); render(); } });
  const sticker = document.getElementById("sticker-button"); if (sticker) sticker.onclick = () => { state.stickerPicker = !state.stickerPicker; render(); };
  document.querySelectorAll("[data-sticker-glyph]").forEach(button => button.onclick = async () => { try { await sendSticker(button.dataset.stickerGlyph, button.dataset.stickerLabel); state.stickerPicker = false; } catch (error) { state.notice = messageFor(error.message); render(); } });
  const cameraButton = document.getElementById("camera-button"); if (cameraButton) cameraButton.onclick = () => { try { window.AlphaByteNative?.requestCameraPermission?.(); } catch { /* Browser preview uses the system file chooser. */ } document.getElementById("camera-file")?.click(); };
  const form = document.getElementById("message-form"); if (form) form.onsubmit = async event => { event.preventDefault(); const input = document.getElementById("message-text"); const attachment = document.getElementById("attachment-file")?.files?.[0] || document.getElementById("camera-file")?.files?.[0]; state.expiry = document.getElementById("expiry").value; if (!input.value.trim() && !attachment) return; busy(true); try { await sendEnvelope(input.value, attachment); } catch (error) { state.notice = messageFor(error.message); } state.busy = false; render(); };
  document.querySelectorAll("[data-download]").forEach(button => button.onclick = async () => { try { await downloadAttachment(button.dataset.download, button.dataset.fileName); } catch (error) { state.notice = messageFor(error.message); render(); } });
}

function bindPeopleButtons() { document.querySelectorAll("[data-person]").forEach(button => button.onclick = () => startConversation(button.dataset.person, button.dataset.personName)); }

async function restoreSession() {
  if (!sessionToken()) return render();
  try { const data = await api("/api/native/session"); state.account = { username: data.username, accountId: data.accountId }; state.currentSessionId = data.sessionId; await registerDevice(); await Promise.all([loadGrants(), loadConversations()]); state.stage = "app"; }
  catch { localStorage.removeItem(TOKEN_KEY); clearNativeSession(); localStorage.removeItem(ACCOUNT_KEY); }
  render();
}

restoreSession();
