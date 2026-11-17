import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = join(projectRoot, "cpp");
const sources = ["main.cpp", "documentary_catalog.cpp", "reviews.cpp", "record_codec.cpp", "data_store.cpp", "core_service.cpp"];
const headers = ["documentary_catalog.h", "reviews.h", "text_file.h", "record_codec.h", "data_store.h", "core_service.h", "accounts.h", "third_party/json.hpp"];

export async function buildCore() {
  const compiler = process.env.CXX || 'g++';
  const isMsvc = /^cl(?:\.exe)?$/i.test(basename(compiler));
  const files = await Promise.all([...sources, ...headers].map((file) => readFile(join(source, file))));
  const hash = createHash("sha256").update(`c++17-v1-${process.platform}-${compiler}`);
  for (const bytes of files) hash.update(bytes);
  const build = join(source, "build");
  const binary = join(build, `documentary-core-${hash.digest("hex").slice(0, 16)}${process.platform === "win32" ? ".exe" : ""}`);
  if (existsSync(binary)) return binary;
  await mkdir(build, { recursive: true });
  const stagedName = `building-${process.pid}-${basename(binary)}`;
  const input = sources.map((file) => join(source, file));
  const args = isMsvc
    ? ["/nologo", "/std:c++17", "/EHsc", "/utf-8", "/W4", ...input, `/Fe:${stagedName}`, "shell32.lib"]
    : ["-std=c++17", "-O0", "-Wall", "-Wextra", "-pedantic", "-finput-charset=UTF-8", "-fexec-charset=UTF-8", ...input, "-o", stagedName,
      ...(process.platform === "win32" ? ["-lshell32"] : [])];
  console.error("正在编译 C++ 核心，首次启动需要稍等……");
  await new Promise((resolve, reject) => {
    const child = spawn(compiler, args, { cwd: build, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("C++ 编译超时。")); }, 180_000);
    const collect = (bytes) => { output = (output + bytes.toString()).slice(-60_000); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => { clearTimeout(timer); reject(new Error(`无法启动 C++ 编译器 ${compiler}：${error.message}。请安装支持 C++17 的 g++ 或 MSVC，并将编译器加入 PATH，或设置 CXX 为编译器完整路径。`)); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) { if (output.trim()) console.error(output); resolve(); }
      else reject(new Error(`C++ 编译失败：\n${output}`));
    });
  });
  await rename(join(build, stagedName), binary);
  return binary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await buildCore());
}
