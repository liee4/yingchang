import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { buildCore, projectRoot } from "./build-core.mjs";

export class CoreError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function startCore() {
  const binary = process.env.YINGCHANG_CORE_EXECUTABLE ? resolve(process.env.YINGCHANG_CORE_EXECUTABLE) : await buildCore();
  const dataDirectory = resolve(process.env.YINGCHANG_DATA_DIR || join(projectRoot, "data"));
  const child = spawn(binary, ["--stdio"], {
    cwd: projectRoot, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, YINGCHANG_DATA_DIR: dataDirectory,
      YINGCHANG_SEED_FILE: process.env.YINGCHANG_SEED_FILE || join(projectRoot, "resources/catalog-seed.json"),
      YINGCHANG_LEGACY_WEB_FILE: process.env.YINGCHANG_LEGACY_WEB_FILE || join(projectRoot, "web/data/catalog.json"),
      YINGCHANG_LEGACY_CPP_DIR: process.env.YINGCHANG_LEGACY_CPP_DIR || join(projectRoot, "cpp") },
  });
  let ready = false, stopped = false, stderr = "", sequence = 0, metadata;
  const pending = new Map();
  let readyResolve, readyReject;
  const readyPromise = new Promise((resolveReady, reject) => { readyResolve = resolveReady; readyReject = reject; });
  function fail(message) {
    stopped = true;
    const error = new CoreError(503, message);
    if (!ready) readyReject(error);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  }
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr = (stderr + text).slice(-12_000);
    console.error(text.trimEnd());
  });
  child.once("error", (error) => fail(`无法启动 C++ 核心：${error.message}`));
  child.once("exit", () => fail(ready ? "C++ 核心已停止，请重新启动系统；没有切换到独立数据。" : `C++ 核心启动失败：${stderr}`));
  child.stdin.on("error", (error) => fail(`C++ 通信中断：${error.message}`));
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let reply;
    try { reply = JSON.parse(line); } catch {
      fail("C++ 返回了无效的通信数据，请重启系统。"); child.kill(); return;
    }
    if (reply.event === "ready" && reply.engine === "cpp" && reply.protocol === 1) {
      ready = true;
      metadata = { ...reply, binary };
      readyResolve();
      return;
    }
    const item = pending.get(reply.id);
    if (!item) return;
    pending.delete(reply.id);
    clearTimeout(item.timer);
    if (reply.ok) item.resolve(reply.result);
    else item.reject(new CoreError(reply.status || 500, reply.error || "C++ 操作失败。"));
  });
  const startupTimer = setTimeout(() => { fail("C++ 核心启动超时。"); child.kill(); }, 20_000);
  try { await readyPromise; } finally { clearTimeout(startupTimer); }
  return {
    metadata,
    request(operation, params = {}) {
      if (stopped) return Promise.reject(new CoreError(503, "C++ 核心不可用，请重新启动系统。"));
      return new Promise((resolveRequest, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          fail("C++ 请求超时，请重启后核对保存结果，系统不会自动重试写入。");
          child.kill();
        }, 15_000);
        pending.set(id, { resolve: resolveRequest, reject, timer });
        child.stdin.write(JSON.stringify({ id, operation, params }) + "\n");
      });
    },
    async close() {
      if (stopped) return;
      const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 3_000);
      await exited;
      clearTimeout(timer);
    },
  };
}
