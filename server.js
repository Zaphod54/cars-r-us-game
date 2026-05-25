import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const host = "0.0.0.0";
const root = resolve("dist");

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

function filePathFor(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const requested = resolve(root, `.${cleanPath}`);

  if (!requested.startsWith(root)) {
    return null;
  }

  return requested;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    send(res, 200, "ok");
    return;
  }

  const requested = filePathFor(url.pathname);
  if (!requested) {
    send(res, 400, "Bad request");
    return;
  }

  let target = requested;
  if (!existsSync(target) || (await stat(target)).isDirectory()) {
    target = join(root, "index.html");
  }

  const extension = extname(target);
  res.writeHead(200, {
    "content-type": types[extension] || "application/octet-stream",
    "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  createReadStream(target).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Cars R Us is listening on ${host}:${port}`);
});
