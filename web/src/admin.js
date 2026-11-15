import { parseCutoffs, scoreDistribution, scoreReview } from "./catalog.js";
import { escapeHtml as html, poster, request, updateCatalog } from "./ui.js";

const tabs = [
  ["films", "片目管理"], ["reviews", "全部评价"], ["distribution", "评分分布"],
];
const textFields = [
  ["title", "片名", 120], ["category", "类别", 50], ["director", "导演", 120], ["crew", "主创", 200],
];

export function showRoleSelect(main, notice = "") {
  main.innerHTML = `
    <section class="entry">
      <h1>选择登录身份</h1>
      ${notice ? `<p class="entry-notice" role="status">${html(notice)}</p>` : ""}
      <div class="role-grid">
        <a class="role-card" href="#/admin/login">
          <strong>管理员登录</strong>
          <span>维护片目、查看评价和评分分布</span>
          <span class="icon icon-arrow" aria-hidden="true"></span>
        </a>
        <a class="role-card" href="#/catalog">
          <strong>观众登录</strong>
          <span>浏览片目、评分和查看榜单</span>
          <span class="icon icon-arrow" aria-hidden="true"></span>
        </a>
      </div>
    </section>`;
}

export function showAdminLogin(main, onSuccess, onLocked) {
  main.innerHTML = `
    <section class="entry login">
      <a class="back-link" href="#/"><span class="icon icon-arrow" aria-hidden="true"></span>返回身份选择</a>
      <h1>管理员登录</h1>
      <form class="field-stack">
        <label for="admin-account">管理员账号</label>
        <input id="admin-account" name="account" autocomplete="username" required>
        <label for="admin-password">密码</label>
        <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
        <button class="submit" type="submit">登录</button>
        <p class="form-status" role="status"></p>
      </form>
    </section>`;
  const form = main.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button");
    const status = form.querySelector("[role=status]");
    submit.disabled = true;
    try {
      await request("admin/login", "POST", Object.fromEntries(new FormData(form)));
      onSuccess();
    } catch (error) {
      if (error.remaining === 0) onLocked();
      else if (error.remaining !== undefined) {
        status.textContent = `${error.message} 剩余 ${error.remaining} 次尝试。`;
        form.elements.password.value = "";
        form.elements.password.focus();
      } else status.textContent = "暂时无法登录，请重试。";
    } finally {
      submit.disabled = false;
    }
  });
}

