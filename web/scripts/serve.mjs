import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { checkExisting, openBrowser } from './startup.mjs';
import { createCatalogApi } from "./catalog-api.mjs";
import { startCore } from "./core-client.mjs";

const flags = process.argv.slice(2);
const port = Number(flags.includes("--port") ? flags[flags.indexOf("--port") + 1] : 4173);
const host = flags.includes("--host") ? flags[flags.indexOf("--host") + 1] : "127.0.0.1";
const previewBuild = flags.includes("--dist");
const root = new URL(previewBuild ? "../dist/client/" : "../", import.meta.url);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp",
};

let existing;
try { existing = await checkExisting(port, host); }
catch(error) { console.error(`无法启动映场：${error.message}`); process.exit(1); }
if (existing) { if(flags.includes('--open')) openBrowser(`http://${host}:${port}/`); process.exit(0); }
let core;
try { core = await startCore(); }
catch(error) { console.error(`无法启动映场：${error.message}`); process.exit(1); }
let handleCatalogApi;
try { handleCatalogApi = await createCatalogApi(core); }
catch (error) { await core.close(); throw error; }
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://preview");
  const path = url.pathname;
  if (path.startsWith("/api/")) return handleCatalogApi(request, response, url);
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
}).listen(port, host, function () {
  const address = `http://${host}:${this.address().port}/`;
  console.log(`纪录片放映周 · ${address}`);
  console.error(`C++ 核心 PID ${core.metadata.pid}；统一数据目录：${core.metadata.dataDirectory}`);
  if (flags.includes("--open")) {
    openBrowser(address);
  }
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  server.closeAllConnections();
  await core.close();
}
server.on("error", async (error) => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请换用其他端口。` : error.message); await shutdown(); process.exitCode = 1; });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
