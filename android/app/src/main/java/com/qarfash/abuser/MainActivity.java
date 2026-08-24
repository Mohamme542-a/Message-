package com.qarfash.abuser;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Alpha Byte renders its locally bundled interface through Capacitor. The APK
 * contains the web assets; no external page is opened as the app shell.
 */
public class MainActivity extends BridgeActivity {
    private static final String PREFS = "alpha_byte_integrity";
    private static final String SESSION_TOKEN = "session_token";
    private static final String INTEGRITY_FAILURE_URL = "https://abmessenger-miwecp5v.manus.space/api/native/integrity/failure";
    private static final int CAMERA_PERMISSION_REQUEST = 141;
    private static final int MEDIA_PERMISSION_REQUEST = 142;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        if (!isExpectedReleaseSignature()) {
            revokeServerSession();
            clearRememberedSession();
            Toast.makeText(this, "تعذر التحقق من سلامة Alpha Byte", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new IntegrityBridge(), "AlphaByteNative");
    }

    private boolean isExpectedReleaseSignature() {
        String expected = BuildConfig.ALPHA_RELEASE_CERT_SHA256;
        if (expected == null || expected.isEmpty()) return BuildConfig.DEBUG;
        try {
            PackageInfo packageInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                for (android.content.pm.Signature signature : packageInfo.signingInfo.getApkContentsSigners()) {
                    if (expected.equalsIgnoreCase(sha256(signature.toByteArray()))) return true;
                }
            } else {
                packageInfo = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
                for (android.content.pm.Signature signature : packageInfo.signatures) {
                    if (expected.equalsIgnoreCase(sha256(signature.toByteArray()))) return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    private String sha256(byte[] value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
        StringBuilder output = new StringBuilder();
        for (byte item : digest) output.append(String.format("%02x", item));
        return output.toString();
    }

    private void clearRememberedSession() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(SESSION_TOKEN).apply();
    }

    private void revokeServerSession() {
        final String token = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SESSION_TOKEN, "");
        if (token == null || token.isEmpty()) return;
        new Thread(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(INTEGRITY_FAILURE_URL).openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                connection.setConnectTimeout(4000);
                connection.setReadTimeout(4000);
                connection.getResponseCode();
                connection.disconnect();
            } catch (Exception ignored) { }
        }).start();
    }

    public class IntegrityBridge {
        @JavascriptInterface
        public void bindSession(String token) {
            if (token != null && token.length() >= 24) getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SESSION_TOKEN, token).apply();
        }

        @JavascriptInterface
        public void clearSession() {
            clearRememberedSession();
        }

        @JavascriptInterface
        public void requestCameraPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
                }
            });
        }

        @JavascriptInterface
        public void requestMediaPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES}, MEDIA_PERMISSION_REQUEST);
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, MEDIA_PERMISSION_REQUEST);
                }
            });
        }
    }
}
