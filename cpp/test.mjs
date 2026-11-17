import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildCore } from "../web/scripts/build-core.mjs";

const source = fileURLToPath(new URL("./", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "yingchang-cpp-test-"));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: source, encoding: "utf8", timeout: 120_000, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

try {
  const flags = ["-std=c++17", "-Wall", "-Wextra", "-pedantic", "-finput-charset=UTF-8", "-fexec-charset=UTF-8"];
  const files = ["tests.cpp", "documentary_catalog.cpp", "reviews.cpp", "record_codec.cpp"].map((name) => join(source, name));
  const tests = join(temporary, "tests.exe");
  const compiler = process.env.CXX || "g++";
  const args = /^cl(?:\.exe)?$/i.test(basename(compiler))
    ? ["/nologo", "/std:c++17", "/EHsc", "/utf-8", ...files, `/Fe:${tests}`]
    : [...flags, ...files, "-o", tests];
  run(compiler, args, { cwd: temporary });
  console.log(run(tests, [join(temporary, "records")]));
  const program = await buildCore();
  const data = join(temporary, "cli");
  mkdirSync(data);
  const seed = join(temporary, "seed.json");
  writeFileSync(seed, JSON.stringify({ films: [], reviews: [] }));
  const env = { ...process.env, YINGCHANG_DATA_DIR: data, YINGCHANG_SEED_FILE: seed,
    YINGCHANG_LEGACY_WEB_FILE: join(temporary, "missing.json"), YINGCHANG_LEGACY_CPP_DIR: join(temporary, "missing") };
  const input = ["1", "admin", "admin123", "1", "1", "测试片", "自然", "导演", "主创", "1", "简介", "0",
    "2", "2", "1", "U1", "5", "4", "3", "旧评价", "2", "1", " U1 ", "5", "4", "5", "新评价", "3", "0", "0", ""];
  const output = run(program, [], { cwd: data, env, input: input.join("\n") });
  assert.match(output, /4\.75/);
  const saved = readFileSync(join(data, "reviews.txt"), "utf8");
  for (const badScore of ["0", "6", "2.5", "abc"]) {
    run(program, [], { cwd: data, env, input: `2\n2\n1\nU1\n${badScore}\n0\n0\n` });
    assert.equal(readFileSync(join(data, "reviews.txt"), "utf8"), saved);
  }
  assert.match(run(program, [], { cwd: data, env, input: "2\n3\n0\n0\n" }), /4\.75/);
  const login = run(program, [], { cwd: data, env, input: "1\nadmin\nbad\nadmin\nbad\nadmin\nbad\n0\n" });
  assert.match(login, /已连续输错 3 次，返回首页/);
  assert.doesNotMatch(login, /管理员菜单/);
  writeFileSync(join(data, "reviews.txt"), saved + "damaged\n");
  const damaged = spawnSync(program, [], { cwd: data, env, encoding: "utf8", input: "0\n", timeout: 5_000 });
  assert.equal(damaged.status, 1);
  assert.match(damaged.stderr, /第 2 行/);
  assert.equal(readFileSync(join(data, "reviews.txt"), "utf8"), saved + "damaged\n");
  console.log("PASS CLI login, integer validation, rescore, restart and corrupt-file protection");
} finally {
  // Only remove the directory returned by mkdtemp, outside the user's data directories.
  assert.equal(resolve(dirname(temporary)), resolve(tmpdir()));
  rmSync(temporary, { recursive: true, force: true });
}
