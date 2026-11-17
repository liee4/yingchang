import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const seedFile = fileURLToPath(new URL("../../resources/catalog-seed.json", import.meta.url));
const script = fileURLToPath(new URL("../scripts/serve.mjs", import.meta.url));
export const film = (id, title = "同名纪录片") => ({ id, title, category: "自然", director: "导演", crew: "主创", episodes: 1, synopsis: "简介" });
export const review = (filmId = 2, viewerId = "U1", narration = 3) => ({ filmId, viewerId, content: 5, image: 4, narration, comment: "评价" });
export const empty = () => ({ contentEdition: 2, films: [film(1), film(2), film(5), film(8)], reviews: [] });

export async function sandbox(t, initial) {
  const directory = await mkdtemp(join(tmpdir(), "yingchang-integrated-"));
  const dataDirectory = join(directory, "统一数据");
  const legacyDirectory = join(directory, "legacy");
  const legacyWeb = join(legacyDirectory, "catalog.json");
  await mkdir(legacyDirectory);
  if (initial !== undefined) await writeFile(legacyWeb, typeof initial === "string" ? initial : JSON.stringify(initial));
  const servers = [];
  t.after(async () => {
    for (const server of servers) await server.stop();
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  });
  const env = { ...process.env, YINGCHANG_DATA_DIR: dataDirectory, YINGCHANG_SEED_FILE: seedFile,
    YINGCHANG_LEGACY_WEB_FILE: legacyWeb, YINGCHANG_LEGACY_CPP_DIR: join(legacyDirectory, "cpp") };
  return {
    directory, dataDirectory, legacyWeb, env,
    async start(overrides = {}) {
      const child = spawn(process.execPath, [script, "--port", "0"], {
        env: { ...env, ...overrides }, cwd: directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      let logs = "";
      child.stderr.setEncoding("utf8").on("data", (text) => { logs = (logs + text).slice(-30_000); });
      const url = await new Promise((resolveReady, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error(`server startup timeout: ${logs}`)); }, 30_000);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${logs}`)); });
        child.stdout.setEncoding("utf8").on("data", (text) => {
          const match = text.match(/http:\/\/127\.0\.0\.1:\d+\//);
          if (match) { clearTimeout(timer); resolveReady(match[0]); }
        });
      });
      let stopped = false, corePid;
      function client() {
        let cookie = "";
        return {async request(path, method = "GET", body, extraHeaders = {}) {
          const headers = cookie ? { ...extraHeaders, Cookie: cookie } : { ...extraHeaders };
          if (body !== undefined) headers["Content-Type"] = "application/json";
          const response = await fetch(`${url}api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
          const setCookie = response.headers.get("set-cookie");
          if (setCookie) cookie = setCookie.split(";")[0];
          return { status: response.status, data: await response.json() };
        }};
      }
      const defaultClient = client();
      const server = {
        url, client,
        async stop() {
          if (stopped) return;
          stopped = true;
          if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit"); child.kill(); await exited;
          }
          // Windows may terminate Node immediately; the core then exits on pipe EOF.
          for (let attempt = 0; corePid && attempt < 80; attempt++) {
            try { process.kill(corePid, 0); } catch { return; }
            await new Promise((resolveWait) => setTimeout(resolveWait, 25));
          }
        },
        request: defaultClient.request,
      };
      servers.push(server);
      const health = await server.request("health");
      assert.equal(health.status, 200);
      corePid = health.data.pid;
      server.corePid = corePid;
      await server.request("auth/register", "POST", { account: "test_viewer", password: "viewer123", displayName: "测试观众" });
      assert.equal((await server.request("auth/login", "POST", { account: "test_viewer", password: "viewer123" })).status, 200);
      return server;
    },
  };
}

export async function login(server) {
  assert.equal((await server.request("admin/login", "POST", { account: "admin", password: "admin123" })).status, 200);
}

export async function fixture(t, initial = empty()) {
  const box = await sandbox(t, initial);
  return { ...box, server: await box.start() };
}
