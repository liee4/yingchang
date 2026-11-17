import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { buildCore } from "../scripts/build-core.mjs";
import { sandbox, fixture, film, review, empty } from "./helpers.mjs";

const binary = await buildCore();
test("stdio uses JSON lines only and survives malformed requests", async (t) => {
  const box = await sandbox(t, empty());
  const input = [JSON.stringify({ id: 1, operation: "ping" }), "bad-json",
    JSON.stringify({ id: 2, operation: "unknown" }),
    JSON.stringify({ id: 3, operation: "review.submit", params: { review: review() } }),
    JSON.stringify({ id: 4, operation: "catalog" })].join("\n") + "\n";
  const result = spawnSync(binary, ["--stdio"], { env: box.env, input, encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(output[0].event, "ready");
  assert.equal(output[1].id, 1);
  assert.equal(output[2].status, 400);
  assert.equal(output[3].status, 404);
  assert.equal(output[4].result.reviews[0].overallScore, 4.25);
  assert.equal(output[5].result.rankings.overall[0].average, 4.25);
});

test("terminal debug mode is blocked while the web core owns the directory", async (t) => {
  const box = await fixture(t);
  const result = spawnSync(binary, [], { env: box.env, input: "0\n", encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /独占数据目录/);
  assert.equal((await box.server.request("catalog")).status, 200);
});

test("restart completes a transaction interrupted after the first replacement", async (t) => {
  const box = await fixture(t, { ...empty(), reviews: [review(2), review(5)] });
  await box.server.stop();
  const films = (await readFile(join(box.dataDirectory, "documentaries.txt"), "utf8")).trim().split("\n").map(JSON.parse);
  const reviews = (await readFile(join(box.dataDirectory, "reviews.txt"), "utf8")).trim().split("\n").map(JSON.parse);
  const lines = (rows) => rows.map((row) => JSON.stringify(row) + "\n").join("");
  await writeFile(join(box.dataDirectory, "documentaries.txt.tmp"), lines(films.filter(({ id }) => id !== 2)));
  await writeFile(join(box.dataDirectory, "reviews.txt.tmp"), lines(reviews.filter(({ filmId }) => filmId !== 2)));
  await writeFile(join(box.dataDirectory, "transaction.pending"), "YINGCHANG_TRANSACTION_V1\n");
  await rename(join(box.dataDirectory, "documentaries.txt.tmp"), join(box.dataDirectory, "documentaries.txt"));
  const restarted = await box.start();
  const result = (await restarted.request("catalog")).data;
  assert.ok(!result.films.some(({ id }) => id === 2));
  assert.deepEqual(result.reviews.map(({ filmId }) => filmId), [5]);
  await assert.rejects(access(join(box.dataDirectory, "transaction.pending")));
});

test("corrupt unified files stop startup without reverting to old JSON", async (t) => {
  const box = await fixture(t);
  await box.server.stop();
  const file = join(box.dataDirectory, "reviews.txt");
  await writeFile(file, "damaged\n");
  await assert.rejects(box.start(), /格式有误/);
  assert.equal(await readFile(file, "utf8"), "damaged\n");
});

test("old terminal text records migrate with their original ids", async (t) => {
  const box = await sandbox(t);
  await mkdir(box.env.YINGCHANG_LEGACY_CPP_DIR);
  await writeFile(join(box.env.YINGCHANG_LEGACY_CPP_DIR, "documentaries.txt"), '77 2 "旧版影片" "自然" "导演" "主创" "旧介绍"\n');
  await writeFile(join(box.env.YINGCHANG_LEGACY_CPP_DIR, "reviews.txt"), '77 5 4 3 " U1 " "保留短评"\n');
  const server = await box.start();
  const result = (await server.request("catalog")).data;
  assert.equal(result.films.length, 1);
  assert.equal(result.films[0].id, 77);
  assert.equal(result.reviews[0].viewerId, undefined);
  assert.equal(result.reviews[0].overallScore, 4.25);
  const saved = await readFile(join(box.dataDirectory, "reviews.txt"), "utf8");
  assert.equal(JSON.parse(saved.trim()).viewerId, "U1");
});

test("conflicting old terminal and web ids are rejected without renumbering", async (t) => {
  const box = await sandbox(t, { films: [film(77, "网页影片")], reviews: [] });
  await mkdir(box.env.YINGCHANG_LEGACY_CPP_DIR);
  const original = '77 1 "终端里的另一部影片" "自然" "导演" "主创" "简介"\n';
  await writeFile(join(box.env.YINGCHANG_LEGACY_CPP_DIR, "documentaries.txt"), original);
  await assert.rejects(box.start(), /片号冲突/);
  assert.equal(await readFile(join(box.env.YINGCHANG_LEGACY_CPP_DIR, "documentaries.txt"), "utf8"), original);
  await access(box.legacyWeb);
});
