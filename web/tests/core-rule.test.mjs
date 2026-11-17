import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { projectRoot } from "../scripts/build-core.mjs";
import { sandbox, empty, review } from "./helpers.mjs";

test("changing only the C++ weight changes HTTP scores and the displayed formula", async (t) => {
  const box = await sandbox(t, empty());
  const source = join(projectRoot, "cpp");
  const original = await readFile(join(source, "reviews.cpp"), "utf8");
  assert.ok(original.includes("constexpr int contentScoreWeight = 2;"));
  const changed = join(box.directory, "reviews-alternate.cpp");
  await writeFile(changed, original.replace("constexpr int contentScoreWeight = 2;", "constexpr int contentScoreWeight = 3;"));
  const executable = join(box.directory, process.platform === "win32" ? "alternate-core.exe" : "alternate-core");
  const compiler = process.env.CXX || "g++";
  const files = ["main.cpp", "documentary_catalog.cpp", "record_codec.cpp", "data_store.cpp", "core_service.cpp"].map((file) => join(source, file));
  const args = /^cl(?:\.exe)?$/i.test(basename(compiler))
    ? ["/nologo", "/std:c++17", "/EHsc", "/utf-8", `/I${source}`, ...files, changed, `/Fe:${executable}`, "shell32.lib"]
    : ["-std=c++17", "-O0", "-finput-charset=UTF-8", "-fexec-charset=UTF-8", "-I", source,
      ...files, changed, "-o", executable, ...(process.platform === "win32" ? ["-lshell32"] : [])];
  await new Promise((resolve, reject) => {
    const child = spawn(compiler, args, { cwd: box.directory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("alternate core build timeout")); }, 180000);
    child.stdout.on("data", (bytes) => { output += bytes; });
    child.stderr.on("data", (bytes) => { output += bytes; });
    child.once("error", reject);
    child.once("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(output)); });
  });
  const server = await box.start({ YINGCHANG_CORE_EXECUTABLE: executable });
  const result = await server.request("reviews", "POST", review());
  assert.equal(result.status, 200);
  assert.equal(result.data.reviews[0].overallScore, 4.4);
  assert.equal(result.data.rankings.overall[0].average, 4.4);
  assert.match(result.data.scoreFormula, /3 × 内容分.*÷ 5/);
});
