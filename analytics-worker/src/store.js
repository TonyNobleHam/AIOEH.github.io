import { DAY, retentionDays } from './validation.js';
export function collectorStatements(db, e, client, now) {
  const source = e.utmSource || e.referrer || 'direct';
  const page = db.prepare(`INSERT INTO pageviews
    (view_id,session_id,visitor_id,has_view,occurred_at,updated_at,path,title,referrer,source,utm_source,utm_medium,utm_campaign,country,device,browser,is_returning,session_start,active_ms,scroll_depth)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM event_receipts WHERE event_id=?)
    ON CONFLICT(view_id) DO UPDATE SET
      has_view=MAX(pageviews.has_view,excluded.has_view),
      session_start=MAX(pageviews.session_start,excluded.session_start),
      updated_at=MAX(pageviews.updated_at,excluded.updated_at),
      active_ms=MAX(pageviews.active_ms,MIN(?,MAX(0,excluded.updated_at-pageviews.occurred_at)+30000)),
      scroll_depth=MAX(pageviews.scroll_depth,excluded.scroll_depth)
    WHERE pageviews.session_id=excluded.session_id AND pageviews.visitor_id=excluded.visitor_id AND pageviews.path=excluded.path`)
    .bind(e.viewId,e.sessionId,e.visitorId,e.event==='view'?1:0,now,now,e.path,e.title,e.referrer,source,e.utmSource,e.utmMedium,e.utmCampaign,client.country,client.device,client.browser,e.isReturning?1:0,e.sessionStart?1:0,Math.min(e.activeMs,30000),e.scrollDepth,e.eventId,e.activeMs);
  const statements = [page];
  if (e.event === 'click') statements.push(db.prepare(`INSERT OR IGNORE INTO clicks(event_id,view_id,occurred_at,link_host,link_type)
    SELECT ?,view_id,?,?,? FROM pageviews WHERE view_id=? AND session_id=? AND visitor_id=? AND path=? AND NOT EXISTS(SELECT 1 FROM event_receipts WHERE event_id=?)`)
    .bind(e.eventId,now,e.linkHost,e.linkType,e.viewId,e.sessionId,e.visitorId,e.path,e.eventId));
  statements.push(db.prepare('INSERT OR IGNORE INTO event_receipts(event_id,received_at) VALUES(?,?)').bind(e.eventId,now));
  return statements;
}
export async function collect(db,e,client,now=Date.now()) { await db.batch(collectorStatements(db,e,client,now)); }
export async function purge(db,env,now=Date.now()) {
  const cutoff=now-retentionDays(env)*DAY;
  await db.batch([
    db.prepare('DELETE FROM clicks WHERE occurred_at < ? OR view_id IN (SELECT view_id FROM pageviews WHERE occurred_at < ?)').bind(cutoff,cutoff),
    db.prepare('DELETE FROM pageviews WHERE occurred_at < ?').bind(cutoff),
    db.prepare('DELETE FROM event_receipts WHERE received_at < ?').bind(now-7*DAY),
    // Missing view beacons never count; remove abandoned placeholders after one day.
    db.prepare('DELETE FROM pageviews WHERE has_view=0 AND updated_at < ?').bind(now-DAY)
  ]);
}
