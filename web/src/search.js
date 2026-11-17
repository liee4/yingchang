import {escapeHtml as html,filmLink,poster} from "./ui.js";
export function mountSearch({search,state,showCatalog,renderCatalogResults,main}){
  const box=document.querySelector('#search-suggestions');
  let timer,composing=false,index=-1;
  function close(){box.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');index=-1;}
  function render(matches){
    index=-1;const show=search.value.trim() && document.activeElement===search;
    box.innerHTML=matches.slice(0,5).map((film,i)=>`<a id="suggestion-${i}" role="option" aria-selected="false" href="${filmLink(film)}">${poster(film)}<span><strong>${html(film.title)}</strong><small>${html(film.director||film.category)} · ${film.episodes} 集</small></span><span aria-hidden="true">↗</span></a>`).join('') || '<p>没有匹配影片，试试其他关键词。</p>';
    box.hidden=!show;search.setAttribute('aria-expanded',String(Boolean(show)));
  }
  function schedule(){document.querySelector('#search-clear').hidden=!search.value;clearTimeout(timer);close();if(!composing)timer=setTimeout(renderCatalogResults,180);}
  function reset(){search.value='';state.category='全部';state.spotlightId=null;close();document.querySelector('#search-clear').hidden=true;showCatalog();search.focus();}
  search.addEventListener('input',schedule);
  search.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});
  search.addEventListener('compositionend',()=>{composing=false;schedule();});
  search.addEventListener('focus',()=>{if(search.value.trim())renderCatalogResults();});
  search.addEventListener('keydown',(event)=>{
    if(event.isComposing)return;const options=[...box.querySelectorAll('[role=option]')];
    if(['ArrowDown','ArrowUp'].includes(event.key)&&!box.hidden&&options.length){
      event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));search.setAttribute('aria-activedescendant',options[index].id);
    }else if(event.key==='Enter'){
      event.preventDefault();clearTimeout(timer);
      if(index>=0&&!box.hidden)location.hash=options[index].getAttribute('href');
      else{renderCatalogResults();search.blur();document.querySelector('#catalog-status')?.scrollIntoView({block:'nearest'});}close();
    }else if(event.key==='Escape'){close();search.blur();}
  });
  document.querySelector('#search-clear').addEventListener('click',reset);
  main.addEventListener('click',(event)=>{if(event.target.closest('#reset-search'))reset();});
  document.addEventListener('click',(event)=>{if(!event.target.closest('#search'))close();if(!event.target.closest('#account-menu'))document.querySelector('#account-menu').open=false;});
  document.addEventListener('focusin',(event)=>{if(!event.target.closest('#search'))close();});
  document.addEventListener('keydown',(event)=>{
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&!document.querySelector('#search').hidden){event.preventDefault();search.focus();}
    if(event.key==='Escape')document.querySelector('#account-menu').open=false;
  });
  window.addEventListener('hashchange',()=>{clearTimeout(timer);close();});
  return {render,close};
}
