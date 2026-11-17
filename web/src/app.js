import { scoreFields } from "./catalog.js";
import {createNavigation} from "./navigation.js";
import {mountSearch} from "./search.js";
import { mountSpotlight } from "./spotlight.js";
import { mountFavorite } from "./activity.js";
import { emptyPreferences, recommendFilms } from "./preferences.js";
import { escapeHtml, filmLink, poster, request, updateCatalog } from "./ui.js";

const main = document.querySelector("#content");
const search = document.querySelector("#search-title");

const metrics = [{ id: "overall", label: "综合" }, ...scoreFields];
const state = {
  films: [], reviews: [], rankings: {}, admin: false, category: "全部", metric: "overall",
  catalogScroll: 0, user: null, notice: "", spotlightId: null, restoreCatalog: false,
  activity: null,
};

function switchButton(attribute, value, label, selected) {
  return `<button type="button" data-${attribute}="${value}" aria-pressed="${selected}">${label}</button>`;
}

let searchSequence = 0;
async function renderCatalogResults() {
  const sequence = ++searchSequence;
  const query = search.value, category = state.category;
  document.querySelector('#catalog-results')?.setAttribute('aria-busy', 'true');
  let result;
  try {
    result = await request(`search?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`);
  } catch (error) {
    if (sequence === searchSequence && document.querySelector("#catalog-status")) document.querySelector("#catalog-status").textContent = error.message;
    if (sequence === searchSequence) document.querySelector('#catalog-results')?.setAttribute('aria-busy', 'false');
    return;
  }
  if (sequence !== searchSequence || query !== search.value || category !== state.category || !document.querySelector("#catalog-results")) return;
  const filmsById = new Map(state.films.map((film) => [film.id, film]));
  const matches = result.filmIds.map((id) => filmsById.get(id)).filter(Boolean);
  renderSuggestions(matches);
  document.querySelector("#catalog-status").textContent = search.value.trim() ? `“${search.value.trim()}” · 找到 ${matches.length} 部影片` : `共 ${matches.length} 部影片`;
  const preferences = state.activity?.preferences ?? emptyPreferences;
  const { topics, styles } = preferences;
  const recommendation = !state.admin && (topics.length || styles.length)
    ? recommendFilms(state.films, preferences) : null;
  mountSpotlight(document.querySelector("#catalog-spotlight"), recommendation?.films ?? matches, state.spotlightId, (id) => {
    state.spotlightId = id;
  }, { preferences: !state.admin, mode: recommendation?.mode, reasons: recommendation?.reasons });
  document.querySelector("#catalog-results").innerHTML = matches.length ? matches.map((film, index) => `
    <a class="film-card" href="${filmLink(film)}">
      <span class="poster-frame">
        ${poster(film, "cover", index < 5)}
        <span class="poster-arrow icon icon-arrow" aria-hidden="true"></span>
      </span>
      <h2>${escapeHtml(film.title)}</h2>
      <span class="film-meta">${filmMeta(film)}</span>
      ${film.tagline ? `<p class="film-teaser">${escapeHtml(film.tagline)}</p>` : ""}
    </a>`).join("") : '<div class="empty search-empty"><h2>暂时没有找到这部影片</h2><p>试试片名、导演、原名或介绍中的关键词，也可以用空格组合搜索。</p><button class="submit" type="button" id="reset-search">清空搜索与筛选</button></div>';
  document.querySelector('#catalog-results').setAttribute('aria-busy', 'false');
  if (state.restoreCatalog) {
    const scroll = state.catalogScroll; state.restoreCatalog = false;
    requestAnimationFrame(() => window.scrollTo(0, scroll));
  }
}

function filmMeta(film) {
  return [film.year, film.category ? escapeHtml(film.category) : "", `${film.episodes} 集`, film.isDemoFilm ? "旧版演示片目" : ""].filter(Boolean).join(" · ");
}

function showCatalog() {
  const categories = ["全部", ...new Set(state.films.map((film) => film.category).filter(Boolean))];
  if (!categories.includes(state.category)) state.category = "全部";
  main.innerHTML = `
    <div id="catalog-spotlight"></div>
    <div class="page-toolbar">
      <h1>放映片目</h1>
      <div class="filters" role="group" aria-label="影片类别">
        ${categories.map((name) => switchButton("category", escapeHtml(name), name === "全部" ? "全部影片" : escapeHtml(name), name === state.category)).join("")}
      </div>
    </div>
    <p class="catalog-note" id="catalog-status" role="status"></p>
    <p class="catalog-description">从山海自然到人间烟火。打开影片，阅读介绍、看点与分集，再选一部想看的纪录片。</p>
    <div class="film-grid" id="catalog-results"></div>`;
  renderCatalogResults();
}