function adminTable(headers, rows, empty) {
  return `<div class="table-scroll"><table class="admin-table">
    <thead><tr>${headers.map((header) => `<th scope="col">${html(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="${headers.length}">${empty}</td></tr>`}</tbody>
  </table></div>`;
}

function action(label, type, id) {
  return `<button class="quiet-button" type="button" data-action="${type}" data-id="${id}">${label}</button>`;
}

function filmTable(films, query) {
  const matches = films.filter((film) => film.title.toLowerCase().includes(query) || String(film.id).includes(query));
  const rows = matches.map((film) => `<tr>
    <td class="numeric">${film.id}</td>
    <td><span class="ranking-film">${poster(film, "admin-cover", false)}<strong>${html(film.title)}</strong></span></td>
    <td>${html(film.category || "—")}</td><td class="numeric">${film.episodes}</td>
    <td class="row-actions">${action("查看", "view", film.id)}${action("修改", "edit", film.id)}${action("删除", "delete", film.id)}</td>
  </tr>`).join("");
  return adminTable(["片号", "片名", "类别", "集数", "操作"], rows, "暂无符合条件的片目。");
}

function reviewTable({ films, reviews }) {
  const titles = new Map(films.map(({ id, title }) => [id, title]));
  const rows = reviews.map((review) => `<tr>
    <td>${html(titles.get(review.filmId))}<small>片号 ${review.filmId}</small></td>
    <td>${html(review.viewerId)}</td>
    <td class="numeric">${review.content}</td><td class="numeric">${review.image}</td><td class="numeric">${review.narration}</td>
    <td class="numeric rating">${scoreReview(review).toFixed(2)}</td><td class="comment-cell">${html(review.comment || "—")}</td>
  </tr>`).join("");
  return adminTable(["片名", "观众编号", "内容", "画面", "讲解", "综合分", "短评"], rows, "暂无评价。");
}

function distributionTable({ films, reviews }, cutoffs) {
  const bounds = [1, ...cutoffs, 5];
  const labels = cutoffs.map((cutoff, index) => `[${bounds[index]}, ${cutoff})`);
  labels.push(`[${bounds.at(-2)}, 5]`);
  const counts = scoreDistribution(films, reviews, cutoffs);
  const rows = films.map((film) => `<tr><td class="numeric">${film.id}</td><td>${html(film.title)}</td>
    ${counts.get(film.id).map((count) => `<td class="numeric">${count}</td>`).join("")}
  </tr>`).join("");
  return adminTable(["片号", "片名", ...labels], rows, "暂无片目。");
}

function filmDialog(film) {
  const editing = Boolean(film);
  return `
    <h2 id="admin-dialog-title">${editing ? "修改片目" : "新增片目"}</h2>
    <form class="field-stack">
      <div class="field-grid">
        <label>片目编号<input name="id" type="number" step="1" value="${editing ? film.id : ""}" ${editing ? "readonly" : "required"}></label>
        <label>集数<input name="episodes" type="number" min="1" step="1" value="${editing ? film.episodes : ""}" required></label>
      </div>
      ${textFields.map(([field, label, limit]) => `
        <label>${label}<input name="${field}" maxlength="${limit}" value="${html(film?.[field])}" ${field === "title" ? "required" : ""}></label>
      `).join("")}
      <label>简介<textarea name="synopsis" maxlength="1200" rows="3">${html(film?.synopsis)}</textarea></label>
      <p class="form-status" role="status"></p>
      <div class="dialog-actions">
        <button class="quiet-button" type="button" data-close>取消</button>
        <button class="submit" type="submit">保存片目</button>
      </div>
    </form>`;
}

function filmDetails(film) {
  return `<h2 id="admin-dialog-title">${html(film.title)}</h2>
    <dl class="film-fields">
      ${[["片目编号", film.id], ["集数", film.episodes], ...textFields.slice(1).map(([field, label]) => [label, film[field]]),
        ["简介", film.synopsis]].map(([label, value]) => `<dt>${label}</dt><dd>${html(value || "—")}</dd>`).join("")}
    </dl>
    <div class="dialog-actions"><button class="quiet-button" type="button" data-close>关闭</button></div>`;
}

export function mountAdmin(main, state, onSessionExpired) {
  main.innerHTML = `
    <section class="admin-shell">
      <div class="admin-heading"><h1>管理员后台</h1></div>
      <div class="admin-tabs" role="group" aria-label="后台功能">
        ${tabs.map(([id, label]) => `<button data-tab="${id}" aria-pressed="${id === "films"}">${label}</button>`).join("")}
      </div>
      <p class="form-status" id="admin-status" role="status"></p>
      <div id="admin-panel"></div>
      <dialog class="admin-dialog" aria-labelledby="admin-dialog-title"></dialog>
    </section>`;
  const shell = main.querySelector(".admin-shell");
  const panel = shell.querySelector("#admin-panel");
  const dialog = shell.querySelector("dialog");
  const status = shell.querySelector("#admin-status");
  let query = "";

  function renderFilmTable() {
    panel.querySelector("#film-table").innerHTML = filmTable(state.films, query.toLowerCase().trim());
  }

  function renderTab(tab) {
    status.textContent = "";
    for (const button of shell.querySelectorAll("[data-tab]")) button.setAttribute("aria-pressed", button.dataset.tab === tab);
    if (tab === "films") {
      panel.innerHTML = `
        <div class="admin-toolbar">
          <input type="search" aria-label="查询片目" placeholder="输入片名或片号">
          <button class="submit" type="button" data-action="add">新增片目</button>
        </div><div id="film-table"></div>`;
      const search = panel.querySelector("input");
      search.value = query;
      search.addEventListener("input", () => { query = search.value; renderFilmTable(); });
      renderFilmTable();
    } else if (tab === "reviews") {
      panel.innerHTML = reviewTable(state);
    } else {
      panel.innerHTML = `
        <form class="band-form field-stack">
          <label for="cutoffs">综合分分界点</label>
          <div class="admin-toolbar">
            <input id="cutoffs" name="cutoffs" value="3 4" maxlength="300" required>
            <button class="submit" type="submit">统计分布</button>
          </div>
          <p class="field-hint">例如输入 3 4，统计 1 到 3、3 到 4、4 到 5 三段。边界分数归后一段。</p>
          <p class="form-status" role="status"></p>
        </form>
        <div id="distribution-table">${distributionTable(state, [3, 4])}</div>`;
      panel.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const result = panel.querySelector("#distribution-table");
        const message = form.querySelector("[role=status]");
        try {
          result.innerHTML = distributionTable(state, parseCutoffs(form.elements.cutoffs.value));
          message.textContent = "";
        } catch (error) {
          message.textContent = error.message;
        }
      });
    }
  }

  async function runMutation(form, path, method, payload, success) {
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      updateCatalog(state, await request(path, method, payload));
      dialog.close();
      if (method === "POST") {
        query = "";
        panel.querySelector("input").value = "";
      }
      renderFilmTable();
      status.textContent = success;
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else form.querySelector("[role=status]").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  shell.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-close")) return dialog.close();
    if (button.dataset.tab) return renderTab(button.dataset.tab);
    const action = button.dataset.action;
    if (!action) return;
    const film = state.films.find(({ id }) => id === Number(button.dataset.id));
    if (action !== "add" && !film) return;

    if (action === "view") dialog.innerHTML = filmDetails(film);
    else if (action === "delete") {
      dialog.innerHTML = `
        <h2 id="admin-dialog-title">删除片目</h2>
        <p>将删除《${html(film.title)}》和它的全部评价。此操作无法撤销。</p>
        <form>
          <p class="form-status" role="status"></p>
          <div class="dialog-actions"><button type="button" class="quiet-button" data-close autofocus>取消</button>
          <button class="submit danger" type="submit">确认删除</button></div>
        </form>`;
      const form = dialog.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        runMutation(form, `admin/films/${film.id}`, "DELETE", undefined, "片目及关联评价已删除。");
      });
    } else {
      dialog.innerHTML = filmDialog(film);
      const form = dialog.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const payload = { ...data, id: form.elements.id.valueAsNumber, episodes: form.elements.episodes.valueAsNumber };
        if (film) runMutation(form, `admin/films/${film.id}`, "PATCH", payload, "片目已修改。");
        else runMutation(form, "admin/films", "POST", payload, "片目已新增。");
      });
    }
    dialog.showModal();
  });
  renderTab("films");
}
