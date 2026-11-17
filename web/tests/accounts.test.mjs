import assert from "node:assert/strict";
import test from "node:test";
import {readFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fixture,login,review,film} from "./helpers.mjs";
const signup=(account,extra={})=>({account,password:'validpass123',displayName:'新观众',...extra});

test('accounts authenticate both roles, bind review identity and survive restart',async(t)=>{
  const box=await fixture(t),server=box.server,client=server.client();
  for(const path of ['catalog','search?query=自然','rankings'])assert.equal((await client.request(path)).status,401);
  assert.equal((await client.request('reviews','POST',review())).status,401);
  const registered=await client.request('auth/register','POST',signup('Hello_User'));
  assert.equal(registered.status,200);assert.deepEqual(registered.data,{registered:true});
  assert.equal((await client.request('auth/me')).data.user,null);
  const credentials={account:'HELLO_USER',password:'validpass123'};
  const loggedIn=await client.request('auth/login','POST',credentials);
  assert.deepEqual(loggedIn.data.user,{account:'hello_user',displayName:'新观众',role:'viewer'});
  assert.equal((await client.request('admin/films','POST',film(99))).status,403);
  assert.equal((await client.request('reviews/import','POST',[])).status,403);
  const submitted=await client.request('reviews','POST',review(2,'U1'));
  assert.equal(submitted.data.reviews[0].own,true);
  assert.equal(submitted.data.reviews[0].viewerName,'新观众');
  assert.doesNotMatch(JSON.stringify(submitted.data),/viewerId|passwordHash|salt/);
  const updated=await client.request('reviews','POST',review(2,'someone_else',5));
  assert.equal(updated.data.replaced,true);assert.equal(updated.data.reviews.length,1);
  assert.equal(updated.data.reviews[0].own,true);
  const file=await readFile(join(box.dataDirectory,'users.txt'),'utf8');
  assert.doesNotMatch(file,/validpass123|admin123/);assert.match(file,/passwordHash/);
  await client.request('auth/logout','POST');assert.equal((await client.request('catalog')).status,401);
  assert.equal((await client.request('auth/register','POST',signup('HELLO_USER'))).status,400);
  await server.stop();const restarted=await box.start();const fresh=restarted.client();
  assert.equal((await fresh.request('auth/login','POST',{account:'HELLO_USER',password:'wrong123'})).status,401);
  const logged=await fresh.request('auth/login','POST',credentials);
  assert.equal(logged.status,200);
  assert.equal((await fresh.request('catalog')).data.reviews[0].own,true);
});

test('administrator invitations are required, single use and committed with registration',async(t)=>{
  const {server}=await fixture(t),client=server.client();
  assert.equal((await client.request('auth/register','POST',signup('fake_admin',{role:'admin'}))).status,400);
  assert.equal((await server.request('admin/invites','POST')).status,403);
  await login(server);
  const invite=await server.request('admin/invites','POST');assert.equal(invite.status,200);
  const registered=await client.request('auth/register','POST',signup('new_admin',{role:'admin',inviteCode:invite.data.code.toLowerCase()}));
  assert.equal(registered.status,200);assert.equal((await client.request('auth/me')).data.user,null);
  const logged=await client.request('auth/login','POST',{account:'new_admin',password:'validpass123'});
  assert.equal(logged.status,200);assert.equal(logged.data.admin,true);
  assert.equal((await client.request('admin/films','POST',film(99))).status,200);
  const another=server.client();
  assert.equal((await another.request('auth/register','POST',signup('second_admin',{role:'admin',inviteCode:invite.data.code}))).status,400);
});

