import { scoreFields, legacyStorageKey, scoreReview, filmAverage, rankingFor } from "./catalog.js";
import { mountAdmin, showAdminLogin, showRoleSelect } from "./admin.js";
import { mountSpotlight } from "./spotlight.js";
import { escapeHtml, filmLink, poster, request, updateCatalog } from "./ui.js";

const main = document.querySelector("#content");
const search = document.querySelector("#search-title");
const brandName = document.querySelector(".brand-name").textContent;
const metrics = [{ id: "overall", label: "综合" }, ...scoreFields];
const state = {
  films: [], reviews: [], admin: false, category: "全部", metric: "overall",
  catalogScroll: 0, viewerId: "", notice: "", spotlightId: null,
};

function switchButton(attribute, value, label, selected) {
  return `<button type="button" data-${attribute}="${value}" aria-pressed="${selected}">${label}</button>`;
}

function renderCatalogResults() {
  const query = search.value.trim().toLocaleLowerCase("zh-CN");
  const matches = state.films.filter((film) =>
    (state.category === "全部" || film.category === state.category) && film.title.toLowerCase().includes(query));
  document.querySelector("#catalog-status").textContent = `共 ${matches.length} 部影片`;
  mountSpotlight(document.querySelector("#catalog-spotlight"), matches, state.spotlightId, (id) => {
    state.spotlightId = id;
  });
  document.querySelector("#catalog-results").innerHTML = matches.length ? matches.map((film, index) => `
    <a class="film-card" href="${filmLink(film)}">
      <span class="poster-frame">
        ${poster(film, "cover", index < 5)}
        <span class="poster-arrow icon icon-arrow" aria-hidden="true"></span>
      </span>
      <h2>${escapeHtml(film.title)}</h2>
      <span class="film-meta">${filmMeta(film)}</span>
    </a>`).join("") : '<p class="empty">没有找到符合条件的影片。</p>';
}

function filmMeta(film) {
  return `${film.category ? escapeHtml(film.category) + " · " : ""}${film.episodes} 集`;
}

function showCatalog() {
  const categories = ["全部", ...new Set(state.films.map((film) => film.category).filter(Boolean))];
  if (!categories.includes(state.category)) state.category = "全部";
  main.innerHTML = `
    <div id="catalog-spotlight"></div>
    <div class="page-toolbar">
      <h1>放映片目</h1>
      <div class="filters" role="group" aria-label="影片类别">
        ${categories.map((name) => switchButton("category", escapeHtml(name), escapeHtml(name), name === state.category)).join("")}
      </div>
    </div>
    <p class="sr-only" id="catalog-status" role="status"></p>
    <div class="film-grid" id="catalog-results"></div>`;
  renderCatalogResults();
}

function renderRankingRows() {
  const rankings = rankingFor(state.films, state.reviews, state.metric);
  document.querySelector("#ranking-rows").innerHTML = rankings.length ? rankings.map(({ film, count, average }, index) => `
    <tr>
      <td class="numeric rank">${index + 1}</td>
      <td><a class="ranking-film" href="${filmLink(film)}">
        ${poster(film)}<span><strong>${escapeHtml(film.title)}</strong><small>${filmMeta(film)}</small></span>
      </a></td>
      <td class="numeric rating">${average.toFixed(2)}</td>
      <td class="numeric">${count}</td>
    </tr>`).join("") : '<tr><td class="empty" colspan="4">暂无已评分影片。</td></tr>';
}

function showRanking() {
  main.innerHTML = `
    <div class="page-toolbar">
      <h1>推荐榜</h1>
      <div class="filters" role="group" aria-label="榜单分类">
        ${metrics.map(({ id, label }) => switchButton("metric", id, label, id === state.metric)).join("")}
      </div>
    </div>
    <table class="ranking">
      <caption class="sr-only">按所选评分维度排名的前十部影片</caption>
      <thead><tr>
        <th scope="col" class="numeric rank">名次</th><th scope="col">片目</th>
        <th scope="col" class="numeric">得分</th><th scope="col" class="numeric">评价人数</th>
      </tr></thead>
      <tbody id="ranking-rows"></tbody>
    </table>`;
  renderRankingRows();
}

