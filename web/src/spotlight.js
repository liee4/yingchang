import { escapeHtml, filmLink, poster } from "./ui.js";

function filmCard(film, index) {
  return `<a class="spotlight-card" href="${filmLink(film)}" data-position="${index}"
      aria-label="从展映栏查看《${escapeHtml(film.title)}》">
    ${poster(film, "spotlight-cover", index < 6)}
    <span class="spotlight-label" aria-hidden="true">
      <strong>${escapeHtml(film.title)}</strong>
      <small>${film.category ? escapeHtml(film.category) + " · " : ""}${film.episodes} 集</small>
    </span>
  </a>`;
}

export function mountSpotlight(container, films, preferredId, onSelect) {
  if (!films.length) {
    container.replaceChildren();
    return;
  }
  container.innerHTML = `
    <section class="spotlight" aria-label="影片展映">
      <div class="spotlight-backdrop" aria-hidden="true">
        ${films.map((film) => `<div class="spotlight-scene">${film.posterId ? poster(film, "", false) : ""}</div>`).join("")}
      </div>
      <div class="spotlight-viewport">
        <div class="spotlight-track">${films.map(filmCard).join("")}</div>
      </div>
      <div class="spotlight-controls" ${films.length === 1 ? "hidden" : ""}>
        <button class="spotlight-step" type="button" data-step="-1" aria-label="上一部影片">
          <span class="icon icon-arrow" aria-hidden="true"></span>
        </button>
        <button class="spotlight-step" type="button" data-step="1" aria-label="下一部影片">
          <span class="icon icon-arrow" aria-hidden="true"></span>
        </button>
      </div>
    </section>`;

  const viewport = container.querySelector(".spotlight-viewport");
  const cards = Array.from(container.querySelectorAll(".spotlight-card"));
  const scenes = container.querySelectorAll(".spotlight-scene");
  const steps = container.querySelectorAll(".spotlight-step");
  let selected = -1;
  let revealSelection = false;

  function reveal(card) {
    const edge = viewport.getBoundingClientRect();
    const tile = card.getBoundingClientRect();
    if (tile.left < edge.left) viewport.scrollLeft += tile.left - edge.left;
    else if (tile.right > edge.right) viewport.scrollLeft += tile.right - edge.right;
  }

  function choose(index, shouldReveal) {
    if (!cards[index]) return;
    if (index !== selected) {
      cards[selected]?.classList.remove("is-active");
      scenes[selected]?.classList.remove("is-active");
      selected = index;
      cards[selected].classList.add("is-active");
      scenes[selected].classList.add("is-active");
      steps[0].disabled = selected === 0;
      steps[1].disabled = selected === cards.length - 1;
      onSelect(films[selected].id);
    }
    revealSelection = shouldReveal;
    if (shouldReveal) reveal(cards[selected]);
  }

  // 只在鼠标实际移动时换焦，卡片展开时不会触发其下方另一张卡片。
  viewport.addEventListener("pointermove", (event) => {
    const card = event.target.closest(".spotlight-card");
    if (card && event.pointerType === "mouse" && Number(card.dataset.position) !== selected) {
      choose(Number(card.dataset.position), false);
    }
  });
  viewport.addEventListener("focusin", (event) => {
    const card = event.target.closest(".spotlight-card");
    if (card) choose(Number(card.dataset.position), true);
  });
  viewport.addEventListener("keydown", (event) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const next = cards[selected + direction];
    if (next) {
      event.preventDefault();
      next.focus({ preventScroll: true });
    }
  });
  viewport.addEventListener("transitionend", (event) => {
    if (revealSelection && event.target === cards[selected] && event.propertyName === "flex-basis") {
      reveal(cards[selected]);
    }
  });
  for (const step of steps) {
    step.addEventListener("click", () => choose(selected + Number(step.dataset.step), true));
  }
  choose(Math.max(0, films.findIndex(({ id }) => id === preferredId)), true);
}