function renderRankingRows() {
  const rankings = state.rankings[state.metric] || [];
  document.querySelector('#ranking-podium').innerHTML = rankings.slice(0,3).map(({film,average,count}, index) => `<a class="podium-card podium-${index+1}" href="${filmLink(film)}"><span class="podium-rank">${String(index+1).padStart(2,'0')}</span>${poster(film,'podium-cover')}<div><small>${index === 0 ? '本场首选' : '观众推荐'}</small><h2>${escapeHtml(film.title)}</h2><strong class="rating">${average.toFixed(2)}</strong><span> / 5 · ${count} 人评价</span></div></a>`).join('');
  document.querySelector("#ranking-rows").innerHTML = rankings.length ? rankings.map(({ film, count, average }, index) => `
    <tr>
      <td class="numeric rank">${index + 1}</td>
      <td class="numeric">${film.id}</td>
      <td><a class="ranking-film" href="${filmLink(film)}">
        ${poster(film)}<span><strong>${escapeHtml(film.title)}</strong><small>${filmMeta(film)}</small></span>
      </a></td>
      <td class="numeric rating">${average.toFixed(2)}</td>
      <td class="numeric">${count}</td>
    </tr>`).join("") : '<tr><td class="empty" colspan="5">暂无已评分影片。</td></tr>';
}

function showRanking() {
  main.innerHTML = `
    <div class="page-toolbar">
      <h1>推荐榜</h1>
      <div class="filters" role="group" aria-label="榜单分类">
        ${metrics.map(({ id, label }) => switchButton("metric", id, label, id === state.metric)).join("")}
      </div>
    </div>
    <div id="ranking-podium" class="ranking-podium"></div>
    <div class="table-scroll"><table class="ranking">
      <caption class="sr-only">按所选评分维度排名的前十部影片</caption>
      <thead><tr>
        <th scope="col" class="numeric rank">名次</th><th scope="col" class="numeric">片号</th><th scope="col">片目</th>
        <th scope="col" class="numeric">得分</th><th scope="col" class="numeric">评价人数</th>
      </tr></thead>
      <tbody id="ranking-rows"></tbody>
    </table></div>`;
  renderRankingRows();
}

function scoreInput({ id, label }) {
  return `<fieldset class="score-field"><legend>${label}</legend><div class="score-options">
    ${[1, 2, 3, 4, 5].map((score) => `
      <label><input class="sr-only" type="radio" name="${id}" value="${score}" required>
        <span>${score}</span><span class="sr-only"> 分</span>
      </label>`).join("")}
  </div></fieldset>`;
}

function renderReviews(film) {
  const reviews = state.reviews.filter((review) => review.filmId === film.id);
  const summary = state.films.find(({ id }) => id === film.id)?.summary;
  document.querySelector("#review-summary").innerHTML = summary?.count
    ? `<strong class="rating">${summary.average.toFixed(2)}</strong><span>本站综合分 · ${summary.count} 人评价${summary.sampleCount ? `（含 ${summary.sampleCount} 条演示评价）` : ''}</span>`
    : "暂无评分";
  document.querySelector('#dimension-summary').innerHTML = scoreFields.map(({id,label})=>`<div><dt>${label}</dt><dd>${summary?.dimensions?.[id]?.toFixed(2) ?? '—'}</dd></div>`).join('');
  document.querySelector("#review-list").innerHTML = reviews.length ? reviews.map((review) => `
    <li class="review">
      <div class="review-heading"><strong>${escapeHtml(review.viewerName || (review.own ? state.user.displayName : "观众"))}${review.own ? ' <span class="sample-label">我</span>' : ''}${review.isSample ? ' <span class="sample-label">演示</span>' : ""}</strong>
        <span class="rating">${review.overallScore.toFixed(2)}</span></div>
      <small>${scoreFields.map(({ id, label }) => `${label} ${review[id]}`).join("　")}</small>
      ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ""}
      ${review.own && review.comment ? '<button class="quiet-button delete-short-review" type="button">删除短评</button>' : ""}
    </li>`).join("") : '<li class="empty">还没有观众评价。</li>';
}

