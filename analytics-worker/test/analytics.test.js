import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateEvent,reportRange,readEvent,DAY,ORIGIN,coarseClient } from '../src/validation.js';
import { collect,purge } from '../src/store.js';
import { buildReport } from '../src/report.js';
import { verifyAccess } from '../src/auth.js';
import { handle } from '../src/index.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  return {sqlite,
    prepare(sql) {return {bind(...params) {return {sql,params};}};},
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {const result=statements.map(s=>({success:true,results:sqlite.prepare(s.sql).all(...s.params).map(r=>({...r}))}));sqlite.exec('COMMIT');return result;}
      catch(error) {sqlite.exec('ROLLBACK');throw error;}
    }
  };
}
const allowLimiter={async limit(){return {success:true};}};
const client={country:'KR',device:'desktop',browser:'Chrome'};
const NOW=Date.parse('2026-10-23T06:00:00Z');
function event(overrides={}) {return validateEvent({v:1,event:'view',eventId:randomUUID(),viewId:randomUUID(),visitorId:randomUUID(),sessionId:randomUUID(),path:'/blog/posts/example/',title:'테스트 제목',referrer:'',utmSource:'',utmMedium:'',utmCampaign:'',activeMs:0,scrollDepth:0,isReturning:false,sessionStart:true,...overrides});}
function req(body,origin=ORIGIN) {return new Request('https://events.oehnps.co.uk/api/collect',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:JSON.stringify(body)});}

test('collector rejects non-blog paths, identifiers, private referrer paths, spoofed timestamps and invalid metrics',()=>{
  const base=event();
  for(const invalid of [{path:'https://evil.com/'},{path:'/blog/../secret'},{path:'/blog/%3Ftoken=x'},{path:'/blog/a?email=x'},{path:'/blog/%2e%2e/x'},{visitorId:'someone@example.com'},{referrer:'https://google.com/search?q=private'},{referrer:'https://user:pass@google.com'},{timestamp:NOW},{activeMs:-1},{activeMs:DAY+1},{activeMs:NaN},{scrollDepth:101},{isReturning:'yes'}]) assert.throws(()=>validateEvent({...base,...invalid}),{status:400});
  assert.equal(validateEvent({...base,utmSource:'newsletter<script>@x'}).utmSource,'newsletterscriptx');
});

