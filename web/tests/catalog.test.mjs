import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { fixture, film, review, login, seedFile } from "./helpers.mjs";

const seed = JSON.parse(await readFile(seedFile, "utf8"));
test("C++ rankings apply score, count and id ordering and exclude unrated films", async (t) => {
  const records = [review(2, "U1", 4), ...[5, 8].flatMap((id) => ["U1", "U2", "U3"].map((viewerId) => review(id, viewerId, 4)))].map((r) => ({ ...r, content: 4 }));
  const { server } = await fixture(t, { contentEdition: 2, films: [1, 2, 5, 8].map((id) => film(id)), reviews: records });
  const catalog = (await server.request("catalog")).data;
  for (const metric of ["overall", "content", "image", "narration"]) {
    assert.deepEqual(catalog.rankings[metric].map(({ film }) => film.id), [5, 8, 2]);
  }
  assert.equal(catalog.films.find(({ id }) => id === 1).summary.average, null);
});

test("C++ compares unrounded averages and limits rankings to ten", async (t) => {
  const films = Array.from({ length: 12 }, (_, id) => film(id));
  const reviews = films.map(({ id }) => ({ ...review(id), content: 4, narration: 4 }));
  for (let id = 2; id < 104; ++id) reviews.push({ ...review(1, `U${id}`), content: 4, narration: 4 });
  for (let id = 2; id < 101; ++id) reviews.push({ ...review(2, `U${id}`), content: 4, narration: 4 });
  reviews.push({ ...review(2, "extra"), content: 4, narration: 5 });
  const { server } = await fixture(t, { contentEdition: 2, films, reviews });
  const rows = (await server.request("rankings")).data.rows;
  assert.equal(rows.length, 10);
  assert.equal(rows[0].film.id, 2);
  assert.equal(rows[0].average.toFixed(2), rows[1].average.toFixed(2));
  assert.ok(rows[0].average > rows[1].average);
});

test("C++ distribution validates cutoffs and includes boundaries and zero-count films", async (t) => {
  const reviews = [1, 3, 4, 5].map((score, id) => ({ ...review(1, `U${id}`), content: score, image: score, narration: score }));
  const { server } = await fixture(t, { contentEdition: 2, films: [film(1), film(2)], reviews });
  await login(server);
  const distribution = (await server.request("admin/distribution", "POST", { cutoffs: "3 4" })).data;
  assert.deepEqual(distribution.labels, ["[1, 3)", "[3, 4)", "[4, 5]"]);
  assert.deepEqual(distribution.rows.map(({ counts }) => counts), [[1, 1, 2], [0, 0, 0]]);
  for (const cutoffs of ["", "1 3", "3 5", "4 3", "3 3", "NaN", "abc"]) {
    assert.equal((await server.request("admin/distribution", "POST", { cutoffs })).status, 400);
  }
});

test("C++ searches title, category and admin ids", async (t) => {
  const { server } = await fixture(t, { contentEdition: 2, films: [film(1, "森林日记"), film(2, "Ocean"), { ...film(5, "森林茶事"), category: "美食" }], reviews: [] });
  assert.deepEqual((await server.request("search?query=森林")).data.filmIds, [1, 5]);
  assert.deepEqual((await server.request("search?query=森林&category=美食")).data.filmIds, [5]);
  assert.deepEqual((await server.request("search?query=oCEAN")).data.filmIds, [2]);
  assert.deepEqual((await server.request("search?query=5&scope=admin")).data.filmIds, [5]);
});

test("researched seed content has offline covers and no browser business calculations remain", async () => {
  assert.equal(seed.films.length, 18);
  for (const film of seed.films) {
    assert.ok(film.synopsis.length >= 150);
    assert.equal(film.highlights.length, 3);
    assert.ok(film.sources.every(({ url }) => new URL(url).protocol === "https:"));
    await access(new URL(`../public/posters/${film.posterId}.webp`, import.meta.url));
  }
  const browserLogic = await readFile(new URL("../src/catalog.js", import.meta.url), "utf8");
  assert.doesNotMatch(browserLogic, /function\s|\.reduce\(|\.sort\(|writeFile/);
  const gateway = await readFile(new URL("../scripts/catalog-api.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(gateway, /node:fs|saveCatalog|scoreReview|buildRanking/);
});
