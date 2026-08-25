import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(runtimeDirectory, "public");
const port = Number(process.env.PORT || 3000);
const activationCode = process.env.AB_ACTIVATION_CODE || "";
const activationSigningKey = process.env.JWT_SECRET || activationCode;
const activationLifetimeMs = 1000 * 60 * 60 * 24 * 30;
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

function firebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;

  const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getMessaging(app);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

function isInsidePublicDirectory(candidate) {
  return candidate === publicDirectory || candidate.startsWith(`${publicDirectory}${path.sep}`);
}

function resolveStaticFile(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  if (decodedPath.split("/").includes("..")) {
    return null;
  }
  const relativePath = decodedPath.replace(/^\/+/, "") || "index.html";
  const candidate = path.resolve(publicDirectory, relativePath);

  return isInsidePublicDirectory(candidate) ? candidate : null;
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type, X-Alpha-Activation-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function signActivationPayload(payload) {
  return createHmac("sha256", activationSigningKey).update(payload).digest("base64url");
}

function issueActivationToken() {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + activationLifetimeMs,
    nonce: randomBytes(16).toString("hex"),
  })).toString("base64url");
  return `${payload}.${signActivationPayload(payload)}`;
}

function isActivationTokenValid(token) {
  if (!activationSigningKey || typeof token !== "string") return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(signActivationPayload(payload));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.expiresAt === "number" && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function isActivationCodeValid(code) {
  if (!activationCode || typeof code !== "string") return false;
  const submitted = Buffer.from(code.trim());
  const expected = Buffer.from(activationCode);
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

async function handleActivationRequest(request, response, pathname) {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return true;
  }
  if (request.method !== "POST") {
    writeJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    return true;
  }
  if (pathname === "/api/activation/verify") {
    try {
      const body = await readJsonBody(request);
      if (!isActivationCodeValid(body?.code)) {
        writeJson(response, 403, { ok: false, error: "INVALID_ACTIVATION_CODE" });
        return true;
      }
      writeJson(response, 200, { ok: true, token: issueActivationToken() });
    } catch {
      writeJson(response, 400, { ok: false, error: "INVALID_REQUEST" });
    }
    return true;
  }
  if (pathname === "/api/activation/status") {
    const valid = isActivationTokenValid(request.headers["x-alpha-activation-token"]);
    writeJson(response, valid ? 200 : 401, { ok: valid });
    return true;
  }
  return false;
}

async function supabaseJson(pathname, accessToken) {
  if (!supabaseUrl || !supabasePublishableKey || !accessToken) return null;
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function handleNotificationRequest(request, response, pathname) {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return true;
  }
  if (pathname !== "/api/notifications/message") return false;
  if (request.method !== "POST") {
    writeJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    return true;
  }

  try {
    const accessToken = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
    const body = await readJsonBody(request);
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    const messaging = firebaseMessaging();
    if (!messaging) {
      writeJson(response, 503, { ok: false, error: "PUSH_UNAVAILABLE" });
      return true;
    }

    const [user, messages] = await Promise.all([
      supabaseJson("/auth/v1/user", accessToken),
      supabaseJson(`/rest/v1/messages?id=eq.${encodeURIComponent(messageId)}&select=conversation_id,sender_id`, accessToken),
    ]);
    const message = Array.isArray(messages) ? messages[0] : null;
    if (!user?.id || !message || message.sender_id !== user.id) {
      writeJson(response, 403, { ok: false, error: "NOT_ALLOWED" });
      return true;
    }

    const conversations = await supabaseJson(
      `/rest/v1/conversations?id=eq.${encodeURIComponent(message.conversation_id)}&select=user_a,user_b`,
      accessToken,
    );
    const conversation = Array.isArray(conversations) ? conversations[0] : null;
    const recipientId = conversation?.user_a === user.id ? conversation?.user_b : conversation?.user_a;
    if (!recipientId) {
      writeJson(response, 403, { ok: false, error: "NOT_ALLOWED" });
      return true;
    }

    const devices = await supabaseJson(
      `/rest/v1/devices?user_id=eq.${encodeURIComponent(recipientId)}&revoked=eq.false&fcm_token=not.is.null&select=fcm_token`,
      accessToken,
    );
    const tokens = [...new Set((Array.isArray(devices) ? devices : []).map((device) => device.fcm_token).filter(Boolean))];
    if (tokens.length) {
      await messaging.sendEachForMulticast({
        tokens,
        notification: { title: "Alpha Byte", body: "لديك رسالة جديدة" },
        data: { conversationId: message.conversation_id, messageId },
        android: { priority: "high", notification: { channelId: "alpha_byte_messages" } },
      });
    }
    writeJson(response, 200, { ok: true });
  } catch {
    writeJson(response, 500, { ok: false, error: "PUSH_DELIVERY_FAILED" });
  }
  return true;
}

async function sendFile(response, filePath, method) {
  const extension = path.extname(filePath).toLowerCase();
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  const body = method === "HEAD" ? undefined : await readFile(filePath);

  response.writeHead(200, {
    "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const method = request.method || "GET";
  const pathname = (request.url || "/").split("?", 1)[0] || "/";

  if (pathname.startsWith("/api/activation/")) {
    await handleActivationRequest(request, response, pathname);
    return;
  }
  if (pathname.startsWith("/api/notifications/")) {
    await handleNotificationRequest(request, response, pathname);
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  try {
    const staticFile = resolveStaticFile(pathname);

    if (!staticFile) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    try {
      const fileInfo = await stat(staticFile);
      if (fileInfo.isFile()) {
        await sendFile(response, staticFile, method);
        return;
      }
    } catch {
      // Client-side routes fall through to the application shell below.
    }

    if (path.extname(pathname)) {
      response.writeHead(404, { "X-Content-Type-Options": "nosniff" });
      response.end("Not found");
      return;
    }

    await sendFile(response, path.join(publicDirectory, "index.html"), method);
  } catch {
    response.writeHead(400, { "X-Content-Type-Options": "nosniff" });
    response.end("Bad request");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Alpha Byte static server listening on port ${port}`);
});
