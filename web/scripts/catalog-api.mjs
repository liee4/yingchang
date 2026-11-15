import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initialReviews, sampleFilms, scoreFields } from "../src/catalog.js";

const defaultPath = fileURLToPath(new URL("../data/catalog.json", import.meta.url));
const database = resolve(process.env.DOCUMENTARY_WEB_DATA || defaultPath);
const cookieName = "documentary_session";
const sessions = new Map();
const sessionDuration = 8 * 60 * 60;
const reviewKey = ({ filmId, viewerId }) => JSON.stringify([filmId, viewerId]);
const sampleByKey = new Map(initialReviews.map((review) => [reviewKey(review), review]));

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadCatalog() {
  try {
    return JSON.parse(readFileSync(database, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { films: sampleFilms, reviews: initialReviews };
  }
}

let catalog = loadCatalog();

function saveCatalog(next) {
  mkdirSync(dirname(database), { recursive: true });
  const temporary = database + ".tmp";
  writeFileSync(temporary, JSON.stringify(next, null, 2), "utf8");
  renameSync(temporary, database);
  catalog = next;
}

function reply(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  }).end(JSON.stringify(payload));
}

async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new RequestError(415, "请发送 JSON 数据。");
  }
  let bytes = 0;
  const parts = [];
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 256_000) throw new RequestError(413, "请求内容过长。");
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new RequestError(400, "请求数据格式有误。");
  }
}

function readSession(request) {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expires <= now) sessions.delete(id);
  }
  const match = request.headers.cookie?.match(new RegExp(`(?:^|; )${cookieName}=([^;]+)`));
  const id = match?.[1];
  return { id, session: sessions.get(id) };
}

function setSession(response, admin, failures = 0) {
  const id = randomUUID();
  sessions.set(id, { admin, failures, expires: Date.now() + sessionDuration * 1000 });
  response.setHeader("Set-Cookie", `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDuration}`);
}

function clearSession(response) {
  response.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function readFilm(value, id) {
  if (!Number.isSafeInteger(id)) throw new RequestError(400, "片目编号必须为整数。");
  const readText = (field, limit) => {
    const text = value?.[field];
    if (typeof text !== "string" || text.trim().length > limit) {
      throw new RequestError(400, "片目文字资料无效或过长。");
    }
    return text.trim();
  };
  const title = readText("title", 120);
  if (!title) throw new RequestError(400, "片名不能为空。");
  if (!Number.isSafeInteger(value.episodes) || value.episodes <= 0) {
    throw new RequestError(400, "集数必须为正整数。");
  }
  return {
    id, title, category: readText("category", 50), director: readText("director", 120),
    crew: readText("crew", 200), episodes: value.episodes, synopsis: readText("synopsis", 1200),
  };
}

function readReview(value) {
  const { filmId, viewerId, comment } = value ?? {};
  if (!catalog.films.some(({ id }) => id === filmId)) {
    throw new RequestError(404, "找不到该片目。");
  }
  if (typeof viewerId !== "string" || !viewerId.trim() || viewerId.trim().length > 32
      || typeof comment !== "string" || comment.trim().length > 250) {
    throw new RequestError(400, "观众编号或短评格式有误。");
  }
  const review = { filmId, viewerId: viewerId.trim(), comment: comment.trim() };
  for (const { id } of scoreFields) {
    if (!Number.isInteger(value[id]) || value[id] < 1 || value[id] > 5) {
      throw new RequestError(400, "三项评分都须为 1 到 5 的整数。");
    }
    review[id] = value[id];
  }
  return review;
}

function sameReview(a, b) {
  return Boolean(a && b && a.comment === b.comment && scoreFields.every(({ id }) => a[id] === b[id]));
}

function importReviews(entries) {
  if (!Array.isArray(entries)) throw new RequestError(400, "旧评价格式有误。");
  const merged = new Map(catalog.reviews.map((review) => [reviewKey(review), review]));
  let changed = false;
  for (const entry of entries) {
    if (!catalog.films.some(({ id }) => id === entry?.filmId)) continue;
    const review = readReview(entry);
    const key = reviewKey(review);
    const sample = sampleByKey.get(key);
    const current = merged.get(key);
    // 只接收旧浏览器里的实际修改，现有网页评价优先。
    if (!sameReview(review, sample) && (!current || sameReview(current, sample))) {
      merged.set(key, review);
      changed = true;
    }
  }
  if (changed) saveCatalog({ ...catalog, reviews: [...merged.values()] });
}

function saveReview(entry) {
  const review = readReview(entry);
  const others = catalog.reviews.filter((item) => reviewKey(item) !== reviewKey(review));
  const replaced = others.length < catalog.reviews.length;
  saveCatalog({ ...catalog, reviews: [review, ...others] });
  return replaced;
}

function updateFilm(method, id, entry) {
  const position = catalog.films.findIndex((film) => film.id === id);
  if (method === "POST" && position >= 0) throw new RequestError(409, "该片目编号已存在。");
  if (method !== "POST" && position < 0) throw new RequestError(404, "找不到该片目。");
  if (method === "DELETE") {
    saveCatalog({
      films: catalog.films.filter((film) => film.id !== id),
      reviews: catalog.reviews.filter((review) => review.filmId !== id),
    });
    return;
  }
  const film = readFilm(entry, id);
  const films = [...catalog.films];
  if (method === "POST") films.push(film);
  else films[position] = { ...films[position], ...film };
  saveCatalog({ ...catalog, films });
}

export async function handleCatalogApi(request, response, path) {
  const method = request.method;
  try {
    const { id, session } = readSession(request);
    const admin = Boolean(session?.admin);
    if (method === "GET" && path === "/api/catalog") {
      return reply(response, 200, { ...catalog, admin });
    }
    if (method === "POST" && path === "/api/admin/login") {
      const { account, password } = await readJson(request) ?? {};
      sessions.delete(id);
      if (account === "admin" && password === "admin123") {
        setSession(response, true);
        return reply(response, 200, { admin: true });
      }
      const remaining = 2 - (session?.failures ?? 0);
      if (remaining === 0) clearSession(response);
      else setSession(response, admin, (session?.failures ?? 0) + 1);
      return reply(response, 401, { error: "账号或密码错误。", remaining });
    }
    if (method === "POST" && path === "/api/admin/logout") {
      sessions.delete(id);
      clearSession(response);
      return reply(response, 200, { admin: false });
    }
    if (method === "POST" && path === "/api/reviews") {
      const replaced = saveReview(await readJson(request));
      return reply(response, 200, { ...catalog, admin, replaced });
    }
    if (method === "POST" && path === "/api/reviews/import") {
      importReviews(await readJson(request));
      return reply(response, 200, { ...catalog, admin });
    }

    const filmPath = path.match(/^\/api\/admin\/films(?:\/(-?\d+))?$/);
    if (filmPath && ["POST", "PATCH", "DELETE"].includes(method)) {
      if (!admin) throw new RequestError(401, "请先登录管理员账号。");
      if ((method === "POST") === Boolean(filmPath[1])) throw new RequestError(404, "接口不存在。");
      const entry = method === "DELETE" ? null : await readJson(request);
      const filmId = method === "POST" ? entry?.id : Number(filmPath[1]);
      updateFilm(method, filmId, entry);
      return reply(response, 200, { ...catalog, admin });
    }
    throw new RequestError(404, "接口不存在。");
  } catch (error) {
    if (error instanceof RequestError) return reply(response, error.status, { error: error.message });
    console.error(error);
    return reply(response, 500, { error: "读写网页数据失败，请稍后重试。" });
  }
}
