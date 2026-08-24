package com.qarfash.abuser;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private static final String API = "https://abmessenger-miwecp5v.manus.space";
  private static final int BLACK = Color.rgb(5, 5, 5);
  private static final int SURFACE = Color.rgb(15, 15, 15);
  private static final int SURFACE_RAISED = Color.rgb(23, 23, 23);
  private static final int BORDER = Color.rgb(49, 49, 49);
  private static final int TEXT = Color.rgb(244, 244, 245);
  private static final int MUTED = Color.rgb(132, 132, 132);
  private static final int DANGER = Color.rgb(255, 148, 148);

  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private android.content.SharedPreferences prefs;
  private String activationCode = "";
  private String token = "";
  private String username = "";
  private String accountId = "";
  private LinearLayout content;
  private LinearLayout root;
  private String accessMode = "login";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    configureWindow();
    prefs = getSharedPreferences("ab_user", MODE_PRIVATE);
    token = prefs.getString("token", "");
    if (token.isEmpty()) showActivation(); else restoreSession();
  }

  private void configureWindow() {
    Window window = getWindow();
    window.setStatusBarColor(BLACK);
    window.setNavigationBarColor(BLACK);
    window.getDecorView().setSystemUiVisibility(0);
  }

  private void beginScreen(boolean withNavigation) {
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(BLACK);
    root.setPadding(dp(20), dp(8), dp(20), 0);

    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setClipToPadding(false);
    content = new LinearLayout(this);
    content.setOrientation(LinearLayout.VERTICAL);
    content.setPadding(0, dp(withNavigation ? 18 : 36), 0, dp(withNavigation ? 16 : 28));
    scroll.addView(content, new ScrollView.LayoutParams(-1, -1));
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

    if (withNavigation) addBottomNavigation();
    setContentView(root);
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }

  private GradientDrawable shape(int color, int radius, int strokeColor, int strokeWidth) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(color);
    drawable.setCornerRadius(dp(radius));
    if (strokeWidth > 0) drawable.setStroke(dp(strokeWidth), strokeColor);
    return drawable;
  }

  private TextView label(String value, int size, int color) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(color);
    view.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
    view.setTextDirection(View.TEXT_DIRECTION_RTL);
    view.setIncludeFontPadding(false);
    return view;
  }

  private void add(View view, int width, int height, int top) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width == -1 ? -1 : dp(width), height == -1 ? -2 : dp(height));
    params.topMargin = dp(top);
    content.addView(view, params);
  }

  private void addTo(LinearLayout parent, View view, int width, int height, int start) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width == -1 ? -1 : dp(width), height == -1 ? -2 : dp(height));
    params.setMarginStart(dp(start));
    parent.addView(view, params);
  }

  private TextView brandMark(int size) {
    TextView mark = new TextView(this);
    mark.setText("AB");
    mark.setTextColor(Color.WHITE);
    mark.setTextSize(size == 84 ? 30 : 17);
    mark.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    mark.setLetterSpacing(-0.08f);
    mark.setGravity(Gravity.CENTER);
    mark.setBackground(shape(SURFACE_RAISED, size == 84 ? 23 : 12, BORDER, 1));
    mark.setContentDescription("AB");
    return mark;
  }

  private void addCentered(View view, int width, int height, int top) {
    FrameLayout frame = new FrameLayout(this);
    frame.addView(view, new FrameLayout.LayoutParams(dp(width), dp(height), Gravity.CENTER));
    add(frame, -1, height, top);
  }

  private EditText input(String hint, boolean secret) {
    EditText field = new EditText(this);
    field.setSingleLine(true);
    field.setHint(hint);
    field.setHintTextColor(MUTED);
    field.setTextColor(TEXT);
    field.setTextSize(15);
    field.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
    field.setTextDirection(View.TEXT_DIRECTION_RTL);
    field.setPadding(dp(16), 0, dp(16), 0);
    field.setBackground(shape(SURFACE, 13, BORDER, 1));
    field.setInputType(secret ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT);
    field.setContentDescription(hint);
    add(field, -1, 54, 9);
    return field;
  }

  private Button primaryButton(String value) {
    Button button = new Button(this);
    button.setText(value + "     ‹");
    button.setAllCaps(false);
    button.setTextColor(BLACK);
    button.setTextSize(15);
    button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    button.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
    button.setPadding(dp(18), 0, dp(18), 0);
    button.setBackground(shape(Color.rgb(244, 244, 244), 13, Color.TRANSPARENT, 0));
    button.setContentDescription(value);
    add(button, -1, 54, 18);
    return button;
  }

  private Button ghostButton(String value) {
    Button button = new Button(this);
    button.setText(value);
    button.setAllCaps(false);
    button.setTextColor(Color.rgb(205, 205, 205));
    button.setTextSize(13);
    button.setBackground(shape(Color.TRANSPARENT, 12, BORDER, 1));
    return button;
  }

  private TextView inlineNotice() {
    TextView notice = label("", 12, DANGER);
    notice.setVisibility(View.GONE);
    add(notice, -1, -2, 12);
    return notice;
  }

  private void showActivation() {
    beginScreen(false);
    addCentered(brandMark(84), 84, 84, 44);

    TextView heading = label("رمز التفعيل", 21, TEXT);
    heading.setGravity(Gravity.CENTER);
    heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    add(heading, -1, -2, 34);

    TextView caption = label("أدخل الرمز الذي يتيح هذا الجهاز", 13, MUTED);
    caption.setGravity(Gravity.CENTER);
    add(caption, -1, -2, 10);

    TextView fieldLabel = label("رمز التفعيل", 13, Color.rgb(200, 200, 200));
    add(fieldLabel, -1, -2, 42);
    EditText code = input("", true);
    TextView notice = inlineNotice();
    Button next = primaryButton("متابعة");
    next.setOnClickListener(v -> {
      activationCode = code.getText().toString().trim();
      if (activationCode.isEmpty()) {
        notice.setText("أدخل رمز التفعيل للمتابعة");
        notice.setVisibility(View.VISIBLE);
        return;
      }
      next.setEnabled(false);
      next.setText("جارٍ التحقق…");
      post("/api/native/activate", new JSONObject(), activationCode, result -> {
        next.setEnabled(true);
        next.setText("متابعة     ‹");
        if (result.optBoolean("ok")) showAccess();
        else {
          notice.setText("تعذر التحقق من الرمز");
          notice.setVisibility(View.VISIBLE);
        }
      });
    });

    TextView security = label("⌁  يتحقق الخادم من الرمز قبل فتح الحسابات", 11, Color.rgb(112, 112, 112));
    security.setGravity(Gravity.CENTER);
    add(security, -1, -2, 18);
  }

  private void showAccess() {
    beginScreen(false);
    LinearLayout masthead = new LinearLayout(this);
    masthead.setGravity(Gravity.CENTER_VERTICAL);
    masthead.setOrientation(LinearLayout.HORIZONTAL);
    TextView title = label("AB", 27, TEXT);
    title.setTextDirection(View.TEXT_DIRECTION_LTR);
    title.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    masthead.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1));
    TextView status = label("جهاز جديد", 11, MUTED);
    status.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
    masthead.addView(status, new LinearLayout.LayoutParams(-2, dp(44)));
    add(masthead, -1, 44, 4);

    TextView heading = label(accessMode.equals("login") ? "مرحبًا بعودتك" : "إنشاء حساب", 26, TEXT);
    heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    add(heading, -1, -2, 46);
    TextView caption = label(accessMode.equals("login") ? "ادخل إلى مساحة AB الخاصة بك" : "اختر بيانات دخولك لهذا الجهاز", 13, MUTED);
    add(caption, -1, -2, 9);

    LinearLayout tabs = new LinearLayout(this);
    tabs.setGravity(Gravity.CENTER);
    Button loginTab = tabButton("دخول", accessMode.equals("login"));
    Button registerTab = tabButton("إنشاء حساب", accessMode.equals("register"));
    loginTab.setOnClickListener(v -> { accessMode = "login"; showAccess(); });
    registerTab.setOnClickListener(v -> { accessMode = "register"; showAccess(); });
    tabs.addView(loginTab, new LinearLayout.LayoutParams(0, dp(44), 1));
    tabs.addView(registerTab, new LinearLayout.LayoutParams(0, dp(44), 1));
    add(tabs, -1, 44, 36);

    TextView userLabel = label("اسم المستخدم", 13, Color.rgb(200, 200, 200));
    add(userLabel, -1, -2, 26);
    EditText user = input("اسم مستخدم", false);
    TextView secretLabel = label("العبارة السرية", 13, Color.rgb(200, 200, 200));
    add(secretLabel, -1, -2, 18);
    EditText secret = input("العبارة السرية", true);
    TextView notice = inlineNotice();
    Button action = primaryButton(accessMode.equals("login") ? "دخول" : "إنشاء حساب");
    action.setOnClickListener(v -> access(accessMode, user.getText().toString().trim(), secret.getText().toString(), action, notice));

    TextView privacy = label("لا نطلب رقم هاتف أو بريد إلكتروني", 11, Color.rgb(112, 112, 112));
    privacy.setGravity(Gravity.CENTER);
    add(privacy, -1, -2, 18);
  }

  private Button tabButton(String title, boolean selected) {
    Button button = new Button(this);
    button.setText(title);
    button.setAllCaps(false);
    button.setTextSize(13);
    button.setTextColor(selected ? TEXT : MUTED);
    button.setBackground(shape(selected ? SURFACE_RAISED : Color.TRANSPARENT, 10, selected ? BORDER : Color.TRANSPARENT, selected ? 1 : 0));
    return button;
  }

  private void access(String action, String user, String secret, Button button, TextView notice) {
    if (user.isEmpty() || secret.isEmpty()) {
      notice.setText("أكمل اسم المستخدم والعبارة السرية");
      notice.setVisibility(View.VISIBLE);
      return;
    }
    button.setEnabled(false);
    button.setText("جارٍ المتابعة…");
    try {
      JSONObject data = new JSONObject();
      data.put("action", action);
      data.put("username", user);
      data.put("secret", secret);
      data.put("activationCode", activationCode);
      data.put("deviceLabel", "AB Android");
      post("/api/native/access", data, "", result -> {
        button.setEnabled(true);
        button.setText(action.equals("login") ? "دخول     ‹" : "إنشاء حساب     ‹");
        if (!result.optBoolean("ok")) {
          notice.setText("تعذر الدخول أو إنشاء الحساب");
          notice.setVisibility(View.VISIBLE);
          return;
        }
        token = result.optString("token");
        username = result.optString("username");
        accountId = result.optString("accountId");
        prefs.edit().putString("token", token).apply();
        showMain("المحادثات");
      });
    } catch (Exception ignored) {
      notice.setText("تعذر تجهيز الطلب");
      notice.setVisibility(View.VISIBLE);
    }
  }

  private void restoreSession() {
    get("/api/native/session", result -> {
      if (!result.optBoolean("ok")) {
        prefs.edit().remove("token").apply();
        token = "";
        showActivation();
        return;
      }
      username = result.optString("username");
      accountId = result.optString("accountId");
      showMain("المحادثات");
    });
  }

  private void showMain(String page) {
    beginScreen(true);
    addAppHeader(page);
    if (page.equals("المحادثات")) inbox();
    else if (page.equals("الأشخاص")) people();
    else settings();
  }

  private void addAppHeader(String page) {
    LinearLayout header = new LinearLayout(this);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    TextView name = label("AB", 24, TEXT);
    name.setTextDirection(View.TEXT_DIRECTION_LTR);
    name.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    header.addView(name, new LinearLayout.LayoutParams(0, dp(42), 1));
    TextView avatar = label(username.isEmpty() ? "A" : username.substring(0, 1).toUpperCase(), 14, TEXT);
    avatar.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    avatar.setGravity(Gravity.CENTER);
    avatar.setTextDirection(View.TEXT_DIRECTION_LTR);
    avatar.setBackground(shape(SURFACE_RAISED, 20, BORDER, 1));
    header.addView(avatar, new LinearLayout.LayoutParams(dp(40), dp(40)));
    add(header, -1, 44, 0);

    TextView eyebrow = label(page.equals("المحادثات") ? "مساحتك الخاصة" : page, 12, MUTED);
    add(eyebrow, -1, -2, 34);
    TextView title = label(page, 31, TEXT);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    add(title, -1, -2, 4);
  }

  private void inbox() {
    LinearLayout empty = centeredBlock("⌁", "لا توجد محادثات", "ستظهر المحادثات هنا عند بدء تواصل آمن.");
    add(empty, -1, 300, 44);
  }

  private void people() {
    LinearLayout empty = centeredBlock("＋", "لا توجد جهات اتصال", "ستظهر الطلبات والجهات هنا عند إضافتها.");
    add(empty, -1, 300, 44);
  }

  private LinearLayout centeredBlock(String icon, String title, String caption) {
    LinearLayout block = new LinearLayout(this);
    block.setGravity(Gravity.CENTER);
    block.setOrientation(LinearLayout.VERTICAL);
    TextView ring = label(icon, 25, Color.rgb(166, 166, 166));
    ring.setGravity(Gravity.CENTER);
    ring.setTextDirection(View.TEXT_DIRECTION_LTR);
    ring.setBackground(shape(Color.TRANSPARENT, 33, BORDER, 1));
    LinearLayout.LayoutParams ringParams = new LinearLayout.LayoutParams(dp(66), dp(66));
    ringParams.gravity = Gravity.CENTER_HORIZONTAL;
    block.addView(ring, ringParams);
    TextView heading = label(title, 16, Color.rgb(215, 215, 215));
    heading.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
    headingParams.topMargin = dp(17);
    block.addView(heading, headingParams);
    TextView text = label(caption, 12, MUTED);
    text.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(-1, -2);
    textParams.topMargin = dp(8);
    block.addView(text, textParams);
    return block;
  }

  private void settings() {
    TextView account = label(username + "  ·  " + accountId, 12, MUTED);
    add(account, -1, -2, 15);
    add(settingsCard(), -1, -2, 28);

    TextView deviceLabel = label("الجهاز", 13, Color.rgb(188, 188, 188));
    add(deviceLabel, -1, -2, 28);
    LinearLayout device = new LinearLayout(this);
    device.setOrientation(LinearLayout.VERTICAL);
    device.setPadding(dp(16), dp(15), dp(16), dp(15));
    device.setBackground(shape(SURFACE, 15, BORDER, 1));
    TextView deviceName = label("هذا الجهاز", 14, TEXT);
    device.addView(deviceName, new LinearLayout.LayoutParams(-1, -2));
    TextView deviceSub = label("جلسة محمية ومتصلة بالحساب", 11, MUTED);
    LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(-1, -2);
    subParams.topMargin = dp(5);
    device.addView(deviceSub, subParams);
    add(device, -1, -2, 9);
  }

  private LinearLayout settingsCard() {
    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setBackground(shape(SURFACE, 18, BORDER, 1));
    card.addView(settingRow("إيصالات القراءة", prefs.getBoolean("receipts", true) ? "مفعلة" : "متوقفة", v -> {
      prefs.edit().putBoolean("receipts", !prefs.getBoolean("receipts", true)).apply();
      showMain("الإعدادات");
    }, false));
    card.addView(settingRow("الخصوصية", "إدارة تفضيلات الحساب", v -> message("إعدادات الخصوصية متاحة من الحساب"), false));
    card.addView(settingRow("تسجيل الخروج", "إنهاء جلسة هذا الجهاز", v -> {
      prefs.edit().clear().apply();
      token = "";
      activationCode = "";
      showActivation();
    }, true));
    return card;
  }

  private View settingRow(String title, String subtitle, View.OnClickListener listener, boolean danger) {
    LinearLayout row = new LinearLayout(this);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setPadding(dp(16), dp(13), dp(16), dp(13));
    row.setBackgroundColor(Color.TRANSPARENT);
    row.setOnClickListener(listener);
    LinearLayout words = new LinearLayout(this);
    words.setOrientation(LinearLayout.VERTICAL);
    TextView heading = label(title, 14, danger ? DANGER : Color.rgb(220, 220, 220));
    words.addView(heading, new LinearLayout.LayoutParams(-1, -2));
    TextView caption = label(subtitle, 11, danger ? Color.rgb(160, 100, 100) : MUTED);
    LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(-1, -2);
    captionParams.topMargin = dp(4);
    words.addView(caption, captionParams);
    row.addView(words, new LinearLayout.LayoutParams(0, dp(54), 1));
    TextView arrow = label("‹", 24, danger ? DANGER : MUTED);
    arrow.setGravity(Gravity.CENTER);
    arrow.setTextDirection(View.TEXT_DIRECTION_LTR);
    row.addView(arrow, new LinearLayout.LayoutParams(dp(28), dp(54)));
    return row;
  }

  private void addBottomNavigation() {
    LinearLayout nav = new LinearLayout(this);
    nav.setGravity(Gravity.CENTER);
    nav.setPadding(0, dp(9), 0, dp(10));
    nav.setBackground(shape(Color.rgb(9, 9, 9), 0, Color.rgb(31, 31, 31), 1));
    nav.addView(navButton("◌", "المحادثات", v -> showMain("المحادثات")), new LinearLayout.LayoutParams(0, dp(54), 1));
    nav.addView(navButton("＋", "الأشخاص", v -> showMain("الأشخاص")), new LinearLayout.LayoutParams(0, dp(54), 1));
    nav.addView(navButton("⚙", "الإعدادات", v -> showMain("الإعدادات")), new LinearLayout.LayoutParams(0, dp(54), 1));
    root.addView(nav, new LinearLayout.LayoutParams(-1, dp(74)));
  }

  private LinearLayout navButton(String icon, String title, View.OnClickListener listener) {
    LinearLayout button = new LinearLayout(this);
    button.setOrientation(LinearLayout.VERTICAL);
    button.setGravity(Gravity.CENTER);
    button.setOnClickListener(listener);
    TextView iconView = label(icon, 18, Color.rgb(214, 214, 214));
    iconView.setGravity(Gravity.CENTER);
    iconView.setTextDirection(View.TEXT_DIRECTION_LTR);
    button.addView(iconView, new LinearLayout.LayoutParams(-1, dp(27)));
    TextView titleView = label(title, 10, MUTED);
    titleView.setGravity(Gravity.CENTER);
    button.addView(titleView, new LinearLayout.LayoutParams(-1, dp(19)));
    return button;
  }

  private void get(String path, Callback callback) { request("GET", path, null, callback); }

  private void post(String path, JSONObject data, String code, Callback callback) {
    try {
      if (!code.isEmpty()) data.put("activationCode", code);
      request("POST", path, data, callback);
    } catch (Exception ignored) {
      message("تعذر تجهيز الطلب");
    }
  }

  private void request(String method, String path, JSONObject data, Callback callback) {
    io.execute(() -> {
      try {
        HttpURLConnection connection = (HttpURLConnection) new URL(API + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Content-Type", "application/json");
        if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (data != null) {
          connection.setDoOutput(true);
          try (OutputStream output = connection.getOutputStream()) {
            output.write(data.toString().getBytes(StandardCharsets.UTF_8));
          }
        }
        BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getResponseCode() < 400 ? connection.getInputStream() : connection.getErrorStream()));
        StringBuilder raw = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) raw.append(line);
        main.post(() -> callback.done(new JSONObject(raw.toString())));
      } catch (Exception ignored) {
        main.post(() -> {
          message("تعذر الاتصال بالخادم");
          callback.done(new JSONObject());
        });
      }
    });
  }

  private void message(String value) { Toast.makeText(this, value, Toast.LENGTH_SHORT).show(); }
  private interface Callback { void done(JSONObject result); }
}
