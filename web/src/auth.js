import { escapeHtml as html, request, filmLink } from "./ui.js";

export function mountAuth(main, registering, onSuccess, registered = false) {
  main.innerHTML = `<section class="auth-shell" aria-label="映场账号">
    <div class="auth-story"><span class="auth-kicker">DOCUMENTARY SCREENING WEEK</span>
      <div class="auth-story-copy"><img src="./icons/wordmark.svg" alt="映场" class="auth-wordmark">
        <h1>让真实，<br>在此相映。</h1><p>山海有回声，人间有故事。<br>找到你想看的那一部，留下属于你的目光。</p></div>
      <span class="auth-footnote">一方银幕 · 万千世界</span></div>
    <div class="auth-panel"><div class="auth-tabs"><a href="#/login" ${!registering ? 'aria-current="page"' : ''}>登录</a><a href="#/register" ${registering ? 'aria-current="page"' : ''}>注册</a></div>
      <p class="eyebrow">YOUR SEAT IS WAITING</p><h2>${registering ? "初次见面，欢迎入场" : "好故事，等你入场"}</h2>
      <p class="auth-description">${registering ? "建立你的观影档案，记录每一次真实的感动。" : "登录你的账号，继续探索纪录片的世界。"}</p>
      ${registered && !registering ? '<p class="registration-notice" role="status">注册成功，请输入账号和密码登录。</p>' : ''}
      <form class="field-stack auth-form">
        ${registering ? `<fieldset class="account-roles"><legend>注册身份</legend><label><input type="radio" name="role" value="viewer" checked><span>普通观众</span></label><label><input type="radio" name="role" value="admin"><span>管理员</span></label></fieldset>
        <label for="display-name">昵称</label><input id="display-name" name="displayName" maxlength="24" placeholder="在映场，怎么称呼你" autocomplete="nickname" required>` : ''}
        <label for="account">账号</label><input id="account" name="account" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="3–24 位字母、数字或下划线" autocomplete="username" required>
        <label for="password">密码</label><div class="password-field"><input id="password" name="password" type="password" minlength="8" maxlength="128" placeholder="至少 8 个字符" autocomplete="${registering ? 'new-password' : 'current-password'}" required><button type="button" class="password-toggle" aria-label="显示密码" aria-pressed="false">显示</button></div>
        ${registering ? `<label for="confirm-password">确认密码</label><input id="confirm-password" name="confirmPassword" type="password" minlength="8" maxlength="128" placeholder="再次输入密码" autocomplete="new-password" required>
        <div id="invite-field" hidden><label for="invite-code">管理员邀请码</label><input id="invite-code" name="inviteCode" maxlength="24" placeholder="由已有管理员提供" autocomplete="off"><p class="field-hint">管理员可在「我的账户」生成邀请码，24 小时内有效，仅可使用一次。</p></div>` : ''}
        <button class="submit" type="submit">${registering ? '创建账号' : '登录映场'} <span aria-hidden="true">↗</span></button><p class="form-status" role="status"></p>
      </form><p class="auth-bottom">${registering ? '已有账号？<a href="#/login">直接登录</a>' : '还没有账号？<a href="#/register">注册一个</a>'}</p>
    </div></section>`;
  const form = main.querySelector("form"), status = form.querySelector("[role=status]"), submit = form.querySelector("[type=submit]");
  form.querySelector(".password-toggle").addEventListener("click", (event) => {
    const visible = form.elements.password.type === "password";
    form.elements.password.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "隐藏" : "显示";
    event.currentTarget.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
    event.currentTarget.setAttribute("aria-pressed", String(visible));
  });
  form.addEventListener("change", () => {
    if (!registering) return;
    const admin = form.elements.role.value === "admin";
    form.querySelector("#invite-field").hidden = !admin; form.elements.inviteCode.required = admin;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); status.textContent = "";
    const body = Object.fromEntries(new FormData(form));
    if (registering && body.password !== body.confirmPassword) { status.textContent = "两次输入的密码不一致。"; form.elements.confirmPassword.focus(); return; }
    submit.disabled = true;
    try { const result = await request(`auth/${registering ? 'register' : 'login'}`, "POST", body); await onSuccess(result); }
    catch (error) {
      if (!registering && error.remaining === 0) {
        form.innerHTML = `<div class="login-ended" role="alert"><h3>本次登录已结束</h3><p>连续三次账号或密码错误，已返回入场入口。</p><a class="submit" href="#/login" id="retry-login">重新登录</a></div>`;
        form.querySelector('#retry-login').addEventListener('click', event => { event.preventDefault(); mountAuth(main, false, onSuccess); });
        history.replaceState(null, '', '#/');
      } else status.textContent = error.message + (Number.isInteger(error.remaining) ? ` 本次还可尝试 ${error.remaining} 次。` : '');
    }
    finally { submit.disabled = false; }
  });
}

export function mountAccount(main, state) {
  const user = state.user, mine = state.reviews.filter((review) => review.own);
  main.innerHTML = `<section class="account-page"><a class="back-link" href="#/catalog">← 返回片目</a>
    <div class="account-heading"><span class="avatar large">${html(user.displayName[0])}</span><div><p class="eyebrow">MY SCREENING JOURNAL</p><h1>${html(user.displayName)}</h1><p class="field-hint">@${html(user.account)} · ${user.role === 'admin' ? '管理员' : '普通观众'}</p></div></div>
    <p class="field-hint">每部影片保留你的一条评价，再次提交会更新原评价。</p>
    ${state.admin ? `<section class="invite-panel"><div><h2>邀请一位管理员</h2><p class="field-hint">生成一次性邀请码，新管理员在注册时填写即可。</p></div><button type="button" class="submit" id="create-invite">生成邀请码</button><div id="invite-result" role="status"></div></section>` : ''}
    <h2 class="journal-heading">我的评价 <small>${mine.length}</small></h2><div class="journal-list">${mine.length ? mine.map((review) => { const film = state.films.find(({id}) => id === review.filmId); return `<a class="journal-entry" href="${filmLink(film)}"><div><h3>${html(film.title)}</h3><p>${html(review.comment || '已留下评分')}</p></div><span class="rating">${review.overallScore.toFixed(2)} <small>↗</small></span></a>`; }).join('') : '<p class="empty">观影记录从一次评价开始。<a class="text-link" href="#/catalog">去挑一部影片 ↗</a></p>'}</div></section>`;
  main.querySelector("#create-invite")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; button.disabled = true;
    const output = main.querySelector("#invite-result");
    try { const {code} = await request("admin/invites", "POST"); output.innerHTML = `<label>管理员邀请码<input readonly value="${html(code)}" aria-label="管理员邀请码"></label><p class="field-hint">24 小时内有效，使用一次后失效。点击邀请码可选中复制。</p>`; output.querySelector("input").addEventListener("click", (e) => e.target.select()); }
    catch (error) { output.textContent = error.message; } finally { button.disabled = false; }
  });
}
