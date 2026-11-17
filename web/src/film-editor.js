import { escapeHtml as html, poster } from './ui.js';
import { preferenceChoices, visualStyles } from './preferences.js';

const input = (film, name, label, limit = 80) => `<label>${label}<input name="${name}" maxlength="${limit}" value="${html(film?.[name])}" ${name === 'title' ? 'required' : ''}></label>`;

export function filmEditor(film, films) {
  const covers = [...new Map([...films].reverse().filter(f => f.posterId).map(f => [f.posterId, f])).values()];
  return `<h2 id="admin-dialog-title">${film ? '修改片目' : '新增片目'}</h2>
    <p class="field-hint">资料保存后会同步到片库与详情页。片号关联评价，创建后保持不变。</p>
    <form class="field-stack film-editor">
      <fieldset><legend>基本资料</legend><div class="field-grid">
        <label>片目编号<input name="id" type="number" step="1" value="${film?.id ?? ''}" ${film ? 'readonly' : 'required'}></label>
        <label>集数<input name="episodes" type="number" min="1" step="1" value="${film?.episodes ?? 1}" required></label>
        ${input(film, 'title', '片名', 120)}${input(film, 'category', '类别', 50)}
        ${input(film, 'director', '导演（未核实请注明）', 120)}${input(film, 'crew', '主创 / 制片团队', 200)}
        ${input(film, 'originalTitle', '原名', 120)}<label>年份<input name="year" type="number" min="1800" max="2200" step="1" value="${film?.year ?? ''}"></label>
        ${input(film, 'region', '地区')}${input(film, 'language', '语言')}${input(film, 'duration', '单集时长')}
      </div><label class="check-field"><input name="isDemoFilm" type="checkbox" ${film?.isDemoFilm ? 'checked' : ''}>标为旧版演示片目</label></fieldset>
      <fieldset><legend>画面风格</legend>${preferenceChoices("styles", visualStyles, film?.styles ?? [])}</fieldset>
      <fieldset><legend>影片介绍</legend>
        ${input(film, 'tagline', '一句话推荐', 160)}
        <label>完整简介<textarea name="synopsis" maxlength="1200" rows="6">${html(film?.synopsis)}</textarea></label>
        <label>值得关注 · 每行一条，最多 6 条<textarea name="highlights" rows="4">${html(film?.highlights?.join('\n'))}</textarea></label>
        <label>分集目录 · 每行一集，最多 100 条<textarea name="chapters" rows="5">${html(film?.chapters?.join('\n'))}</textarea></label>
        <p class="field-hint">看点和分集每条最多 180 字。只录入部分分集时，详情页会标注「分集选读」。</p>
      </fieldset>
      <fieldset><legend>封面与来源</legend><div class="cover-picker"><div id="editor-cover">${poster(film || {}, 'editor-cover')}</div><div>
        <label>选择本地封面<select name="posterId"><option value="">暂不设置</option>${covers.map(f => `<option value="${f.posterId}" ${film?.posterId === f.posterId ? 'selected' : ''}>${html(f.title)} · ${f.posterId}</option>`).join('')}</select></label>
        ${input(film, 'artworkKind', '封面说明（官方海报 / 主题插画）', 40)}
        <p class="field-hint">封面保存在本地，离线也可显示。更换时请如实标注图片性质。</p></div></div>
        <p class="field-hint">资料来源最多 4 条，填写名称和完整的 http / https 链接；留空可删除。</p>
        ${Array.from({length:4}, (_, i) => `<div class="source-row"><label>来源 ${i + 1} 名称<input name="sourceLabel${i}" maxlength="120" value="${html(film?.sources?.[i]?.label)}"></label><label>网页地址<input name="sourceUrl${i}" type="url" maxlength="2000" value="${html(film?.sources?.[i]?.url)}" placeholder="https://"></label></div>`).join('')}
      </fieldset>
      <p class="form-status" role="status"></p><div class="dialog-actions"><button class="quiet-button" type="button" data-close>取消</button><button class="submit" type="submit">保存片目</button></div>
    </form>`;
}

export function bindFilmEditor(form, films) {
  form.elements.posterId.addEventListener('change', () => {
    const selected = films.find(f => f.posterId === Number(form.elements.posterId.value));
    form.querySelector('#editor-cover').innerHTML = poster(selected || {}, 'editor-cover');
    form.elements.artworkKind.value = selected?.artworkKind || '';
  });
}

export function readFilmEditor(form) {
  const fields = new FormData(form);
  const data = Object.fromEntries(fields);
  const payload = {};
  for (const key of ['title','category','director','crew','originalTitle','region','language','duration','tagline','synopsis','artworkKind']) payload[key] = data[key].trim();
  payload.id = form.elements.id.valueAsNumber; payload.episodes = form.elements.episodes.valueAsNumber;
  payload.year = data.year ? Number(data.year) : null;
  payload.posterId = data.posterId ? Number(data.posterId) : null;
  payload.isDemoFilm = form.elements.isDemoFilm.checked;
  payload.styles = fields.getAll("styles");
  for (const key of ['highlights','chapters']) payload[key] = data[key].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  payload.sources = [];
  for (let i = 0; i < 4; i++) {
    const label = data[`sourceLabel${i}`].trim(), url = data[`sourceUrl${i}`].trim();
    if (label || url) payload.sources.push({label, url});
  }
  return payload;
}
