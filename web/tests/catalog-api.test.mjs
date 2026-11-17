import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { sandbox, fixture, film, review, empty, login, seedFile } from "./helpers.mjs";

const seed = JSON.parse(await readFile(seedFile, "utf8"));
const readRecords = async (box, file) => (await readFile(join(box.dataDirectory, file), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
const opinion = ({ overallScore, viewerName, own, ...value }) => value;

test("HTTP review and rescore are calculated and persisted by C++", async (t) => {
  const box = await fixture(t);
  const { server } = box;
  let result = await server.request("reviews", "POST", { ...review(), overallScore: 999 });
  assert.equal(result.status, 200);
  assert.equal(result.data.backend, "cpp");
  assert.equal(result.data.replaced, false);
  assert.equal(result.data.rankings.overall[0].average, 4.25);
  assert.equal(result.data.reviews[0].overallScore, 4.25);
  await server.request("reviews", "POST", review(5));
  result = await server.request("reviews", "POST", review(2, " \t　U1　\t ", 5));
  assert.equal(result.data.replaced, true);
  assert.equal(result.data.reviews.length, 2);
  assert.equal(result.data.rankings.overall[0].average, 4.75);
  const before = await readFile(join(box.dataDirectory, "reviews.txt"), "utf8");
  for (const score of [0, 6, 2.5, "5", null]) {
    assert.equal((await server.request("reviews", "POST", { ...review(), content: score })).status, 400);
  }
  assert.equal((await server.request("reviews", "POST", review(99))).status, 404);
  assert.equal(await readFile(join(box.dataDirectory, "reviews.txt"), "utf8"), before);
  assert.equal((await server.request("catalog")).data.films.find(({ id }) => id === 2).summary.count, 1);
});

test("Node authorization blocks core writes and ends the third failed login", async (t) => {
  const { server } = await fixture(t);
  assert.equal((await server.request("admin/films", "POST", film(99))).status, 403);
  assert.equal((await server.request("admin/distribution", "POST", { cutoffs: "3 4" })).status, 403);
  for (const remaining of [2, 1, 0]) {
    const result = await server.request("admin/login", "POST", { account: "admin", password: "wrong" });
    assert.equal(result.status, 401); assert.equal(result.data.remaining, remaining);
  }
  await login(server);
  assert.equal((await server.request("catalog")).data.admin, true);
  await server.request("admin/logout", "POST");
  assert.equal((await server.request("admin/films/2", "DELETE")).status, 401);
});

test("C++ film maintenance, cascade delete and restart use the same two files", async (t) => {
  const box = await fixture(t); const { server } = box;
  await login(server);
  assert.equal((await server.request("admin/films", "POST", film(99))).status, 200);
  assert.equal((await server.request("admin/films", "POST", film(99))).status, 409);
  for (const invalid of [{ ...film(100), title: " " }, { ...film(100), episodes: 0 }, film(2 ** 31)]) {
    assert.equal((await server.request("admin/films", "POST", invalid)).status, 400);
  }
  assert.equal((await server.request("admin/films/100", "PATCH", film(100))).status, 404);
  await server.request("reviews", "POST", review(2));
  await server.request("reviews", "POST", review(5));
  const renamed = await server.request("admin/films/2", "PATCH", { title: "更名" });
  assert.equal(renamed.data.reviews.length, 2);
  assert.equal(renamed.data.rankings.overall.find(({ film }) => film.id === 2).film.title, "更名");
  const deleted = await server.request("admin/films/2", "DELETE");
  assert.deepEqual(deleted.data.reviews.map(({ filmId }) => filmId), [5]);
  await server.stop();
  // A stale/invalid legacy JSON must never become an active database again.
  await writeFile(box.legacyWeb, "invalid legacy file, deliberately ignored");
  const restarted = await box.start();
  await login(restarted);
  const restored = (await restarted.request("catalog")).data;
  assert.deepEqual(restored.films, deleted.data.films);
  assert.deepEqual(restored.reviews, deleted.data.reviews);
  assert.equal(restored.admin, true);
  assert.equal((await readRecords(box, "documentaries.txt")).length, 4);
  assert.equal((await readRecords(box, "reviews.txt")).length, 1);
});

test("C++ failed staging writes preserve both files and in-memory state", async (t) => {
  const box = await fixture(t, { ...empty(), reviews: [review()] });
  const { server } = box;
  const beforeFilms = await readFile(join(box.dataDirectory, "documentaries.txt"), "utf8");
  const beforeReviews = await readFile(join(box.dataDirectory, "reviews.txt"), "utf8");
  await mkdir(join(box.dataDirectory, "reviews.txt.tmp"));
  assert.equal((await server.request("reviews", "POST", review(2, "U1", 5))).status, 500);
  await login(server);
  assert.equal((await server.request("admin/films/2", "DELETE")).status, 500);
  assert.equal(await readFile(join(box.dataDirectory, "documentaries.txt"), "utf8"), beforeFilms);
  assert.equal(await readFile(join(box.dataDirectory, "reviews.txt"), "utf8"), beforeReviews);
  const result = await server.request("catalog");
  assert.equal(result.data.reviews[0].narration, 3);
  assert.equal(result.data.films.length, 4);
});

test("migration rejects corrupt or inconsistent sources without overwriting them", async (t) => {
  const badValues = ["{bad json", "null", { films: {}, reviews: [] },
    { films: [film(1), film(1)], reviews: [] },
    { films: [{ ...film(1), title: " " }], reviews: [] },
    { films: [film(1)], reviews: [{ ...review(1), content: 6 }] },
    { films: [film(1)], reviews: [review(99)] },
    { films: [film(1)], reviews: [review(1), review(1, " U1 ")] }];
  for (const invalid of badValues) {
    const box = await sandbox(t, invalid);
    const before = await readFile(box.legacyWeb, "utf8");
    await assert.rejects(box.start(), /校验失败|片目|评价|数据须/);
    assert.equal(await readFile(box.legacyWeb, "utf8"), before);
    await assert.rejects(access(join(box.dataDirectory, "documentaries.txt")));
  }
});

test("default catalogue retains rich metadata through C++ edits and restart", async (t) => {
  const box = await sandbox(t); const server = await box.start();
  const current = (await server.request("catalog")).data;
  assert.equal(current.films.length, 18);
  assert.ok(current.films.every((film) => film.sources?.length && film.highlights?.length));
  assert.ok(current.reviews.every((review) => review.isSample));
  await login(server);
  const original = current.films.find(({ id }) => id === 107);
  const edited = await server.request("admin/films/107", "PATCH", { synopsis: original.synopsis + "\n补充笔记。" });
  assert.equal(edited.status, 200);
  const updated = edited.data.films.find(({ id }) => id === 107);
  assert.deepEqual(updated.sources, original.sources);
  assert.deepEqual(updated.chapters, original.chapters);
  await server.request("reviews", "POST", { ...current.reviews[0], comment: "实际提交的新评价" });
  assert.ok(!(await server.request("catalog")).data.reviews.find(({ comment }) => comment === "实际提交的新评价").isSample);
  await server.request("admin/films/101", "DELETE");
  await server.stop();
  const restarted = await box.start();
  const restored = (await restarted.request("catalog")).data;
  assert.equal(restored.films.length, 17);
  assert.ok(!restored.films.some(({ id }) => id === 101));
  assert.deepEqual(restored.films.find(({ id }) => id === 107), updated);
});

test("migration backs up old data, preserves ids and avoids custom-id collisions", async (t) => {
  const customFilm = { ...film(101), title: "用户自建片目" };
  const customReview = { ...seed.legacyReviews[0], comment: "用户保留的短评" };
  const box = await fixture(t, { films: [...seed.legacyFilms, customFilm], reviews: [customReview] });
  await login(box.server);
  const upgraded = (await box.server.request("catalog")).data;
  assert.equal(upgraded.films.find(({ id }) => id === 101).title, customFilm.title);
  assert.equal(upgraded.films.find(({ id }) => id === customReview.filmId).isDemoFilm, true);
  assert.deepEqual(opinion(upgraded.reviews.find(({ viewerId }) => viewerId === customReview.viewerId)), customReview);
  assert.ok(!upgraded.reviews.some(({ filmId }) => filmId === 101));
  const backups = await readdir(join(box.dataDirectory, "backups"));
  const archived = JSON.parse(await readFile(join(box.dataDirectory, "backups", backups[0], "web-catalog.json"), "utf8"));
  assert.equal(archived.reviews[0].comment, customReview.comment);
  await assert.rejects(access(box.legacyWeb));
});

test("legacy browser import is handled atomically by C++ with original associations", async (t) => {
  const { server } = await fixture(t, { contentEdition: 2, films: seed.films, reviews: [] });
  await login(server);
  const imported = await server.request("reviews/import", "POST", [{ ...seed.legacyReviews[0], comment: "浏览器保存的实际修改" }]);
  assert.equal(imported.status, 200);
  assert.equal(imported.data.reviews[0].filmId, 1);
  assert.equal(imported.data.films.find(({ id }) => id === 1).title, seed.legacyFilms[0].title);
  const bad = await server.request("reviews/import", "POST", [{ ...seed.legacyReviews[1], content: 6 }]);
  assert.equal(bad.status, 400);
  assert.deepEqual((await server.request("catalog")).data.reviews, imported.data.reviews);
});

test("C++ validates extended metadata and safe source links", async (t) => {
  const { server } = await fixture(t); await login(server);
  for (const fields of [{ sources: [{ label: "坏链接", url: "javascript:alert(1)" }] }, { highlights: "invalid" }, { chapters: [null] }, { year: 2.5 }, { styles: ["无效风格"] }]) {
    assert.equal((await server.request("admin/films", "POST", { ...film(99), ...fields })).status, 400);
  }
});

test("parallel HTTP requests correlate correctly and do not lose reviews", async (t) => {
  const { server } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 30 }, async (_, id) => {
    const client = server.client();
    assert.equal((await client.request("auth/register", "POST", { account: `audience_${id}`, password: "viewer123", displayName: `观众${id}` })).status, 200);
    assert.equal((await client.request("auth/login", "POST", { account: `audience_${id}`, password: "viewer123" })).status, 200);
    return client.request("reviews", "POST", review(2, `U${id}`));
  }));
  assert.ok(results.every(({ status }) => status === 200));
  const result = (await server.request("catalog")).data;
  assert.equal(result.reviews.length, 30);
  assert.equal(result.films.find(({ id }) => id === 2).summary.average, 4.25);
});

test("a second core cannot write the same data directory", async (t) => {
  const box = await fixture(t);
  await assert.rejects(box.start(), /独占数据目录/);
  assert.equal((await box.server.request("catalog")).status, 200);
});

test("core failure returns 503 instead of using a JavaScript fallback", async (t) => {
  const { server } = await fixture(t);
  process.kill(server.corePid);
  for (let i = 0; i < 20; i++) {
    const result = await server.request("catalog");
    if (result.status === 503) { assert.match(result.data.error, /C\+\+/); return; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("server continued serving data after C++ exited");
});