test('viewers clear only their own comment and admin clears any comment while keeping scores',async(t)=>{
  const {server}=await fixture(t), first=server.client(), second=server.client();
  for (const [client, account, displayName] of [[first,'first_viewer','甲昵称'],[second,'second_viewer','乙昵称']]) {
    assert.equal((await client.request('auth/register','POST',signup(account,{displayName}))).status,200);
    assert.equal((await client.request('auth/login','POST',{account,password:'validpass123'})).status,200);
  }
  await first.request('reviews','POST',{...review(),comment:'甲短评'});
  await login(server);
  const adminCatalog=(await server.request('catalog')).data;
  const firstId=adminCatalog.reviews[0].viewerId;
  assert.match(firstId,/^V[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(adminCatalog.reviews),/viewerName|甲昵称/);
  assert.equal((await second.request('reviews/comment','DELETE',{filmId:2,viewerId:firstId})).status,404);
  assert.equal((await second.request('admin/reviews/comment','DELETE',{filmId:2,viewerId:firstId})).status,403);
  await second.request('reviews','POST',{...review(),viewerId:firstId,comment:'乙短评'});
  const cleared=await first.request('reviews/comment','DELETE',{filmId:2});
  assert.equal(cleared.status,200);
  assert.equal(cleared.data.reviews.find(r=>r.own).comment,'');
  assert.equal(cleared.data.reviews.find(r=>!r.own).comment,'乙短评');
  assert.equal(cleared.data.reviews.find(r=>r.own).overallScore,4.25);
  assert.equal(cleared.data.films.find(f=>f.id===2).summary.count,2);
  const secondId=(await server.request('catalog')).data.reviews.find(r=>r.comment==='乙短评').viewerId;
  assert.notEqual(firstId,secondId);
  assert.equal((await server.request('admin/reviews/comment','DELETE',{filmId:2,viewerId:secondId})).status,200);
  const viewerCatalog=(await second.request('catalog')).data;
  assert(viewerCatalog.reviews.every(r=>r.comment==='' && r.overallScore===4.25));
  assert.doesNotMatch(JSON.stringify(viewerCatalog),/viewerId/);
});

test('failed account writes preserve stored users and reject registration',async(t)=>{
  const box=await fixture(t);const before=await readFile(join(box.dataDirectory,'users.txt'),'utf8');
  await mkdir(join(box.dataDirectory,'users.txt.tmp'));
  const client=box.server.client();
  assert.equal((await client.request('auth/register','POST',signup('unsaved_user'))).status,500);
  assert.equal(await readFile(join(box.dataDirectory,'users.txt'),'utf8'),before);
  assert.equal((await client.request('auth/me')).data.user,null);
});

test("viewer activity is private per account, persists and blocks stale identities", async (t) => {
  const box = await fixture(t);
  const { server } = box;
  const first = server.client(), second = server.client(), guest = server.client();
  const password = "validpass123";
  const signIn = (client, account) => client.request("auth/login", "POST", { account, password });
  for (const [client, account] of [[first, "private_first"], [second, "private_second"]]) {
    assert.equal((await client.request("auth/register", "POST", signup(account))).status, 200);
    assert.equal((await signIn(client, account)).status, 200);
  }
  const path = "account/activity";
  const emptyActivity = { favorites: [], history: [], preferences: { topics: [], styles: [] } };
  await first.request(path, "PATCH", { action: "favorite", filmId: 2 });
  await first.request(path, "PATCH", { action: "visit", filmId: 2 });
  const changed = await first.request(path, "PATCH", { action: "preferences", topics: ["自然"], styles: ["风光长镜"] });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.favorites, [2]);
  assert.deepEqual(changed.data.history.map(({ filmId }) => filmId), [2]);
  assert.deepEqual(changed.data.preferences, { topics: ["自然"], styles: ["风光长镜"] });
  assert.deepEqual((await second.request(path)).data, emptyActivity);
  assert.equal((await second.request(path, "PATCH", { action: "favorite", filmId: 8 }, { "X-Yingchang-Account": "viewer:private_first" })).status, 401);
  assert.deepEqual((await second.request(path)).data, emptyActivity);
  assert.equal((await second.request("reviews", "POST", review(), { "X-Yingchang-Account": "viewer:private_first" })).status, 401);
  await second.request(path, "PATCH", { action: "favorite", filmId: 8, account: "private_first" });
  await second.request(path, "PATCH", { action: "clearHistory", account: "private_first" });
  assert.deepEqual((await first.request(path)).data, changed.data);
  assert.equal((await guest.request(path)).status, 401);
  await login(server);
  assert.equal((await server.request(path)).status, 403);
  assert.equal((await server.request(path, "PATCH", { action: "clearHistory" })).status, 403);
  const adminCatalog = (await server.request("catalog")).data;
  assert.doesNotMatch(JSON.stringify(adminCatalog), /favorites|visitedAt|preferences/);
  await server.stop();
  const restarted = await box.start(), returning = restarted.client();
  assert.equal((await signIn(returning, "private_first")).status, 200);
  assert.deepEqual((await returning.request(path)).data, changed.data);
});

test('C++ search matches multiple fields, combined keywords, relevance and exact mode',async(t)=>{
  const {server}=await fixture(t,{contentEdition:2,films:[{...film(1,'森林日记'),director:'李明',originalTitle:'Forest Journal',synopsis:'雨林里的人与自然'},{...film(2,'城市记忆'),director:'王华',synopsis:'森林旁边的城市'}],reviews:[]});
  for(const query of ['李明','FOREST','自然 李明','1'])assert.deepEqual((await server.request(`search?query=${encodeURIComponent(query)}`)).data.filmIds,[1]);
  assert.deepEqual((await server.request('search?query=森林')).data.filmIds,[1,2]);
  assert.deepEqual((await server.request('search?query=森林&exact=true')).data.filmIds,[]);
  assert.deepEqual((await server.request('search?query=森林日记&exact=true')).data.filmIds,[1]);
});
