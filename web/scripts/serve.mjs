import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { handleCatalogApi } from "./catalog-api.mjs";

const flags = process.argv.slice(2);
const port = Number(flags.includes("--port") ? flags[flags.indexOf("--port") + 1] : 4173);
const host = flags.includes("--host") ? flags[flags.indexOf("--host") + 1] : "127.0.0.1";
const previewBuild = flags.includes("--dist");
const root = new URL(previewBuild ? "../dist/client/" : "../", import.meta.url);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp",
};

createServer(async (request, response) => {
  const path = new URL(request.url, "http://preview").pathname;
  if (path.startsWith("/api/")) return handleCatalogApi(request, response, path);
  const file = path === "/" ? "index.html" : path.slice(1);
  if (!["GET", "HEAD"].includes(request.method)
      || !/^(index\.html|(?:src|icons|posters)\/[A-Za-z0-9.-]+)$/.test(file)) {
    response.writeHead(404).end();
    return;
  }
  const prefix = !previewBuild && /^(icons|posters)\//.test(file) ? "public/" : "";
  try {
    const body = await readFile(new URL(prefix + file, root));
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
  }
}).listen(port, host, () => console.log(`纪录片放映周 · http://${host}:${port}/`));
