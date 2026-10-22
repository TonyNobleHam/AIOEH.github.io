import { DAY, localDate, retentionDays } from './validation.js';
const METRICS = `COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors, COUNT(DISTINCT session_id) AS sessions,
  COALESCE(AVG(active_ms)/1000.0,0) AS avgActiveSeconds,
  COALESCE(AVG(CASE WHEN scroll_depth>=90 AND active_ms>=30000 THEN 1.0 ELSE 0 END),0) AS readCompletionRate,
  COALESCE(AVG(CASE WHEN active_ms>=10000 THEN 1.0 ELSE 0 END),0) AS engagedRate`;
function clause(start,end,filters,alias='') {
  const a=alias?`${alias}.`:'';
  const where=[`${a}has_view=1`,`${a}occurred_at>=?`,`${a}occurred_at<?`], params=[start,end];
  for (const column of ['path','source','device']) if(filters[column]) { where.push(`${a}${column}=?`); params.push(filters[column]); }
  return {where:where.join(' AND '),params};
}
function clickClause(start,end,filters) {
  // Clicks belong to their server receipt date, even when their page began earlier.
  const where=['v.has_view=1','c.occurred_at>=?','c.occurred_at<?'],params=[start,end];
  for(const column of ['path','source','device']) if(filters[column]) {where.push(`v.${column}=?`);params.push(filters[column]);}
  return {where:where.join(' AND '),params};
}
function collectionStartedAt(value) {
  if(typeof value!=='string'||value.length>64||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const ms=Date.parse(value),day=Date.parse(`${value.slice(0,10)}T00:00:00Z`);
  if(!Number.isFinite(ms)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value.slice(0,10)) return null;
  return new Date(ms).toISOString();
}
function summaryQueries(db,start,end,filters) {
  const c=clause(start,end,filters),clicks=clickClause(start,end,filters);
  return [
    db.prepare(`SELECT ${METRICS},COUNT(DISTINCT CASE WHEN is_returning=1 THEN visitor_id END) AS returningVisitors FROM pageviews WHERE ${c.where}`).bind(...c.params),
    db.prepare(`SELECT COALESCE(AVG(CASE WHEN views=1 AND active_ms<10000 THEN 1.0 ELSE 0 END),0) AS bounceRate
      FROM (SELECT session_id,COUNT(*) AS views,SUM(active_ms) AS active_ms FROM pageviews WHERE ${c.where} GROUP BY session_id)`).bind(...c.params),
    db.prepare(`SELECT COUNT(CASE WHEN c.link_type='outbound' THEN 1 END) AS outboundClicks,
      COUNT(CASE WHEN c.link_type='download' THEN 1 END) AS downloads,COUNT(CASE WHEN c.link_type='msds' THEN 1 END) AS msdsClicks
      FROM clicks c JOIN pageviews v ON v.view_id=c.view_id WHERE ${clicks.where}`).bind(...clicks.params)
  ];
}
function summary(result,offset) {
  const a=result[offset].results[0],b=result[offset+1].results[0],c=result[offset+2].results[0];
  return {...a,...b,...c,returnRate:a.visitors?a.returningVisitors/a.visitors:0};
}
async function shortHash(kind,id) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`oehnps-analytics:${kind}:${id}`));
  return Array.from(new Uint8Array(digest).slice(0,6),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function buildReport(db,selection,env,now=Date.now()) {
  const {start,end,previousStart,previousEnd,filters,range}=selection;
  const c=clause(start,end,filters),allPages=clause(start,end,{}),clicks=clickClause(start,end,filters);
  const queries=[...summaryQueries(db,start,end,filters),...summaryQueries(db,previousStart,previousEnd,filters)];
  const add=(sql,params=c.params)=>queries.push(db.prepare(sql).bind(...params));
  add(`SELECT date(occurred_at/1000,'unixepoch','+9 hours') AS date,${METRICS} FROM pageviews WHERE ${c.where} GROUP BY date ORDER BY date`);
  // Rank each session's last page before applying page/source/device filters.
  add(`WITH ranked AS (SELECT *,ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY occurred_at DESC,view_id DESC) AS exit_rank FROM pageviews WHERE ${allPages.where}),
    selected AS (SELECT * FROM ranked WHERE ${c.where})
    SELECT path,MAX(title) AS title,${METRICS},SUM(CASE WHEN exit_rank=1 THEN 1 ELSE 0 END) AS exits,
    AVG(CASE WHEN exit_rank=1 THEN 1.0 ELSE 0 END) AS exitRate FROM selected GROUP BY path ORDER BY views DESC LIMIT 200`,[...allPages.params,...c.params]);
  add(`SELECT source,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT session_id) AS sessions FROM pageviews WHERE ${c.where} GROUP BY source ORDER BY views DESC LIMIT 100`);
  add(`SELECT CASE WHEN referrer='' THEN 'direct' ELSE referrer END AS host,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors FROM pageviews WHERE ${c.where} GROUP BY referrer ORDER BY views DESC LIMIT 100`);
  add(`SELECT utm_source AS source,utm_medium AS medium,utm_campaign AS campaign,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors FROM pageviews WHERE ${c.where} AND (utm_source<>'' OR utm_medium<>'' OR utm_campaign<>'') GROUP BY utm_source,utm_medium,utm_campaign ORDER BY views DESC LIMIT 100`);
  for (const field of ['country','device','browser']) add(`SELECT ${field},COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors FROM pageviews WHERE ${c.where} GROUP BY ${field} ORDER BY views DESC LIMIT 100`);
  add(`SELECT CAST(strftime('%w',occurred_at/1000,'unixepoch','+9 hours') AS INTEGER) AS weekday,
    CAST(strftime('%H',occurred_at/1000,'unixepoch','+9 hours') AS INTEGER) AS hour,COUNT(*) AS views FROM pageviews WHERE ${c.where} GROUP BY weekday,hour`);
  add(`WITH selected AS (SELECT * FROM pageviews WHERE ${c.where}),recent AS (SELECT session_id FROM selected GROUP BY session_id ORDER BY MAX(occurred_at) DESC LIMIT 50),
    ordered AS (SELECT *,ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY occurred_at,view_id) AS position,COUNT(*) OVER (PARTITION BY session_id) AS session_views,SUM(active_ms) OVER (PARTITION BY session_id) AS session_active_ms FROM selected WHERE session_id IN (SELECT session_id FROM recent))
    SELECT session_id,visitor_id,occurred_at,path,title,active_ms,scroll_depth,is_returning,session_views,session_active_ms FROM ordered WHERE position<=20 ORDER BY occurred_at,view_id`);
  add(`SELECT c.link_host AS linkHost,c.link_type AS linkType,COUNT(*) AS clicks FROM clicks c JOIN pageviews v ON v.view_id=c.view_id WHERE ${clicks.where} GROUP BY c.link_host,c.link_type ORDER BY clicks DESC LIMIT 100`,clicks.params);
  const results=await db.batch(queries);
  const byDate=new Map(results[6].results.map(r=>[r.date,r]));
  const series=[];
  for(let t=start;t<end;t+=DAY) {const date=localDate(t);series.push(byDate.get(date)||{date,views:0,visitors:0,sessions:0,avgActiveSeconds:0,readCompletionRate:0,engagedRate:0});}
  const hours=new Map(results[14].results.map(r=>[`${r.weekday}:${r.hour}`,r.views]));
  const heatmap=Array.from({length:168},(_,i)=>({weekday:Math.floor(i/24),hour:i%24,views:hours.get(`${Math.floor(i/24)}:${i%24}`)||0}));
  const sessions=new Map();
  for(const row of results[15].results) {
    let journey=sessions.get(row.session_id);
    if(!journey) {journey={session:await shortHash('session',row.session_id),visitor:await shortHash('visitor',row.visitor_id),startedAt:new Date(row.occurred_at).toISOString(),views:row.session_views,activeSeconds:row.session_active_ms/1000,isReturning:!!row.is_returning,paths:[]};sessions.set(row.session_id,journey);}
    journey.paths.push({path:row.path,title:row.title,activeSeconds:row.active_ms/1000,scrollDepth:row.scroll_depth});
  }
  const startedAt=collectionStartedAt(env.COLLECTION_STARTED_AT);
  const earliestAvailable=Math.max(now-retentionDays(env)*DAY,startedAt?Date.parse(startedAt):-Infinity);
  return {range,filters,generatedAt:new Date(now).toISOString(),summary:summary(results,0),previousSummary:summary(results,3),series,
    pages:results[7].results,channels:results[8].results,referrers:results[9].results,campaigns:results[10].results,
    countries:results[11].results,devices:results[12].results,browsers:results[13].results,heatmap,
    journeys:Array.from(sessions.values()).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),clicks:results[16].results,
    meta:{retentionDays:retentionDays(env),anonymous:true,consentRequired:true,journeySessionLimit:50,journeyPathLimit:20,
      metricsScope:'Page views use first server receipt time and selected filters; sessions may cross date boundaries',
      exitsScope:'Last observed page per session within the date range, ranked before page/source/device filters; ongoing sessions can change',
      clicksScope:'Click receipt time within the date range, matching associated page filters; the page may have begun before the range',
      collectionStartedAt:startedAt,comparisonMayBePartial:previousStart<earliestAvailable}};
}