function scoreInput({ id, label }) {
  return `<fieldset class="score-field"><legend>${label}</legend><div class="score-options">
    ${[1, 2, 3, 4, 5].map((score) => `
      <label><input class="sr-only" type="radio" name="${id}" value="${score}" required>
        <span>${score}</span>
      </label>`).join("")}
  </div></fieldset>`;
}

function renderReviews(film) {
  const reviews = state.reviews.filter((review) => review.filmId === film.id);
  document.querySelector("#review-summary").innerHTML = reviews.length
    ? `<strong class="rating">${filmAverage(reviews).toFixed(2)}</strong><span>综合分 · ${reviews.length} 人评价</span>`
    : "暂无评分";
  document.querySelector("#review-list").innerHTML = reviews.length ? reviews.map((review) => `
    <li class="review">
      <div class="review-heading"><strong>${escapeHtml(review.viewerId)}</strong>
        <span class="rating">${scoreReview(review).toFixed(2)}</span></div>
      <small>${scoreFields.map(({ id, label }) => `${label} ${review[id]}`).join("　")}</small>
      ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ""}
    </li>`).join("") : '<li class="empty">还没有观众评价。</li>';
}

function showFilm(film) {
  main.innerHTML = `
    <a class="back-link" href="#/catalog"><span class="icon icon-arrow" aria-hidden="true"></span>返回片目</a>
    <section class="film-detail" aria-labelledby="film-title">
      ${poster(film, "detail-poster")}
      <div>
        <h1 id="film-title">${escapeHtml(film.title)}</h1>
        <p class="film-meta">${filmMeta(film)}</p>
        ${film.director || film.crew ? `<p class="film-credits">${[["导演", film.director], ["主创", film.crew]]
          .filter(([, value]) => value).map(([label, value]) => `${label} ${escapeHtml(value)}`).join(" · ")}</p>` : ""}
        <p id="review-summary" class="review-summary"></p>
        <p class="synopsis">${escapeHtml(film.synopsis)}</p>
        <a class="text-link" href="#review-form" id="jump-to-review">写评价 <span class="icon icon-arrow" aria-hidden="true"></span></a>
      </div>
    </section>
    <div class="review-layout">
      <section aria-labelledby="write-review">
        <h2 id="write-review">写评价</h2>
        <form id="review-form">
          <label for="viewer-id">观众编号</label>
          <input id="viewer-id" name="viewerId" placeholder="例如 U101" maxlength="32" autocomplete="off" required>
          ${scoreFields.map(scoreInput).join("")}
          <label for="comment">短评 <small>选填</small></label>
          <textarea id="comment" name="comment" rows="3" maxlength="250" placeholder="哪一段让你印象最深？"></textarea>
          <button class="submit" type="submit">提交评价</button>
          <p class="form-status" id="form-status" role="status"></p>
        </form>
      </section>
      <section aria-labelledby="audience-reviews">
        <h2 id="audience-reviews">观众评价</h2>
        <ul class="review-list" id="review-list"></ul>
      </section>
    </div>`;

  renderReviews(film);
  const form = document.querySelector("#review-form");
  const viewerInput = form.elements.viewerId;
  viewerInput.value = state.viewerId;
  function fillPreviousReview() {
    const previous = state.reviews.find((review) =>
      review.filmId === film.id && review.viewerId === viewerInput.value.trim());
    if (previous) {
      for (const { id } of scoreFields) form.elements[id].value = previous[id];
      form.elements.comment.value = previous.comment;
    }
  }
  fillPreviousReview();
  viewerInput.addEventListener("change", fillPreviousReview);
  document.querySelector("#jump-to-review").addEventListener("click", (event) => {
    event.preventDefault();
    viewerInput.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const viewerId = data.get("viewerId").trim();
    const status = document.querySelector("#form-status");
    if (!viewerId) {
      status.textContent = "请输入观众编号。";
      viewerInput.focus();
      return;
    }
    const entry = { filmId: film.id, viewerId, comment: data.get("comment").trim() };
    for (const { id } of scoreFields) entry[id] = Number(data.get(id));
    const submit = form.querySelector("button");
    submit.disabled = true;
    try {
      const result = await request("reviews", "POST", entry);
      updateCatalog(state, result);
      state.viewerId = viewerId;
      if (main.contains(form)) renderReviews(film);
      status.textContent = result.replaced ? "已更新你的评价。" : "评价已提交。";
    } catch (error) {
      status.textContent = error.message || "暂时无法保存评价，请重试。";
    } finally {
      submit.disabled = false;
    }
  });
}

