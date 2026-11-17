const escapedCharacters = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => escapedCharacters[character]);
export const filmLink = (film) => `#/film/${film.id}`;
let requestAccount = "";
export function bindRequestAccount(user) {
  requestAccount = user ? `${user.role}:${user.account}` : "";
}

export function poster(film, className = "", eager = true) {
  return film.posterId
    ? `<img class="${className}" src="./posters/${film.posterId}.webp" alt="" loading="${eager ? "eager" : "lazy"}">`
    : `<span class="poster-empty ${className}" aria-hidden="true"><span class="icon icon-film"></span></span>`;
}

export async function request(path, method = "GET", body) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestAccount) headers["X-Yingchang-Account"] = requestAccount;
  const options = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
  let response, data;
  try { response = await fetch(`./api/${path}`, options); data = await response.json(); }
  catch { throw new Error('无法连接本地服务，请确认映场服务窗口仍在运行，然后重试。'); }
  if (!response.ok) {
    if (response.status === 401 && !["auth/login", "auth/register", "admin/login"].includes(path)) window.dispatchEvent(new Event("session-expired"));
    const error = new Error(data.error);
    error.status = response.status;
    error.remaining = data.remaining;
    throw error;
  }
  return data;
}

export function updateCatalog(state, { films, reviews, rankings, admin, user }) {
  state.films = films;
  state.reviews = reviews;
  state.rankings = rankings;
  state.admin = admin;
  if (user !== undefined) state.user = user;
}
