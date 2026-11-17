import { escapeHtml as html, filmLink, poster } from "./ui.js";

export function mountSpotlight(container, films, preferredId, onSelect, { preferences, mode, reasons } = {}) {
  const heading = mode === "exact" || mode === "partial" ? "为你展映" : "本周展映";
  const edit = preferences
    ? `<a class="spotlight-preferences" href="#/preferences">${mode ? "修改偏好" : "设置偏好"} <span aria-hidden="true">↗</span></a>`
    : "<span>CURATED DOCUMENTARIES</span>";
  const header = `<div class="spotlight-heading"><span>${heading}</span>${edit}</div>`;
  if (!films.length) {
    container.innerHTML = preferences ? header : "";
    return;
  }
  const notice = { partial: "展映片目符合其中一组偏好。", none: "暂无匹配影片，已显示本周展映。" }[mode];
  container.innerHTML = `<section class="spotlight" aria-roledescription="轮播" aria-label="精选展映">
    <div class="spotlight-backdrop" aria-hidden="true"></div>
    ${header}
    ${notice ? `<p class="field-hint spotlight-notice">${notice}</p>` : ""}
    <div class="spotlight-stage" tabindex="0" aria-label="使用左右方向键或滑动切换影片">
      <div class="spotlight-track">${films.map((film, index) => `<a class="spotlight-card" href="${filmLink(film)}" data-index="${index}" tabindex="-1" aria-label="查看《${html(film.title)}》">${poster(film, 'spotlight-cover', index < 3)}<span class="spotlight-label">${html(film.title)}</span></a>`).join('')}</div>
      <button type="button" class="spotlight-step" data-step="-1" aria-label="上一部影片"><span class="icon icon-arrow" aria-hidden="true"></span></button>
      <button type="button" class="spotlight-step" data-step="1" aria-label="下一部影片"><span class="icon icon-arrow" aria-hidden="true"></span></button>
    </div>
    <div class="spotlight-caption" aria-live="polite" aria-atomic="true"></div>
  </section>`;
  const section = container.querySelector(".spotlight"), stage = container.querySelector(".spotlight-stage"), cards = [...container.querySelectorAll(".spotlight-card")];
  let selected = Math.max(0, films.findIndex(({id}) => id === preferredId));
  function choose(index) {
    selected = (index + films.length) % films.length;
    const film = films[selected];
    cards.forEach((card, i) => {
      let offset = (i - selected + films.length) % films.length;
      if (offset > films.length / 2) offset -= films.length;
      card.style.setProperty("--offset", offset); card.style.setProperty("--distance", Math.abs(offset));
      card.classList.toggle("is-active", offset === 0); card.classList.toggle("is-near", Math.abs(offset) === 1);
      card.setAttribute("aria-hidden", String(Math.abs(offset) > 2));
      card.tabIndex = offset === 0 ? 0 : -1;
      if (Math.abs(offset) < 3) card.querySelector("img")?.setAttribute("loading", "eager");
    });
    container.querySelector(".spotlight-backdrop").innerHTML = poster(film);
    const tags = reasons?.get(film.id) ?? [];
    container.querySelector(".spotlight-caption").innerHTML = `<p class="eyebrow">${html([film.year, film.category, `${film.episodes} 集`].filter(Boolean).join(' · '))}</p><h2><a href="${filmLink(film)}">${html(film.title)}</a></h2><p>${html(film.tagline || film.synopsis.slice(0, 72))}</p>${tags.length ? `<p class="spotlight-match">${html(tags.join(" · "))}</p>` : ""}<a class="text-link" href="${filmLink(film)}">走进这部影片 <span aria-hidden="true">↗</span></a>`;
    section.querySelectorAll(".spotlight-step").forEach((button) => button.hidden = films.length < 2);
    onSelect(film.id);
  }
  section.addEventListener("click", (event) => {
    const step = event.target.closest("[data-step]"), card = event.target.closest("[data-index]");
    if (step) choose(selected + Number(step.dataset.step));
    else if (card && Number(card.dataset.index) !== selected) {
      event.preventDefault(); choose(selected + Math.sign(Number(card.style.getPropertyValue("--offset"))));
    }
  });
  stage.addEventListener("keydown", (event) => {
    const next = {ArrowLeft:selected-1,ArrowRight:selected+1,Home:0,End:films.length-1}[event.key];
    if (next !== undefined) { event.preventDefault(); choose(next); stage.focus({preventScroll:true}); }
  });
  let touch; let swipedAt = 0;
  stage.addEventListener("pointerdown", (event) => { if (event.pointerType !== 'mouse') touch = {x:event.clientX,y:event.clientY}; });
  stage.addEventListener("pointerup", (event) => {
    if (!touch) return; const dx = event.clientX-touch.x, dy = event.clientY-touch.y; touch = null;
    if (Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.3) { swipedAt=Date.now(); choose(selected+(dx<0?1:-1)); }
  });
  stage.addEventListener("pointercancel", () => {touch=null;});
  stage.addEventListener("click", (event) => { if (Date.now()-swipedAt<400) {event.preventDefault();event.stopPropagation();} }, true);
  choose(selected);
}
