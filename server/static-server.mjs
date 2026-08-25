import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(runtimeDirectory, "public");
const port = Number(process.env.PORT || 3000);

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

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  try {
    const pathname = (request.url || "/").split("?", 1)[0] || "/";
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
