import { escapeHtml as html, filmLink, poster } from "./ui.js";

const visitDate = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

export function mountFavorite(button, status, filmId, activity, changeActivity) {
  let selected = activity.favorites.includes(filmId);
  function render(selected) {
    button.setAttribute("aria-pressed", selected);
    button.innerHTML = `<span aria-hidden="true">${selected ? "★" : "☆"}</span> ${selected ? "已收藏" : "收藏"}`;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "";
    status.hidden = true;
    try {
      const updated = await changeActivity({ action: selected ? "unfavorite" : "favorite", filmId });
      selected = updated.favorites.includes(filmId);
      render(selected);
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  render(selected);
}

export function showFilmActivity(main, films, showingHistory, activity, changeActivity) {
  const title = showingHistory ? "浏览历史" : "我的收藏";
  const action = showingHistory ? "删除记录" : "取消收藏";
  const filmIdOf = showingHistory ? (entry) => entry.filmId : (entry) => entry;
  const filmsById = new Map(films.map((film) => [film.id, film]));
  main.innerHTML = `<section class="account-page film-activity" aria-labelledby="activity-title">
    <header class="activity-heading"><div><h1 id="activity-title">${title}</h1><p class="field-hint" role="status"></p></div>
      ${showingHistory ? '<button id="clear-history" class="quiet-button" type="button">清空历史</button>' : ""}</header>
    <ul class="activity-list" aria-label="${title}"></ul>
    <div class="empty activity-empty"><p>${showingHistory ? "暂无浏览记录。" : "还没有收藏影片。"}</p>
      <a class="text-link" href="#/catalog">浏览片目 <span aria-hidden="true">↗</span></a></div>
    <p class="form-status" id="activity-status" role="status" hidden></p>
  </section>`;
  const list = main.querySelector(".activity-list");
  const count = main.querySelector(".activity-heading [role=status]");
  const status = main.querySelector("#activity-status");
  const empty = main.querySelector(".activity-empty");
  const emptyLink = empty.querySelector("a");
  const clear = main.querySelector("#clear-history");

  function row(entry) {
    const film = filmsById.get(filmIdOf(entry));
    const date = showingHistory ? new Date(entry.visitedAt) : null;
    const detail = date ? `<time datetime="${date.toISOString()}">${visitDate.format(date)}</time>`
      : `<small>${html(film.category)} · ${film.episodes} 集</small>`;
    return `<li class="activity-row">
      <a class="activity-film" href="${filmLink(film)}" aria-label="${html(film.title)}">
        ${poster(film, "activity-cover", false)}<span><strong>${html(film.title)}</strong>${detail}</span>
      </a>
      <button class="quiet-button" type="button" data-remove-film="${film.id}" aria-label="${action}《${html(film.title)}》">${action}</button>
    </li>`;
  }

  function render() {
    const entries = (showingHistory ? activity.history : activity.favorites)
      .filter((entry) => filmsById.has(filmIdOf(entry)));
    if (!showingHistory) entries.reverse();
    list.innerHTML = entries.map(row).join("");
    list.hidden = !entries.length;
    if (clear) clear.hidden = list.hidden;
    empty.hidden = !list.hidden;
    count.textContent = entries.length ? `${entries.length} 部影片` : "";
  }

  async function mutate(change, index) {
    const buttons = Array.from(main.querySelectorAll(".film-activity button"));
    buttons.forEach((button) => { button.disabled = true; });
    status.hidden = true;
    try {
      activity = await changeActivity(change);
      if (!main.contains(list)) return;
      render();
      const remaining = list.querySelectorAll("button");
      (remaining[Math.min(index, remaining.length - 1)] ?? emptyLink).focus();
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-film]");
    if (!button) return;
    const index = Array.from(list.children).indexOf(button.parentElement);
    mutate({ action: showingHistory ? "removeVisit" : "unfavorite", filmId: Number(button.dataset.removeFilm) }, index);
  });
  clear?.addEventListener("click", () => mutate({ action: "clearHistory" }, 0));
  render();
}