function showRoute(restoreFocus = false) {
  const route = location.hash || "#/";
  const film = state.films.find((entry) => route === filmLink(entry));
  const catalogPage = route === "#/catalog";
  const rankingPage = route === "#/ranking";
  const viewerPage = catalogPage || rankingPage || route.startsWith("#/film/");
  const home = route === "#/";
  const loggingIn = route === "#/admin/login";
  const adminPage = route === "#/admin";
  if (adminPage && !state.admin) {
    location.replace("#/admin/login");
    return;
  }
  if (loggingIn && state.admin) {
    location.replace("#/admin");
    return;
  }
  document.querySelector(".navigation").hidden = !viewerPage;
  document.querySelector(".brand").href = viewerPage ? "#/catalog" : "#/";
  const exit = document.querySelector("#role-exit");
  exit.hidden = !viewerPage && !adminPage;
  exit.textContent = adminPage ? "退出登录" : "切换身份";
  document.querySelector(".site-header").classList.toggle("viewer-header", viewerPage);
  for (const [control, current] of [["nav-catalog", catalogPage], ["nav-ranking", rankingPage]]) {
    const link = document.getElementById(control);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.querySelector("#search").hidden = !catalogPage;
  document.title = film ? `${film.title} · ${brandName}` : brandName;
  if (catalogPage) showCatalog();
  else if (rankingPage) showRanking();
  else if (film) showFilm(film);
  else if (home) {
    showRoleSelect(main, state.notice);
    state.notice = "";
  } else if (loggingIn) {
    showAdminLogin(main, () => {
      state.admin = true;
      location.replace("#/admin");
    }, () => {
      state.notice = "连续三次登录失败，请重新选择身份。";
      location.replace("#/");
    });
  } else if (adminPage) {
    mountAdmin(main, state, () => {
      state.admin = false;
      location.replace("#/admin/login");
    });
  } else main.innerHTML = '<h1>找不到此片目</h1><a class="back-link" href="#/catalog">返回片目</a>';
  if (restoreFocus) {
    window.scrollTo(0, catalogPage ? state.catalogScroll : 0);
    main.focus({ preventScroll: true });
  }
}

function selectFilter(button, key, render) {
  state[key] = button.dataset[key];
  for (const option of button.parentElement.querySelectorAll("button")) {
    option.setAttribute("aria-pressed", option === button);
  }
  render();
}

main.addEventListener("click", (event) => {
  const category = event.target.closest("[data-category]");
  const metric = event.target.closest("[data-metric]");
  if (category) selectFilter(category, "category", renderCatalogResults);
  if (metric) selectFilter(metric, "metric", renderRankingRows);
});
search.addEventListener("input", renderCatalogResults);
document.querySelector("#role-exit").addEventListener("click", async (event) => {
  if (location.hash === "#/admin") {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await request("admin/logout", "POST");
      state.admin = false;
    } catch {
      const status = document.querySelector("#admin-status");
      if (status) status.textContent = "退出失败，请重试。";
      return;
    } finally {
      button.disabled = false;
    }
  }
  location.hash = "#/";
});
window.addEventListener("scroll", () => {
  if (location.hash === "#/catalog") state.catalogScroll = window.scrollY;
}, { passive: true });

async function start() {
  try {
    updateCatalog(state, await request("catalog"));
    try {
      const saved = window.localStorage.getItem(legacyStorageKey);
      if (saved) {
        updateCatalog(state, await request("reviews/import", "POST", JSON.parse(saved)));
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch {
      // 导入失败时保留旧数据，当前页面仍可读取服务端片目。
    }
    window.addEventListener("hashchange", () => showRoute(true));
    showRoute();
  } catch {
    main.innerHTML = '<p class="empty" role="alert">暂时无法载入片目，请检查本地服务后刷新页面。</p>';
  }
}
start();