test('body limits work without trusting Content-Length; malformed body is rejected',async()=>{
  await assert.rejects(readEvent(req({padding:'x'.repeat(4096)})),{status:413});
  await assert.rejects(readEvent(new Request('https://a',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{'})),{status:400});
  await assert.rejects(readEvent(new Request('https://a',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}})),{status:415});
});

test('time ranges use KST midnight and equal previous period; invalid leap days and long/future ranges rejected',()=>{
  const range=reportRange(new URL('https://a/api/report?from=2026-10-22&to=2026-10-23'),NOW);
  assert.equal(range.start,Date.parse('2026-10-21T15:00:00Z'));
  assert.equal(range.end,Date.parse('2026-10-23T15:00:00Z'));
  assert.equal(range.range.previousFrom,'2026-10-20');assert.equal(range.range.previousTo,'2026-10-21');
  for(const q of ['from=2026-02-30&to=2026-03-01','from=2025-01-01&to=2026-10-23','from=2026-10-24&to=2026-10-24','from=2026-10-23&to=2026-10-22','device=phone']) assert.throws(()=>reportRange(new URL(`https://a/?${q}`),NOW),{status:400});
});

test('out-of-order engagement creates no view until initial beacon; maxima and dedup keep one view',async()=>{
  const db=database(),e=event({event:'engagement',activeMs:15000,scrollDepth:55,sessionStart:false});
  await collect(db,e,client,NOW);
  assert.equal(db.sqlite.prepare('SELECT SUM(has_view) AS n FROM pageviews').get().n,0);
  await collect(db,{...e,event:'view',eventId:randomUUID(),activeMs:0,scrollDepth:0,sessionStart:true},client,NOW+1000);
  await collect(db,{...e,eventId:randomUUID(),activeMs:45000,scrollDepth:95},client,NOW+45000);
  await collect(db,{...e,eventId:randomUUID(),activeMs:20000,scrollDepth:20},client,NOW+46000);
  const row=db.sqlite.prepare('SELECT * FROM pageviews').get();
  assert.equal(row.has_view,1);assert.equal(row.active_ms,45000);assert.equal(row.scroll_depth,95);assert.equal(row.occurred_at,NOW);
  assert.equal(row.session_start,1);
  await collect(db,{...e,event:'view',viewId:randomUUID()},client,NOW+50000);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM pageviews').get().n,1,'event ID reused for different view must have no effect');
  assert.ok(!('ip' in row));assert.ok(!('user_agent' in row));
});

test('mismatched visitor/session cannot mutate existing view and clicks are idempotent',async()=>{
  const db=database(),e=event();await collect(db,e,client,NOW);
  await collect(db,{...e,event:'engagement',eventId:randomUUID(),visitorId:randomUUID(),activeMs:5000},client,NOW+5000);
  assert.equal(db.sqlite.prepare('SELECT active_ms FROM pageviews').get().active_ms,0);
  const click={...e,event:'click',eventId:randomUUID(),linkType:'msds',linkHost:'msds.oehnps.co.uk',activeMs:10000};
  await collect(db,click,client,NOW+10000);await collect(db,click,client,NOW+20000);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM clicks').get().n,1);
});

test('active time cannot exceed server elapsed time plus tolerance',async()=>{
  const db=database(),e=event();await collect(db,e,client,NOW);
  await collect(db,{...e,event:'engagement',eventId:randomUUID(),activeMs:1800000},client,NOW+5000);
  assert.equal(db.sqlite.prepare('SELECT active_ms FROM pageviews').get().active_ms,35000);
});

test('report aggregates periods, filters, clicks and zero-filled KST heatmap correctly',async()=>{
  const db=database(),a=event({utmSource:'newsletter',utmMedium:'email',utmCampaign:'october'});
  const b=event({visitorId:a.visitorId,sessionId:a.sessionId,path:'/blog/posts/second/',isReturning:false});
  const c=event({isReturning:true,referrer:'https://search.naver.com'});
  await collect(db,a,client,NOW);
  await collect(db,{...a,event:'engagement',eventId:randomUUID(),activeMs:60000,scrollDepth:95},client,NOW+60000);
  await collect(db,b,client,NOW+70000);
  await collect(db,{...b,event:'engagement',eventId:randomUUID(),activeMs:20000,scrollDepth:50},client,NOW+90000);
  await collect(db,c,{...client,device:'mobile'},NOW+120000);
  await collect(db,{...a,event:'click',eventId:randomUUID(),linkHost:'msds.oehnps.co.uk',linkType:'msds',activeMs:60000,scrollDepth:95},client,NOW+130000);
  const prev=event();await collect(db,prev,client,NOW-2*DAY);
  const selection=reportRange(new URL('https://a/api/report?from=2026-10-22&to=2026-10-23'),NOW);
  const r=await buildReport(db,selection,{},NOW);
  assert.equal(r.summary.views,3);assert.equal(r.summary.visitors,2);assert.equal(r.summary.sessions,2);
  assert.equal(r.summary.avgActiveSeconds,80/3);assert.equal(r.summary.readCompletionRate,1/3);assert.equal(r.summary.engagedRate,2/3);
  assert.equal(r.summary.returningVisitors,1);assert.equal(r.summary.returnRate,.5);assert.equal(r.summary.bounceRate,.5);assert.equal(r.summary.msdsClicks,1);
  assert.equal(r.previousSummary.views,1);assert.equal(r.series.length,2);assert.equal(r.series[0].views,0);assert.equal(r.series[1].views,3);
  assert.equal(r.heatmap.length,168);assert.equal(r.heatmap.find(h=>h.weekday===5&&h.hour===15).views,3);
  assert.equal(r.pages.reduce((n,p)=>n+p.exits,0),2);assert.equal(r.journeys.length,2);
  assert.equal(r.journeys.find(j=>j.views===2).paths.length,2);assert.match(r.journeys[0].visitor,/^[0-9a-f]{12}$/);
  assert.ok(!JSON.stringify(r).includes(a.visitorId));assert.ok(!JSON.stringify(r).includes(a.sessionId));
  const filtered=await buildReport(db,{...selection,filters:{path:'',source:'newsletter',device:'desktop'}},{},NOW);
  assert.equal(filtered.summary.views,1);assert.equal(filtered.summary.readCompletionRate,1);
  const empty=await buildReport(db,{...selection,filters:{path:'/blog/missing/',source:'',device:''}},{},NOW);
  assert.equal(empty.summary.views,0);assert.equal(empty.summary.bounceRate,0);assert.equal(empty.summary.avgActiveSeconds,0);
});

test('retention purges raw history and seven-day receipts without touching current rows',async()=>{
  const db=database(),old=event(),recent=event();
  await collect(db,old,client,NOW-396*DAY);await collect(db,recent,client,NOW-8*DAY);
  await collect(db,{...old,event:'click',eventId:randomUUID(),linkType:'outbound',linkHost:'example.com'},client,NOW-396*DAY);
  await purge(db,{},NOW);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM pageviews').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM clicks').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM event_receipts').get().n,0);
});

test('page filters preserve exit ranking from the full session in the selected period',async()=>{
  const db=database(),a=event({path:'/blog/posts/a/',utmSource:'newsletter'});
  const b=event({path:'/blog/posts/b/',sessionId:a.sessionId,visitorId:a.visitorId});
  await collect(db,a,client,NOW);await collect(db,b,client,NOW+1000);
  const selection=reportRange(new URL('https://a/api/report?from=2026-10-23&to=2026-10-23&path=/blog/posts/a/'),NOW);
  const result=await buildReport(db,selection,{},NOW);
  assert.equal(result.pages.length,1);assert.equal(result.pages[0].views,1);
  assert.equal(result.pages[0].exits,0);assert.equal(result.pages[0].exitRate,0);
  const sourceFiltered=await buildReport(db,{...selection,filters:{path:'',source:'newsletter',device:'desktop'}},{},NOW);
  assert.equal(sourceFiltered.pages[0].exits,0,'source/device filters must not move an exit onto an earlier page');
  const lastPage=await buildReport(db,{...selection,filters:{path:'/blog/posts/b/',source:'',device:''}},{},NOW);
  assert.equal(lastPage.pages[0].exits,1);assert.equal(lastPage.pages[0].exitRate,1);
});

test('clicks use their own receipt period even when the page started before midnight',async()=>{
  const db=database(),selection=reportRange(new URL('https://a/api/report?from=2026-10-23&to=2026-10-23'),NOW);
  const old=event({path:'/blog/posts/overnight/'}),today=event({path:'/blog/posts/today/'});
  await collect(db,old,client,selection.start-2000);
  await collect(db,{...old,event:'click',eventId:randomUUID(),linkType:'msds',linkHost:'msds.oehnps.co.uk'},client,selection.start-1000);
  await collect(db,{...old,event:'click',eventId:randomUUID(),linkType:'msds',linkHost:'msds.oehnps.co.uk'},client,selection.start+1000);
  await collect(db,today,client,selection.start+2000);
  await collect(db,{...today,event:'click',eventId:randomUUID(),linkType:'outbound',linkHost:'example.com'},client,selection.end);
  const result=await buildReport(db,selection,{},NOW);
  assert.equal(result.summary.views,1);assert.equal(result.summary.msdsClicks,1);assert.equal(result.summary.outboundClicks,0);
  assert.equal(result.previousSummary.msdsClicks,1);assert.deepEqual(result.clicks,[{linkHost:'msds.oehnps.co.uk',linkType:'msds',clicks:1}]);
  const filtered=await buildReport(db,{...selection,filters:{path:old.path,source:'',device:''}},{},NOW);
  assert.equal(filtered.summary.views,0);assert.equal(filtered.summary.msdsClicks,1);assert.equal(filtered.clicks[0].clicks,1);
});

test('comparison metadata accounts for installation and retention without requiring an installation date',async()=>{
  const db=database(),selection=reportRange(new URL('https://a/api/report?from=2026-10-22&to=2026-10-23'),NOW);
  const installed='2026-10-22T09:00:00+09:00';
  const recent=await buildReport(db,selection,{COLLECTION_STARTED_AT:installed},NOW);
  assert.equal(recent.meta.collectionStartedAt,'2026-10-22T00:00:00.000Z');assert.equal(recent.meta.comparisonMayBePartial,true);
  const established=await buildReport(db,selection,{COLLECTION_STARTED_AT:'2026-01-01T00:00:00Z'},NOW);
  assert.equal(established.meta.comparisonMayBePartial,false);
  for(const invalid of [undefined,'not-a-date','2026-02-30T00:00:00Z','2026-10-22']) {
    const result=await buildReport(db,selection,{COLLECTION_STARTED_AT:invalid},NOW);
    assert.equal(result.meta.collectionStartedAt,null);assert.equal(result.meta.comparisonMayBePartial,false);
  }
  const limited=await buildReport(db,selection,{RETENTION_DAYS:'2',COLLECTION_STARTED_AT:'2020-01-01T00:00:00Z'},NOW);
  assert.equal(limited.meta.comparisonMayBePartial,true);
});

test('public endpoints expose no data; dashboard/report require config and do not trust email headers',async()=>{
  assert.equal((await handle(new Request('https://insights.oehnps.co.uk/'),{})).status,503);
  assert.equal((await handle(new Request('https://insights.oehnps.co.uk/api/report'),{})).status,503);
  const health=await handle(new Request('https://insights.oehnps.co.uk/health'),{});assert.deepEqual(await health.json(),{ok:true,service:'oehnps-blog-analytics'});
  const denied=await handle(req(event(),'https://evil.com'),{DB:database(),RATE_LIMITER:allowLimiter});assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  const cfg={ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'0123456789abcdef',ADMIN_EMAIL:'owner@example.com'};
  assert.equal((await handle(new Request('https://insights.oehnps.co.uk/api/report',{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.com'}}),cfg)).status,401);
});

test('collector origin, bot filtering, CORS and configured rate limiter enforced',async()=>{
  const db=database(),e=event();
  const response=await handle(req(e),{DB:db,RATE_LIMITER:allowLimiter});assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  const bot=req(event());bot.headers.set('User-Agent','Googlebot');await handle(bot,{DB:db,RATE_LIMITER:allowLimiter});
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM pageviews').get().n,1);
  const limited=await handle(req(event()),{DB:db,RATE_LIMITER:{async limit(){return {success:false};}}});assert.equal(limited.status,429);
  const preflight=await handle(new Request('https://events.oehnps.co.uk/api/collect',{method:'OPTIONS',headers:{Origin:ORIGIN}}),{});assert.equal(preflight.status,204);
  assert.equal((await handle(req(event()),{DB:db})).status,503,'missing production limiter must fail closed');
  assert.equal((await handle(new Request('https://events.oehnps.co.uk/api/report'),{})).status,404);
  assert.equal((await handle(new Request('https://events.oehnps.co.uk/'),{})).status,404);
  assert.equal((await handle(new Request('https://insights.oehnps.co.uk/api/collect'),{})).status,404);
  assert.equal((await handle(new Request('https://worker.workers.dev/health'),{})).status,404);
});

test('client reduction records only country/device/browser, never full UA',()=>{
  const request=new Request('https://a',{headers:{'User-Agent':'Mozilla/5.0 (iPhone) AppleWebKit Safari/605'}});
  Object.defineProperty(request,'cf',{value:{country:'KR'}});
  assert.deepEqual(coarseClient(request),{device:'mobile',browser:'Safari',country:'KR',bot:false});
});

test('Access JWT verifies signature, issuer, audience, time and exact owner; rejects forged/expired/other-owner tokens',async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const env={ACCESS_TEAM_DOMAIN:'jwt-tests.cloudflareaccess.com',ACCESS_AUD:'0123456789abcdef',ADMIN_EMAIL:'owner@example.com'};
  const claims={iss:'https://jwt-tests.cloudflareaccess.com',aud:[env.ACCESS_AUD],exp:NOW/1000+3600,iat:NOW/1000,email:'owner@example.com'};
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  async function token(payload=claims,header={alg:'RS256',kid:'test-key'}) {const body=`${b64(header)}.${b64(payload)}`;const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body));return `${body}.${Buffer.from(sig).toString('base64url')}`;}
  const fetcher=async url=>{assert.equal(url,'https://jwt-tests.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  const jwtRequest=jwt=>new Request('https://a/api/report',{headers:{'Cf-Access-Jwt-Assertion':jwt}});
  assert.equal(await verifyAccess(jwtRequest(await token()),env,fetcher,NOW),true);
  for(const bad of [{...claims,email:'stranger@example.com'},{...claims,aud:['wrong']},{...claims,iss:'https://attacker.com'},{...claims,exp:NOW/1000-1},{...claims,nbf:NOW/1000+100}]) await assert.rejects(verifyAccess(jwtRequest(await token(bad)),env,fetcher,NOW),{status:403});
  await assert.rejects(verifyAccess(jwtRequest(await token(claims,{alg:'none',kid:'test-key'})),env,fetcher,NOW),{status:403});
  const good=await token();await assert.rejects(verifyAccess(jwtRequest(`${good.slice(0,-8)}AAAAAAAA`),env,fetcher,NOW),{status:403});
  await assert.rejects(verifyAccess(jwtRequest(good),{...env,ADMIN_EMAIL:''},fetcher,NOW),{status:503});
});
