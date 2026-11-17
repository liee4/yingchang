import { escapeHtml } from "./ui.js";

export const visualStyles = ["风光长镜", "纪实跟拍", "细节特写", "夜景光影"];
export const emptyPreferences = { topics: [], styles: [] };

export function filmTopics(films) {
  return [...new Set(films.map((film) => film.category).filter(Boolean))];
}

export function recommendFilms(films, { topics, styles }) {
  const selectedGroups = Number(Boolean(topics.length)) + Number(Boolean(styles.length));
  const matches = films.map((film) => {
    const topic = topics.includes(film.category);
    const matchingStyles = (film.styles ?? []).filter((style) => styles.includes(style));
    return {
      film,
      score: Number(topic) + Number(Boolean(matchingStyles.length)),
      labels: [...(topic ? [film.category] : []), ...matchingStyles],
    };
  });
  const best = Math.max(0, ...matches.map(({ score }) => score));
  if (!best) return { films, mode: "none", reasons: new Map() };

  const recommended = matches.filter(({ score }) => score === best)
    .sort((a, b) => Number(Boolean(b.film.posterId)) - Number(Boolean(a.film.posterId)));
  return {
    films: recommended.map(({ film }) => film),
    mode: best === selectedGroups ? "exact" : "partial",
    reasons: new Map(recommended.map(({ film, labels }) => [film.id, labels])),
  };
}

export function preferenceChoices(name, options, selected) {
  return `<div class="preference-choices">${options.map((option) => `
    <label class="preference-choice">
      <input type="checkbox" name="${name}" value="${escapeHtml(option)}" ${selected.includes(option) ? "checked" : ""}>
      ${escapeHtml(option)}
    </label>`).join("")}</div>`;
}

const bubbleArt = new Map([
  ["自然", [1, 190]], ["人文", [112, 33]], ["科学", [5, 224]], ["美食", [10, 64]], ["历史", [2, 42]],
  ["风光长镜", [4, 204]], ["纪实跟拍", [10, 72]], ["细节特写", [3, 26]], ["夜景光影", [8, 236]],
]);

function preferenceBubbles(name, options, selected) {
  return options.map((option, index) => {
    const [posterId, hue] = bubbleArt.get(option) ?? [null, 36 + index * 47];
    const image = posterId && new URL(`../posters/${posterId}.webp`, import.meta.url);
    const art = image ? `--bubble-image: url('${image}');` : "";
    const delay = Math.min(index, 5) * 145;
    const phase = index * 1130;
    const period = 5800 + (index % 4) * 670;
    return `<label class="preference-bubble" style="${art} --bubble-hue: ${hue}; --bubble-delay: ${delay}ms; --bubble-phase: -${phase}ms; --bubble-period: ${period}ms">
      <input type="checkbox" name="${name}" value="${escapeHtml(option)}" ${selected.includes(option) ? "checked" : ""}>
      <span class="bubble-entry"><span class="bubble-orb">
        <span class="bubble-text">${escapeHtml(option)}</span>
        <span class="bubble-check" aria-hidden="true">✓</span>
      </span></span>
    </label>`;
  }).join("");
}

export function showPreferences(main, { topics, draft, styleStep, onNext, onSkip }) {
  const title = styleStep ? "画面风格" : "影片题材";
  const name = styleStep ? "styles" : "topics";
  const options = styleStep ? visualStyles : topics;
  const hint = options.length ? `点选你喜欢的${title}，可多选。` : "暂无影片题材，可以继续选择画面风格。";
  main.innerHTML = `
    <section class="preferences-entry" aria-labelledby="preferences-title">
      <header class="preferences-heading">
        <h1 id="preferences-title">${title}</h1>
        <p class="field-hint">${hint}</p>
      </header>
      <form class="preferences-form">
        <div class="preference-bubbles" role="group" aria-labelledby="preferences-title">
          ${preferenceBubbles(name, options, draft[name])}
        </div>
        <div class="preference-actions">
          ${styleStep ? '<a class="quiet-button" href="#/preferences">上一步</a>' : '<button class="quiet-button" type="button" id="skip-preferences">跳过设置</button>'}
          <button class="submit" type="submit">${styleStep ? "查看推荐" : "下一步"}<span class="icon icon-arrow" aria-hidden="true"></span></button>
        </div>
      </form>
    </section>`;
  const form = main.querySelector("form");
  const status = document.createElement("p");
  status.className = "form-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  form.append(status);
  const buttons = Array.from(form.querySelectorAll("button"));
  async function run(action) {
    buttons.forEach((button) => { button.disabled = true; });
    status.hidden = true;
    try { await action(); }
    catch (error) { status.textContent = error.message; status.hidden = false; }
    finally { buttons.forEach((button) => { button.disabled = false; }); }
  }
  const updateDraft = () => { draft[name] = new FormData(form).getAll(name); };
  form.addEventListener("change", updateDraft);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateDraft();
    run(onNext);
  });
  form.querySelector("#skip-preferences")?.addEventListener("click", () => run(onSkip));
}
