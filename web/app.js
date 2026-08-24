(() => {
  const API = "https://abmessenger-miwecp5v.manus.space";
  const TOKEN_KEY = "ab.user.session";
  const app = document.getElementById("app");
  const state = { stage: "activation", view: "inbox", mode: "login", code: "", account: null, notice: "", dark: localStorage.getItem("ab.theme") !== "light", receipts: localStorage.getItem("ab.receipts") !== "off", sessions: null, currentSessionId: "" };
  const text = (value) => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" })[char]);
  const sessionToken = () => localStorage.getItem(TOKEN_KEY) || "";
  const messageFor = (code) => ({ ACTIVATION_REQUIRED:"الرمز غير صحيح", INVALID_ACCESS_INPUT:"أكمل البيانات بالشكل الصحيح", USERNAME_UNAVAILABLE:"اسم المستخدم غير متاح", INVALID_CREDENTIALS:"بيانات الدخول غير صحيحة", SESSION_REQUIRED:"انتهت جلسة هذا الجهاز" }[code] || "تعذر إتمام الطلب الآن");

  const sessionSection = () => {
    if (state.sessions === null) return '<p class="session-title">الجلسات والأجهزة</p><p class="muted">جارٍ التحقق من الأجهزة…</p>';
    if (state.sessions.length === 0) return '<p class="session-title">الجلسات والأجهزة</p><p class="muted">لا توجد جلسات ظاهرة.</p>';
    return `<p class="session-title">الجلسات والأجهزة</p>${state.sessions.map(session => `<div class="device"><span><strong>${text(session.deviceLabel || "جهاز غير مسمى")}${session.id === state.currentSessionId ? " · هذا الجهاز" : ""}</strong><small>${session.state === "active" ? "نشطة" : "ملغاة"}</small></span>${session.state === "active" ? `<button class="revoke" data-revoke="${text(session.id)}" type="button">إبطال</button>` : "<span>◌</span>"}</div>`).join("")}`;
  };

  async function loadSessions() {
    state.sessions = null;
    render();
    try { const data = await api("/api/native/sessions"); state.sessions = data.sessions; state.currentSessionId = data.currentSessionId; }
    catch (error) { state.sessions = []; state.notice = messageFor(error.message); }
    render();
  }

  async function api(path, method = "GET", body) {
    const headers = { "Content-Type": "application/json" };
    if (sessionToken()) headers.Authorization = `Bearer ${sessionToken()}`;
    const response = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({ ok: false, error: "NETWORK_ERROR" }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || "NETWORK_ERROR");
    return payload;
  }

  function setNotice(value) { state.notice = value; render(); }
  function mark() { return '<div class="mark" aria-label="AB">AB</div>'; }
  function render() {
    document.body.className = state.dark ? "" : "light";
    if (state.stage === "activation") return renderActivation();
    if (state.stage === "access") return renderAccess();
    renderApp();
  }

  function renderActivation() {
    app.innerHTML = `<section class="auth-shell"><div class="auth-card">${mark()}<h1 class="auth-title">رمز التفعيل</h1><p class="auth-copy">أدخل الرمز الذي يتيح هذا الجهاز</p><form class="form" id="activation-form"><label class="field">رمز التفعيل<input id="activation-code" type="password" autocomplete="one-time-code" autofocus required /></label><p class="notice">${text(state.notice)}</p><button class="primary" type="submit"><span>متابعة</span><span class="arrow">‹</span></button></form><p class="security">⌁ <span>يتحقق الخادم من الرمز قبل فتح الحسابات</span></p></div></section>`;
    document.getElementById("activation-form").addEventListener("submit", async event => {
      event.preventDefault(); state.notice = ""; const code = document.getElementById("activation-code").value.trim();
      if (!code) return setNotice("أدخل رمز التفعيل للمتابعة");
      try { await api("/api/native/activate", "POST", { activationCode: code }); state.code = code; state.stage = "access"; render(); }
      catch (error) { setNotice(messageFor(error.message)); }
    });
  }

  function renderAccess() {
    const login = state.mode === "login";
    app.innerHTML = `<section class="auth-shell"><div class="auth-card"><div class="access-head"><b>AB</b><span>مساحة خاصة</span></div><div class="switch"><button class="${login ? "selected" : ""}" id="login-tab" type="button">دخول</button><button class="${!login ? "selected" : ""}" id="register-tab" type="button">حساب جديد</button></div><form class="form" id="access-form"><label class="field">اسم المستخدم<input id="username" autocomplete="username" placeholder="username" required /></label><label class="field">العبارة السرية<input id="secret" type="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="12 حرفًا على الأقل" minlength="12" required /></label><p class="notice">${text(state.notice)}</p><button class="primary" type="submit"><span>${login ? "دخول" : "إنشاء الحساب"}</span><span class="arrow">‹</span></button></form><button class="link-button" id="change-code" type="button">تغيير رمز التفعيل</button><p class="security">⌁ <span>لا نطلب رقم هاتف أو بريد إلكتروني</span></p></div></section>`;
    document.getElementById("login-tab").onclick = () => { state.mode = "login"; state.notice = ""; render(); };
    document.getElementById("register-tab").onclick = () => { state.mode = "register"; state.notice = ""; render(); };
    document.getElementById("change-code").onclick = () => { state.stage = "activation"; state.notice = ""; render(); };
    document.getElementById("access-form").addEventListener("submit", async event => {
      event.preventDefault(); state.notice = ""; const username = document.getElementById("username").value.trim(); const secret = document.getElementById("secret").value;
      try { const data = await api("/api/native/access", "POST", { action: state.mode, username, secret, activationCode: state.code, deviceLabel: "AB User WebView" }); localStorage.setItem(TOKEN_KEY, data.token); state.account = { username: data.username, accountId: data.accountId }; state.stage = "app"; render(); }
      catch (error) { setNotice(messageFor(error.message)); }
    });
  }

  function renderApp() {
    const account = state.account || { username: "", accountId: "" };
    let content = "";
    if (state.view === "inbox") content = `<section class="inbox-title"><div><p class="eyebrow">${text(account.username)}</p><h1>AB</h1></div><button class="compose" type="button" aria-label="محادثة جديدة">＋</button></section><section class="empty"><div class="empty-ring">↗</div><p>لا توجد محادثات</p><small>ستظهر المحادثات هنا عند بدء تواصل آمن.</small></section>`;
    if (state.view === "people") content = `<section class="page"><div class="page-head"><span class="page-icon">◌</span><h2>الأشخاص</h2></div><section class="empty"><div class="empty-ring">＋</div><p>لا توجد جهات أو طلبات حالياً</p><small>ستظهر الجهات والطلبات عند توفر سجلات حية.</small></section></section>`;
    if (state.view === "settings") content = `<section class="page"><div class="page-head"><span class="page-icon">⚙</span><h2>الإعدادات</h2></div><div class="settings-card"><div class="setting"><span><strong>${text(account.username)}</strong><small>${text(account.accountId)}</small></span><i class="setting-icon">◉</i></div><button class="setting" id="theme-toggle"><span><strong>المظهر</strong><small>${state.dark ? "داكن" : "فاتح"}</small></span><i class="setting-icon">◐</i></button><button class="setting" id="receipt-toggle"><span><strong>إيصالات القراءة</strong><small>${state.receipts ? "مفعلة" : "متوقفة"}</small></span><i class="setting-icon">✓</i></button></div>${sessionSection()}<div class="settings-card"><button class="setting danger" id="logout"><span><strong>تسجيل الخروج</strong><small>إنهاء جلسة هذا الجهاز</small></span><i class="setting-icon">×</i></button></div></section>`;
    app.innerHTML = `<main class="app-shell"><header class="topbar">${mark().replace('class="mark"','class="mark mark-sm"')}<button class="icon-button" id="settings-button" type="button" aria-label="الإعدادات">⚙</button></header>${content}</main><nav class="nav"><button class="${state.view === "inbox" ? "current" : ""}" data-view="inbox"><i>↗</i><span>المحادثات</span></button><button class="${state.view === "people" ? "current" : ""}" data-view="people"><i>◌</i><span>الأشخاص</span></button><button class="${state.view === "settings" ? "current" : ""}" data-view="settings"><i>⚙</i><span>الإعدادات</span></button></nav>`;
    document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => { state.view = button.dataset.view; render(); if (state.view === "settings") loadSessions(); });
    document.getElementById("settings-button").onclick = () => { state.view = "settings"; render(); loadSessions(); };
    const theme = document.getElementById("theme-toggle"); if (theme) theme.onclick = () => { state.dark = !state.dark; localStorage.setItem("ab.theme", state.dark ? "dark" : "light"); render(); };
    const receipts = document.getElementById("receipt-toggle"); if (receipts) receipts.onclick = () => { state.receipts = !state.receipts; localStorage.setItem("ab.receipts", state.receipts ? "on" : "off"); render(); };
    const logout = document.getElementById("logout"); if (logout) logout.onclick = () => { localStorage.removeItem(TOKEN_KEY); state.stage = "activation"; state.account = null; state.code = ""; state.view = "inbox"; render(); };
    document.querySelectorAll("[data-revoke]").forEach(button => button.onclick = async () => { const sessionId = button.dataset.revoke; button.disabled = true; try { const result = await api(`/api/native/sessions/${sessionId}/revoke`, "POST"); if (result.currentSessionRevoked) { localStorage.removeItem(TOKEN_KEY); state.stage = "activation"; state.account = null; state.code = ""; render(); } else loadSessions(); } catch (error) { state.notice = messageFor(error.message); loadSessions(); } });
  }

  async function restoreSession() {
    if (!sessionToken()) return render();
    try { const data = await api("/api/native/session"); state.account = { username: data.username, accountId: data.accountId }; state.currentSessionId = data.sessionId; state.stage = "app"; }
    catch { localStorage.removeItem(TOKEN_KEY); }
    render();
  }
  restoreSession();
})();
