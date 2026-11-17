import { bindRequestAccount, escapeHtml as html, request, updateCatalog, filmLink } from "./ui.js";
import { mountAuth, mountAccount } from "./auth.js";
import { mountAdmin } from "./admin.js";
import { showFilmActivity } from "./activity.js";
import { emptyPreferences, filmTopics, showPreferences } from "./preferences.js";

export function createNavigation({ main, state, showCatalog, showRanking, showFilm, closeSuggestions }) {
  let returnRoute = "#/catalog", routeSequence = 0;
  let registrationComplete = false, preferenceDraft = null;
  const sessionEvents = typeof BroadcastChannel === "function" ? new BroadcastChannel("yingchang-account-session") : null;
  const changeActivity = (change) => request("account/activity", "PATCH", change);

  async function finishPreferences(preferences) {
    const page = main.querySelector(".preferences-form");
    const updated = await changeActivity({ action: "preferences", ...preferences });
    if (!main.contains(page)) return;
    state.activity = updated;
    state.spotlightId = null;
    state.catalogScroll = 0;
    location.replace("#/catalog");
  }
  function expireSession() {
    routeSequence += 1;
    preferenceDraft = null;
    returnRoute = "#/catalog";
    bindRequestAccount(null);
    Object.assign(state, {
      user: null, admin: false, films: [], reviews: [], rankings: {}, activity: null,
      category: "全部", metric: "overall", catalogScroll: 0, spotlightId: null, restoreCatalog: false,
    });
    document.querySelector("#search-title").value = "";
    document.querySelector("#search-clear").hidden = true;
    document.querySelector("#account-summary").replaceChildren();
    document.querySelector("#account-role").textContent = "";
    location.replace("#/login"); showRoute();
  }
  window.addEventListener("session-expired", expireSession);
  function reloadSession() {
    history.replaceState(null, "", "#/login");
    location.reload();
  }
  if (sessionEvents) sessionEvents.onmessage = reloadSession;
  window.addEventListener("pageshow", (event) => { if (event.persisted) reloadSession(); });

  function showRoute(restoreFocus=false) {
    const route=location.hash || "#/";
    const authPage=["#/","#/login","#/register","#/admin/login"].includes(route);
    const styleStep = route === "#/preferences/styles";
    const preferencePage = styleStep || route === "#/preferences";
    if (!preferencePage) preferenceDraft = null;
    if(!state.user && !authPage){returnRoute=route;location.replace("#/login");return;}
    if(state.user && authPage){location.replace("#/catalog");return;}
    if(route==="#/admin" && !state.admin){location.replace("#/catalog");return;}
    const activityPage = route === "#/favorites" || route === "#/history";
    if((preferencePage || activityPage) && state.admin){location.replace("#/catalog");return;}
    const film=state.films.find((film)=>route===filmLink(film)), catalogPage=route==="#/catalog";
    document.querySelector(".navigation").hidden=!state.user;
    document.querySelector(".brand").href=state.user ? "#/catalog" : "#/login";
    document.querySelector("#nav-admin").hidden=!state.admin;
    document.querySelector("#nav-favorites").hidden=!state.user || state.admin;
    document.querySelector("#nav-history").hidden=!state.user || state.admin;
    const menu=document.querySelector("#account-menu");menu.hidden=!state.user;menu.open=false;
    document.querySelector("#account-admin").hidden=!state.admin;
    document.querySelector(".site-header").classList.toggle("viewer-header",Boolean(state.user));
    document.body.classList.toggle("auth-page",authPage);
    if(state.user){
      document.querySelector("#account-summary").innerHTML=`<span class="avatar">${html(Array.from(state.user.displayName)[0])}</span><span class="account-name">${html(state.user.displayName)}</span><span aria-hidden="true">⌄</span>`;
      document.querySelector("#account-role").textContent=`${state.admin?'管理员':'普通观众'} · @${state.user.account}`;
    }
    for(const [control,current] of [["nav-catalog",catalogPage],["nav-ranking",route==="#/ranking"],
      ["nav-favorites",route==="#/favorites"],["nav-history",route==="#/history"],["nav-admin",route==="#/admin"]]){
      const link=document.getElementById(control);if(current)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");
    }
    document.querySelector("#search").hidden=!catalogPage;closeSuggestions();
    document.title=film ? `${film.title} · 映场` : '映场';
    if(authPage) {
      const registering = route === "#/register";
      mountAuth(main, registering, async (result) => {
        if (registering) {
          registrationComplete = true;
          location.replace("#/login");
          return;
        }
        state.user = result.user;
        state.admin = result.admin;
        bindRequestAccount(state.user);
        sessionEvents?.postMessage("changed");
        const destination = returnRoute === "#/admin" && !state.admin ? "#/catalog" : returnRoute;
        location.replace(destination === "#/catalog" && !state.admin ? "#/preferences" : destination);
      }, registrationComplete);
      registrationComplete = false;
    }
    else if(preferencePage) {
      preferenceDraft ??= { ...state.activity.preferences };
      showPreferences(main, {
        topics: filmTopics(state.films), draft: preferenceDraft, styleStep,
        onNext: () => {
          if (styleStep) return finishPreferences(preferenceDraft);
          else location.hash = "#/preferences/styles";
        },
        onSkip: () => finishPreferences(emptyPreferences),
      });
    }
    else if(catalogPage){state.restoreCatalog=restoreFocus;showCatalog();}
    else if(route==="#/ranking")showRanking();
    else if(activityPage)showFilmActivity(main,state.films,route==="#/history",state.activity,changeActivity);
    else if(film)showFilm(film);
    else if(route==="#/account")mountAccount(main,state);
    else if(route==="#/admin")mountAdmin(main,state,expireSession);
    else main.innerHTML='<h1>找不到此片目</h1><a class="back-link" href="#/catalog">返回片目</a>';
    if(restoreFocus){if(!catalogPage)window.scrollTo(0,0);main.focus({preventScroll:true});}
  }
  document.querySelector("#logout").addEventListener("click",async(event)=>{
    const button=event.currentTarget;button.disabled=true;
    try{await request('auth/logout','POST');sessionEvents?.postMessage("changed");expireSession();}
    catch(error){button.textContent=error.message;}finally{button.disabled=false;}
  });
  window.addEventListener('scroll',()=>{if(location.hash==='#/catalog' && !state.restoreCatalog && main.querySelector('.film-card'))state.catalogScroll=window.scrollY;},{passive:true});
  async function loadRoute(restoreFocus = false) {
    const sequence = ++routeSequence;
    const route = location.hash;
    closeSuggestions();
    try{
      if (state.user) {
        const result = await request("catalog");
        if (sequence !== routeSequence) return;
        const film = result.films.find((entry) => route === filmLink(entry));
        const activity = result.admin ? null : film
          ? await changeActivity({ action: "visit", filmId: film.id })
          : await request("account/activity");
        if (sequence !== routeSequence) return;
        updateCatalog(state, result);
        state.activity = activity;
      }
      showRoute(restoreFocus);
    } catch (error) {
      if (sequence === routeSequence) main.innerHTML = `<p class="empty" role="alert">${html(error.message)}</p>`;
    }
  }

  async function start(){
    try{
      Object.assign(state,await request('auth/me'));
      bindRequestAccount(state.user);
      window.addEventListener('hashchange', () => loadRoute(true));
      await loadRoute();
    }catch(error){main.innerHTML=`<p class="empty" role="alert">${html(error.message || '暂时无法连接本地服务，请刷新重试。')}</p>`;}
  }
  return {start,showRoute,expireSession};
}
