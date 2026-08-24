package com.qarfash.abuser;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private static final String API = "https://abmessenger-miwecp5v.manus.space";
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private android.content.SharedPreferences prefs;
  private String activationCode = "";
  private String token = "";
  private String username = "";
  private String accountId = "";
  private LinearLayout content;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(8,8,8));
    prefs = getSharedPreferences("ab_user", MODE_PRIVATE);
    token = prefs.getString("token", "");
    if (token.isEmpty()) showActivation(); else restoreSession();
  }

  private LinearLayout screen() {
    ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(8,8,8));
    content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setGravity(Gravity.CENTER_HORIZONTAL); content.setPadding(dp(24), dp(36), dp(24), dp(28));
    scroll.addView(content, new ScrollView.LayoutParams(-1, -1)); setContentView(scroll); return content;
  }
  private TextView text(String value, int size, int color) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); v.setGravity(Gravity.CENTER); v.setPadding(0, dp(8), 0, dp(8)); return v; }
  private EditText input(String hint, boolean secret) { EditText e = new EditText(this); e.setHint(hint); e.setHintTextColor(Color.rgb(110,110,110)); e.setTextColor(Color.WHITE); e.setTextSize(15); e.setSingleLine(true); e.setPadding(dp(16), 0, dp(16), 0); e.setBackgroundColor(Color.rgb(22,22,22)); if (secret) e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD); add(e, -1, 52, 10); return e; }
  private Button button(String label) { Button b = new Button(this); b.setText(label); b.setTextColor(Color.BLACK); b.setTextSize(14); b.setAllCaps(false); b.setBackgroundColor(Color.rgb(245,245,245)); add(b, -1, 50, 12); return b; }
  private void add(View v, int w, int h, int top) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w == -1 ? -1 : dp(w), h == -1 ? -2 : dp(h)); p.topMargin = dp(top); content.addView(v, p); }
  private int dp(int value) { return (int)(value * getResources().getDisplayMetrics().density); }
  private void brand(String subtitle) { TextView logo = text("AB", 30, Color.WHITE); logo.setBackgroundColor(Color.rgb(24,24,24)); logo.setPadding(dp(18), dp(16), dp(18), dp(16)); add(logo, -2, -2, 12); add(text(subtitle, 14, Color.rgb(170,170,170)), -1, -2, 18); }

  private void showActivation() { screen(); brand("رمز التفعيل"); final EditText code = input("رمز التفعيل", true); Button next = button("متابعة"); next.setOnClickListener(v -> { activationCode = code.getText().toString(); post("/api/native/activate", new JSONObject(), activationCode, result -> { if (result.optBoolean("ok")) showAccess(); else message("الرمز غير صحيح"); }); }); }
  private void showAccess() { screen(); brand("دخول أو إنشاء حساب"); final EditText user = input("اسم المستخدم", false); final EditText secret = input("العبارة السرية", true); Button login = button("دخول"); Button register = button("إنشاء حساب"); login.setOnClickListener(v -> access("login", user.getText().toString(), secret.getText().toString())); register.setOnClickListener(v -> access("register", user.getText().toString(), secret.getText().toString())); }
  private void access(String action, String user, String secret) { try { JSONObject data = new JSONObject(); data.put("action", action); data.put("username", user); data.put("secret", secret); data.put("activationCode", activationCode); data.put("deviceLabel", "Android"); post("/api/native/access", data, "", result -> { if (!result.optBoolean("ok")) { message("تعذر الدخول أو إنشاء الحساب"); return; } token = result.optString("token"); username = result.optString("username"); accountId = result.optString("accountId"); prefs.edit().putString("token", token).apply(); showMain("المحادثات"); }); } catch (Exception ignored) { message("تعذر تجهيز الطلب"); } }
  private void restoreSession() { get("/api/native/session", result -> { if (!result.optBoolean("ok")) { prefs.edit().remove("token").apply(); token = ""; showActivation(); return; } username = result.optString("username"); accountId = result.optString("accountId"); showMain("المحادثات"); }); }
  private void showMain(String page) { screen(); TextView header = text("AB", 28, Color.WHITE); header.setGravity(Gravity.RIGHT); add(header, -1, -2, 0); TextView identity = text(username + "\n" + accountId, 12, Color.rgb(145,145,145)); identity.setGravity(Gravity.RIGHT); add(identity, -1, -2, 0); if (page.equals("المحادثات")) { add(text("لا توجد محادثات", 16, Color.rgb(180,180,180)), -1, -1, 100); } else if (page.equals("الأشخاص")) { add(text("لا توجد جهات أو طلبات", 16, Color.rgb(180,180,180)), -1, -1, 100); } else { settings(); }
    LinearLayout nav = new LinearLayout(this); nav.setGravity(Gravity.CENTER); String[] tabs = {"المحادثات", "الأشخاص", "الإعدادات"}; for (String tab : tabs) { Button b = new Button(this); b.setText(tab); b.setTextSize(11); b.setAllCaps(false); b.setTextColor(Color.WHITE); b.setBackgroundColor(Color.TRANSPARENT); b.setOnClickListener(v -> showMain(tab)); nav.addView(b, new LinearLayout.LayoutParams(0, dp(48), 1)); } add(nav, -1, 52, 20); }
  private void settings() { add(text("الإعدادات", 20, Color.WHITE), -1, -2, 28); Button privacy = button(prefs.getBoolean("receipts", true) ? "إيصالات القراءة: مفعلة" : "إيصالات القراءة: متوقفة"); privacy.setOnClickListener(v -> { boolean next = !prefs.getBoolean("receipts", true); prefs.edit().putBoolean("receipts", next).apply(); showMain("الإعدادات"); }); Button logout = button("تسجيل الخروج من هذا الجهاز"); logout.setOnClickListener(v -> { prefs.edit().clear().apply(); token = ""; activationCode = ""; showActivation(); }); }

  private void get(String path, Callback cb) { request("GET", path, null, cb); }
  private void post(String path, JSONObject data, String code, Callback cb) { try { if (!code.isEmpty()) data.put("activationCode", code); request("POST", path, data, cb); } catch (Exception e) { message("تعذر تجهيز الطلب"); } }
  private void request(String method, String path, JSONObject data, Callback cb) { io.execute(() -> { try { HttpURLConnection c = (HttpURLConnection)new URL(API + path).openConnection(); c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000); c.setRequestProperty("Content-Type", "application/json"); if (!token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token); if (data != null) { c.setDoOutput(true); try (OutputStream out = c.getOutputStream()) { out.write(data.toString().getBytes(StandardCharsets.UTF_8)); } } BufferedReader reader = new BufferedReader(new InputStreamReader(c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream())); StringBuilder raw = new StringBuilder(); String line; while ((line = reader.readLine()) != null) raw.append(line); JSONObject result = new JSONObject(raw.toString()); main.post(() -> cb.done(result)); } catch (Exception e) { main.post(() -> { message("تعذر الاتصال بالخادم"); cb.done(new JSONObject()); }); } }); }
  private void message(String value) { Toast.makeText(this, value, Toast.LENGTH_SHORT).show(); }
  private interface Callback { void done(JSONObject result); }
}
