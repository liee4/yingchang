import { escapeHtml as html, poster, request, updateCatalog } from "./ui.js";
import { filmEditor, bindFilmEditor, readFilmEditor } from './film-editor.js';

const tabs = [
  ["films", "片目管理"], ["reviews", "全部评价"], ["distribution", "评分分布"],
];
const textFields = [
  ["title", "片名", 120], ["category", "类别", 50], ["director", "导演", 120], ["crew", "主创", 200],
];

function adminTable(headers, rows, empty) {
  return `<div class="table-scroll"><table class="admin-table">
    <thead><tr>${headers.map((header) => `<th scope="col">${html(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="${headers.length}">${empty}</td></tr>`}</tbody>
  </table></div>`;
}

function action(label, type, id) {
  return `<button class="quiet-button" type="button" data-action="${type}" data-id="${id}">${label}</button>`;
}

function filmTable(films) {
  const rows = films.map((film) => `<tr>
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
    <td>${html(review.viewerId)}${review.isSample ? ' <span class="sample-label">演示</span>' : ""}</td>
    <td class="numeric">${review.content}</td><td class="numeric">${review.image}</td><td class="numeric">${review.narration}</td>
    <td class="numeric rating">${review.overallScore.toFixed(2)}</td><td class="comment-cell">${html(review.comment || "—")}</td>
    <td class="row-actions">${review.comment ? `<button class="quiet-button" type="button" data-action="clear-comment" data-id="${review.filmId}" data-viewer="${html(review.viewerId)}">删除短评</button>` : ""}</td>
  </tr>`).join("");
  return adminTable(["片名", "观众编号", "内容", "画面", "讲解", "综合分", "短评", "操作"], rows, "暂无评价。");
}

function distributionTable({ rows: records, labels }) {
  const rows = records.map((film) => `<tr><td class="numeric">${film.filmId}</td><td>${html(film.title)}</td>
    ${film.counts.map((count) => `<td class="numeric">${count}</td>`).join("")}
  </tr>`).join("");
  return adminTable(["片号", "片名", ...labels], rows, "暂无片目。");
}

function distributionChart({labels, totals, percentages, total, sampleCount}) {
  return `<section class="distribution-chart" aria-label="全部评价的综合分分布"><h2>综合分分布 <small>${total} 条评价</small></h2>
    <p class="field-hint">含 ${sampleCount} 条演示评价，全部参与统计。下表可逐片核对。</p>
    ${labels.map((label, i) => `<div class="distribution-band"><span>${html(label)}</span><div class="band-track"><div style="width:${percentages[i]}%"></div></div><strong>${totals[i]} <small>(${percentages[i].toFixed(1)}%)</small></strong></div>`).join('')}</section>`;
}

function filmDetails(film) {
  return `<h2 id="admin-dialog-title">${html(film.title)}</h2>
    <dl class="film-fields">
      ${[["片目编号", film.id], ["集数", film.episodes], ...textFields.slice(1).map(([field, label]) => [label, film[field]]),
        ["原名", film.originalTitle], ["年份", film.year], ["地区", film.region], ["语言", film.language], ["单集时长", film.duration],
        ["一句话推荐", film.tagline], ["简介", film.synopsis], ["看点", film.highlights?.join('；')], ["分集", film.chapters?.join('；')],
        ["来源", film.sources?.map(s => s.label + '：' + s.url).join('；')]].map(([label, value]) => `<dt>${label}</dt><dd>${html(value || "—")}</dd>`).join("")}
    </dl>
    <div class="dialog-actions"><button class="quiet-button" type="button" data-close>关闭</button></div>`;
}

export function mountAdmin(main, state, onSessionExpired) {
  main.innerHTML = `
    <section class="admin-shell">
      <div class="admin-heading"><h1>管理员后台</h1><button class="quiet-button" type="button" id="backup-data">备份全部数据</button></div>
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
  let searchSequence = 0;
  shell.querySelector('#backup-data').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; status.textContent = '正在备份片目、评价与账号…';
    try { const result = await request('admin/backup', 'POST'); status.textContent = `备份完成：${result.films} 部影片、${result.reviews} 条评价及账号。保存位置：${result.directory}`; }
    catch(error) { status.textContent = error.message; } finally { button.disabled = false; }
  });

  async function renderFilmTable() {
    const sequence = ++searchSequence;
    try {
      const { filmIds } = await request(`search?scope=admin&query=${encodeURIComponent(query)}`);
      if (sequence !== searchSequence || !panel.querySelector("#film-table")) return;
      const byId = new Map(state.films.map(f => [f.id, f]));
      panel.querySelector("#film-table").innerHTML = filmTable(filmIds.map(id => byId.get(id)).filter(Boolean));
    } catch (error) { if (shell.isConnected) status.textContent = error.message; }
  }

  async function renderDistribution(form) {
    const result = panel.querySelector("#distribution-table");
    const submit = form.querySelector("button[type=submit]");
    const message = form.querySelector("[role=status]");
    submit.disabled = true;
    message.textContent = '正在统计…';
    try {
      const data = await request("admin/distribution", "POST", { cutoffs: form.elements.cutoffs.value });
      if (panel.contains(result)) result.innerHTML = distributionChart(data) + distributionTable(data);
      message.textContent = "统计已更新。";
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else message.textContent = error.message;
    } finally { submit.disabled = false; }
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
        <div id="distribution-table"></div>`;
      panel.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        renderDistribution(event.currentTarget);
      });
      renderDistribution(panel.querySelector("form"));
    }
  }

  async function runMutation(form, path, method, payload, success) {
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    form.querySelector('[role=status]').textContent = '正在保存…';
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

  shell.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-close")) return dialog.close();
    if (button.dataset.tab) return renderTab(button.dataset.tab);
    const action = button.dataset.action;
    if (!action) return;
    if (action === "clear-comment") {
      button.disabled = true;
      try {
        const data = await request("admin/reviews/comment", "DELETE", {
          filmId: Number(button.dataset.id), viewerId: button.dataset.viewer,
        });
        if (!main.contains(shell)) return;
        updateCatalog(state, data);
        if (panel.contains(button)) {
          renderTab("reviews");
          shell.querySelector('[data-tab="reviews"]').focus();
        }
        status.textContent = "短评已删除，评分已保留。";
      } catch (error) {
        if (error.status === 401) onSessionExpired();
        else status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
      return;
    }
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
      dialog.innerHTML = filmEditor(film, state.films);
      const form = dialog.querySelector("form");
      bindFilmEditor(form, state.films);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const payload = readFilmEditor(form);
        if (film) runMutation(form, `admin/films/${film.id}`, "PATCH", payload, "片目已修改。");
        else runMutation(form, "admin/films", "POST", payload, "片目已新增。");
      });
    }
    dialog.showModal();
  });
  renderTab("films");
}
