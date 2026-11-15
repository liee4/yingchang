const escapedCharacters = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => escapedCharacters[character]);
export const filmLink = (film) => `#/film/${film.id}`;

export function poster(film, className = "", eager = true) {
  return film.posterId
    ? `<img class="${className}" src="./posters/${film.posterId}.webp" alt="" loading="${eager ? "eager" : "lazy"}">`
    : `<span class="poster-empty ${className}" aria-hidden="true"><span class="icon icon-film"></span></span>`;
}

export async function request(path, method = "GET", body) {
  const options = body === undefined ? { method } : {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  const response = await fetch(`./api/${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.status = response.status;
    error.remaining = data.remaining;
    throw error;
  }
  return data;
}

export function updateCatalog(state, { films, reviews, admin }) {
  state.films = films;
  state.reviews = reviews;
  state.admin = admin;
}
