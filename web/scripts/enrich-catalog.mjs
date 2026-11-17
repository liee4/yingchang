// Optional, repeatable enrichment through HTTP -> C++. Never rewrites live business files.
import {readFile} from 'node:fs/promises';
const patches=JSON.parse(await readFile(new URL('../../resources/credits-enrichment.json',import.meta.url),'utf8'));
const address=process.env.YINGCHANG_URL || 'http://127.0.0.1:4173/';
let cookie='';
async function api(path,method='GET',body){
  const response=await fetch(new URL(`api/${path}`,address),{method,headers:{Cookie:cookie,...(body ? {'Content-Type':'application/json'} : {})},body:body ? JSON.stringify(body) : undefined});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
await api('auth/login','POST',{account:process.env.YINGCHANG_ADMIN_ACCOUNT || 'admin',password:process.env.YINGCHANG_ADMIN_PASSWORD || 'admin123'});
await api('admin/backup','POST');
const catalog=await api('catalog');let changed=0;
for(const patch of patches){
  const film=catalog.films.find(f=>f.id===patch.id);
  if(!film || film.title!==patch.title || film.director)continue;
  const sources=[...(film.sources || [])];if(!sources.some(s=>s.url===patch.source.url)&&sources.length<4)sources.push(patch.source);
  await api(`admin/films/${film.id}`,'PATCH',{director:patch.director,...(patch.crew ? {crew:patch.crew} : {}),sources});changed++;
}
console.log(`已通过 C++ 补充 ${changed} 部片目的缺失署名；已有署名、片号与评价保持原值。`);