function showFilm(film) {
  main.innerHTML = `
    <a class="back-link" href="#/catalog"><span class="icon icon-arrow" aria-hidden="true"></span>返回片目</a>
    <section class="film-detail" aria-labelledby="film-title">
      <figure class="detail-cover">${poster(film, "detail-poster")}<figcaption>${escapeHtml(film.artworkKind || (film.isDemoFilm ? "演示插画" : ""))}</figcaption></figure>
      <div>
        <p class="film-eyebrow">${filmMeta(film)}</p>
        <h1 id="film-title">${escapeHtml(film.title)}</h1>
        ${film.originalTitle ? `<p class="original-title" lang="en">${escapeHtml(film.originalTitle)}</p>` : ""}
        ${film.tagline ? `<p class="film-tagline">${escapeHtml(film.tagline)}</p>` : ""}
        <dl class="film-facts">${[["片号", film.id], ["地区", film.region], ["语言", film.language], ["单集时长", film.duration]]
          .filter(([, value]) => value !== undefined && value !== "").map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
        ${film.director || film.crew ? `<p class="film-credits">${[["导演", film.director], ["主创", film.crew]]
          .filter(([, value]) => value).map(([label, value]) => `${label} ${escapeHtml(value)}`).join(" · ")}</p>` : ""}
        <p id="review-summary" class="review-summary"></p>
        <dl id="dimension-summary" class="dimension-summary" aria-label="分项平均分，满分五分"></dl>
        <div class="film-actions">
          ${state.admin ? "" : '<button class="quiet-button favorite-toggle" id="favorite-toggle" aria-label="收藏" type="button"></button>'}
          <a class="text-link" href="#review-form" id="jump-to-review">写评价 <span class="icon icon-arrow" aria-hidden="true"></span></a>
        </div>
        <p class="form-status" id="favorite-status" role="status" hidden></p>
      </div>
    </section>
    <div class="film-reading">
      <section class="film-introduction" aria-labelledby="film-introduction-title">
        <h2 id="film-introduction-title">影片介绍</h2>
        ${film.synopsis.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        ${film.highlights?.length ? `<h3>值得关注</h3><ul class="film-highlights">${film.highlights.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : ""}
      </section>
      <aside class="film-reading-aside" aria-label="分集与资料">
        ${film.chapters?.length ? `<details class="episode-guide" open><summary>${film.chapters.length === film.episodes ? "分集目录" : "分集选读"}<small>全 ${film.episodes} 集</small></summary>
          <${film.chapters.length === film.episodes ? "ol" : "ul"}>${film.chapters.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</${film.chapters.length === film.episodes ? "ol" : "ul"}>
          ${film.chapters.length < film.episodes ? '<p class="field-hint">此处选列官方页面中的部分分集，完整目录可进入来源页面查看。</p>' : ""}
        </details>` : ""}
        ${film.sources?.length ? `<section class="film-sources" aria-labelledby="film-sources-title"><h3 id="film-sources-title">资料与官方入口</h3>
          <p>介绍依据下列资料整理，观看内容以来源平台为准。</p>
          ${film.sources.map(({ label, url }) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`).join("")}
        </section>` : ""}
        ${film.isDemoFilm ? '<p class="field-hint">此为旧版演示片目，保留原有评价记录。</p>' : ""}
      </aside>
    </div>
    <div class="review-layout">
      <section aria-labelledby="write-review">
        <h2 id="write-review">写评价</h2>
        <form id="review-form">
          <div class="review-identity"><span class="avatar">${escapeHtml(state.user.displayName[0])}</span><span><strong>${escapeHtml(state.user.displayName)}</strong><small>以当前账号发表评价</small></span></div>
          ${scoreFields.map(scoreInput).join("")}
          <p class="field-hint">1 分 很不满意 · 2 分 不满意 · 3 分 一般 · 4 分 满意 · 5 分 很满意</p>
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

  const favorite = main.querySelector("#favorite-toggle");
  if (favorite) mountFavorite(favorite, main.querySelector("#favorite-status"), film.id, state.activity,
    (change) => request("account/activity", "PATCH", change));
  renderReviews(film);
  const form = document.querySelector("#review-form");
  function fillPreviousReview() {
    const previous = state.reviews.find((review) =>
      review.filmId === film.id && review.own);
    for (const { id } of scoreFields) {
      for (const radio of form.querySelectorAll(`input[name="${id}"]`)) radio.checked = previous?.[id] === Number(radio.value);
    }
    form.elements.comment.value = previous?.comment ?? "";
    form.querySelector("button[type=submit]").textContent = previous ? "更新评价" : "提交评价";
  }
  fillPreviousReview();
  const status = form.querySelector("#form-status");
  const submit = form.querySelector("button[type=submit]");
  const list = document.querySelector("#review-list");
  if (state.reviews.some(r => r.filmId === film.id && r.own)) status.textContent = '已填入你上次的评价，修改后提交即可更新。';
  document.querySelector("#jump-to-review").addEventListener("click", (event) => {
    event.preventDefault();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.querySelector("input[type=radio]").focus({ preventScroll: true });
  });
  async function saveReview(path, method, entry) {
    if (submit.disabled) return;
    const remove = list.querySelector(".delete-short-review");
    submit.disabled = true;
    if (remove) remove.disabled = true;
    status.textContent = '正在保存评价…';
    try {
      const result = await request(path, method, entry);
      if (!main.contains(form)) return;
      updateCatalog(state, result);
      renderReviews(film);
      submit.textContent = "更新评价";
      if (method === "DELETE") {
        form.elements.comment.value = "";
        status.textContent = "短评已删除，评分已保留。";
        form.elements.comment.focus();
      } else status.textContent = result.replaced ? "已更新你的评价。" : "评价已提交。";
    } catch (error) {
      status.textContent = error.message || "暂时无法保存评价，请重试。";
    } finally {
      submit.disabled = false;
      if (remove) remove.disabled = false;
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const entry = { filmId: film.id, comment: data.get("comment").trim() };
    for (const { id } of scoreFields) entry[id] = Number(data.get(id));
    saveReview("reviews", "POST", entry);
  });
  list.addEventListener("click", (event) => {
    if (event.target.closest(".delete-short-review")) saveReview("reviews/comment", "DELETE", { filmId: film.id });
  });
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
const searchControl=mountSearch({search,state,showCatalog,renderCatalogResults,main});
function renderSuggestions(matches){searchControl.render(matches);}
createNavigation({main,state,showCatalog,showRanking,showFilm,closeSuggestions:searchControl.close}).start();
