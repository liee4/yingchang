import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fixture, film, review, login } from './helpers.mjs';
import { checkExisting } from '../scripts/startup.mjs';

test('rich metadata clears and persists without changing review associations', async t => {
  const box=await fixture(t), {server}=box; await login(server);
  const rich={...film(99,'完整资料'),year:2024,posterId:103,originalTitle:'Original',region:'中国',language:'普通话',duration:'25 分钟',tagline:'一句话',artworkKind:'官方海报',highlights:['看点'],chapters:['第一集'],styles:['风光长镜'],sources:[{label:'来源',url:'https://www.cctv.com/'}]};
  assert.equal((await server.request('admin/films','POST',rich)).status,200);
  await server.request('reviews','POST',review(99));
  const result=await server.request('admin/films/99','PATCH',{...rich,title:'改名后',year:null,posterId:null,highlights:[],chapters:[],sources:[],tagline:''});
  assert.equal(result.status,200); const saved=result.data.films.find(f=>f.id===99);
  for(const field of ['year','posterId','highlights','sources','tagline'])assert.equal(saved[field],undefined);
  assert.equal(saved.summary.count,1); assert.equal(result.data.reviews.find(r=>r.filmId===99).overallScore,4.25);
  assert.equal((await server.request('admin/films/99','PATCH',{sources:[{label:'非法',url:'javascript:alert(1)'}]})).status,400);
  await server.stop(); const restarted=await box.start();
  const restored=(await restarted.request('catalog')).data.films.find(f=>f.id===99);
  assert.equal(restored.title,'改名后');
  assert.deepEqual(restored.styles,['风光长镜']);
});

test('C++ supplies edition filters, dimension means, chart totals and consistent backup', async t => {
  const box=await fixture(t,{contentEdition:2,films:[film(1,'真实影片'),{...film(2,'演示影片'),isDemoFilm:true}],reviews:[{...review(1),isSample:true}]});
  const {server}=box;
  assert.deepEqual((await server.request('search?edition=real')).data.filmIds,[1]);
  assert.deepEqual((await server.request('search?edition=demo')).data.filmIds,[2]);
  assert.equal((await server.request('search?edition=invalid')).status,400);
  const catalog=(await server.request('catalog')).data;
  assert.deepEqual(catalog.films[0].summary.dimensions,{content:5,image:4,narration:3});
  assert.deepEqual(catalog.films[1].summary.dimensions,{content:null,image:null,narration:null});
  assert.equal((await server.request('admin/backup','POST')).status,403);
  await login(server);
  const stats=(await server.request('admin/distribution','POST',{cutoffs:'3 4'})).data;
  assert.deepEqual(stats.totals,[0,0,1]); assert.deepEqual(stats.percentages,[0,0,100]);
  assert.equal(stats.sampleCount,1); assert.equal(stats.total,1);
  const backup=(await server.request('admin/backup','POST')).data;
  for(const name of ['documentaries.txt','reviews.txt','users.txt'])assert.equal(await readFile(join(backup.directory,name),'utf8'),await readFile(join(box.dataDirectory,name),'utf8'));
  assert.equal(JSON.parse(await readFile(join(backup.directory,'manifest.json'),'utf8')).reviews,1);
});

test('three failed logins end the attempt and allow a fresh attempt', async t => {
  const {server}=await fixture(t), client=server.client();
  for(const remaining of [2,1,0]) {
    const result=await client.request('auth/login','POST',{account:'admin',password:'wrong123'});
    assert.equal(result.status,401); assert.equal(result.data.remaining,remaining);
  }
  assert.equal((await client.request('catalog')).status,401);
  assert.equal((await client.request('auth/login','POST',{account:'admin',password:'admin123'})).status,200);
});

test('startup reuses matching data and rejects a foreign occupied port', async t => {
  const box=await fixture(t), previous=process.env.YINGCHANG_DATA_DIR; process.env.YINGCHANG_DATA_DIR=box.dataDirectory;
  try {assert.equal(await checkExisting(Number(new URL(box.server.url).port),'127.0.0.1'),true);}
  finally {if(previous===undefined)delete process.env.YINGCHANG_DATA_DIR;else process.env.YINGCHANG_DATA_DIR=previous;}
  const foreign=createServer((req,res)=>res.writeHead(200).end('foreign'));
  await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));
  try {await assert.rejects(checkExisting(foreign.address().port,'127.0.0.1'),/占用/);} finally {await new Promise(resolve=>foreign.close(resolve));}
});
