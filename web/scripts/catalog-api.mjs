import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { CoreError } from "./core-client.mjs";

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function reply(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  }).end(JSON.stringify(payload));
}

async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new RequestError(415, "请发送 JSON 数据。");
  let bytes = 0;
  const parts = [];
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 256_000) throw new RequestError(413, "请求内容过长。");
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new RequestError(400, "请求数据格式有误。"); }
}

// Node owns HTTP transport and authentication only. No catalogue state or business file writes.
const deriveKey = promisify(scrypt);
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const publicUser = (user) => user && ({
  account: user.account, displayName: user.displayName, role: user.role,
});

function visibleReview({ viewerId, viewerName, ...review }, user) {
  return {
    ...review, own: viewerId === user.viewerId,
    ...(user.role === "admin" ? { viewerId } : { viewerName }),
  };
}
async function credential(account, password, displayName, role) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new RequestError(400, "密码须为 8–128 个字符。");
  const salt = randomBytes(16).toString("hex");
  return { account, displayName, role, salt, passwordHash: (await deriveKey(password, salt, 64)).toString("hex"), viewerId: `V${randomBytes(12).toString("hex")}` };
}
export async function createCatalogApi(core) {
  if (!(await core.request("account.status")).initialized) {
    await core.request("account.bootstrap", { user: await credential("admin", "admin123", "映场管理员", "admin") });
  }
  const sessions = new Map();
  const cookieName = "documentary_session";
  const sessionDuration = 8 * 60 * 60;
  function readSession(request) {
    const now = Date.now();
    for (const [id, session] of sessions) if (session.expires <= now) sessions.delete(id);
    const id = request.headers.cookie?.match(new RegExp(`(?:^|; )${cookieName}=([^;]+)`))?.[1];
    return { id, session: sessions.get(id) };
  }
  function setSession(response, user, failures = 0) {
    const id = randomUUID();
    sessions.set(id, { user, failures, expires: Date.now() + sessionDuration * 1000 });
    response.setHeader("Set-Cookie", `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDuration}`);
  }
  function clearSession(response) {
    response.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }
  return async function handleCatalogApi(request, response, url) {
    try {
      const path = url.pathname;
      const method = request.method;
      const { id, session } = readSession(request);
      const user = session?.user ?? null;
      const admin = user?.role === "admin";
      const expectedAccount = request.headers["x-yingchang-account"];
      if (expectedAccount !== undefined && expectedAccount !== (user ? `${user.role}:${user.account}` : "")) {
        throw new RequestError(401, "登录账号已切换，请重新登录。");
      }
      const respond = async (operation, params) => {
        const result = await core.request(operation, params);
        if (Array.isArray(result.reviews)) result.reviews = result.reviews.map((review) => visibleReview(review, user));
        return reply(response, 200, { ...result, admin, user: publicUser(user) });
      };
      if (method === "GET" && path === "/api/auth/me") return reply(response, 200, { user: publicUser(user), admin });
      if (method === "GET" && path === "/api/health") {
        const result = await core.request("ping");
        return reply(response, 200, { ...result, pid: core.metadata.pid, dataDirectory: core.metadata.dataDirectory });
      }
      if (method === "POST" && ["/api/auth/login", "/api/admin/login"].includes(path)) {
        const { account, password } = await readJson(request) ?? {};
        if (typeof account !== "string" || account.length > 100 || typeof password !== "string" || password.length > 128) throw new RequestError(400, "请输入有效的账号和密码。");
        const { credential: stored } = await core.request("account.lookup", { account });
        const key = await deriveKey(password, stored?.salt ?? "00000000000000000000000000000000", 64);
        sessions.delete(id);
        if (stored && timingSafeEqual(key, Buffer.from(stored.passwordHash, "hex")) && (path !== "/api/admin/login" || stored.role === "admin")) {
          const current = { ...publicUser(stored), viewerId: stored.viewerId };
          setSession(response, current);
          return reply(response, 200, { user: publicUser(current), admin: current.role === "admin" });
        }
        const remaining = Math.max(0, 2 - (session?.failures ?? 0));
        if (remaining === 0) clearSession(response);
        else setSession(response, null, (session?.failures ?? 0) + 1);
        return reply(response, 401, { error: "账号或密码错误。", remaining });
      }
      if (method === "POST" && path === "/api/auth/register") {
        const body = await readJson(request) ?? {};
        const role = body.role ?? "viewer";
        if (!["viewer", "admin"].includes(role)) throw new RequestError(400, "请选择有效的账号类型。");
        if (typeof body.account !== "string" || typeof body.displayName !== "string") throw new RequestError(400, "请填写账号与昵称。");
        await core.request("account.register", {
          user: await credential(body.account, body.password, body.displayName, role),
          tokenHash: tokenHash(String(body.inviteCode ?? "").trim().toUpperCase()),
        });
        return reply(response, 200, { registered: true });
      }
      if (method === "POST" && ["/api/auth/logout", "/api/admin/logout"].includes(path)) {
        sessions.delete(id); clearSession(response);
        return reply(response, 200, { user: null, admin: false });
      }
      if (!user) throw new RequestError(401, "请先登录映场账号。");
      if (path === "/api/account/activity" && ["GET", "PATCH"].includes(method)) {
        if (admin) throw new RequestError(403, "此操作仅限观众账号。");
        const params = { viewerId: user.viewerId };
        if (method === "PATCH") params.change = await readJson(request);
        return reply(response, 200, await core.request(method === "GET" ? "activity.read" : "activity.update", params));
      }
      if (method === "GET" && path === "/api/catalog") return await respond("catalog");
      if (method === "GET" && path === "/api/search") return await respond("search", {
        query: url.searchParams.get("query") || "", category: url.searchParams.get("category") || "全部",
        exact: url.searchParams.get("exact") === "true",
        edition: url.searchParams.get("edition") || "all",
      });
      if (method === "GET" && path === "/api/rankings") return await respond("ranking", { metric: url.searchParams.get("metric") || "overall" });
      if (method === "POST" && path === "/api/reviews") {
        const review = await readJson(request);
        return await respond("review.submit", { review: { ...review, viewerId: user.viewerId } });
      }
      if (method === "DELETE" && path === "/api/reviews/comment") {
        const { filmId } = await readJson(request) ?? {};
        return await respond("review.clearComment", { filmId, viewerId: user.viewerId });
      }
      if (path.startsWith("/api/admin/") || path === "/api/reviews/import") {
        if (!admin) throw new RequestError(403, "此操作需要管理员权限。");
      }
      if (method === "DELETE" && path === "/api/admin/reviews/comment") {
        const { filmId, viewerId } = await readJson(request) ?? {};
        return await respond("review.clearComment", { filmId, viewerId });
      }
      if (method === "POST" && path === "/api/admin/invites") {
        const code = randomBytes(12).toString("hex").toUpperCase();
        const result = await core.request("account.invite", { actor: user.account, tokenHash: tokenHash(code) });
        return reply(response, 200, { code, ...result });
      }
      if (method === 'POST' && path === '/api/admin/backup') return await respond('backup');
      if (method === "POST" && path === "/api/reviews/import") return await respond("reviews.import", { reviews: await readJson(request) });
      if (method === "POST" && path === "/api/admin/distribution") {
        if (!admin) throw new RequestError(401, "请先登录管理员账号。");
        return await respond("distribution", await readJson(request));
      }
      const filmPath = path.match(/^\/api\/admin\/films(?:\/(-?\d+))?$/);
      if (filmPath && ["POST", "PATCH", "DELETE"].includes(method)) {
        if (!admin) throw new RequestError(401, "请先登录管理员账号。");
        if ((method === "POST") === Boolean(filmPath[1])) throw new RequestError(404, "接口不存在。");
        if (method === "POST") return await respond("film.add", { film: await readJson(request) });
        const params = { filmId: Number(filmPath[1]) };
        if (method === "PATCH") params.film = await readJson(request);
        return await respond(method === "DELETE" ? "film.delete" : "film.update", params);
      }
      throw new RequestError(404, "接口不存在。");
    } catch (error) {
      if (error instanceof RequestError || error instanceof CoreError) return reply(response, error.status, { error: error.message });
      console.error(error);
      return reply(response, 500, { error: "本地服务暂时无法处理请求。" });
    }
  };
}
