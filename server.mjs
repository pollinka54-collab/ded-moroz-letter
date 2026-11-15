import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME_BY_EXTENSION = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".pdf", "application/pdf"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"],
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function json(res, status, payload) {
  res.writeHead(status, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    json(res, 400, { error: "Некорректный адрес." });
    return;
  }

  const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(PUBLIC_DIR, `.${normalized}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    json(res, 403, { error: "Доступ запрещён." });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders,
      "Cache-Control": "no-cache",
      "Content-Length": body.length,
      "Content-Type": MIME_BY_EXTENSION.get(path.extname(filePath)) || "application/octet-stream",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    json(res, 404, { error: "Страница не найдена." });
  }
}

export function createApp() {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url, "http://localhost");

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      json(res, 200, {
        status: "ok",
        service: "ded-moroz-letter",
        mode: "browser-only-personalisation",
        storesPersonalData: false,
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
      return;
    }

    json(res, 405, { error: "Метод не поддерживается." });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 4173);
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`Ded Moroz Letter: http://localhost:${port}`);
  });
}
