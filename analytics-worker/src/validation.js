export const ORIGIN = 'https://oehnps.co.uk';
export const DAY = 86400000;
export const MAX_BODY = 4096;
export const MAX_ACTIVE_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function cleanText(value, max, name) {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `Invalid ${name}`);
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
}
export function validPath(value) {
  const path = cleanText(value, 512, 'path');
  if (path !== value) throw new HttpError(400, 'Invalid path');
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, 'Invalid path'); }
  if ((path !== '/' && !path.startsWith('/blog/')) || /[?#\\\u0000-\u001f\u007f]/.test(decoded) || decoded.includes('//') || decoded.split('/').some(p => p === '..' || p === '.')) {
    throw new HttpError(400, 'Invalid path');
  }
  return path;
}
function campaign(value, name) {
  return cleanText(value ?? '', 100, name).replace(/[^\p{L}\p{N} ._\-]/gu, '');
}
export function validateEvent(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' || raw.v !== 1 || !['view', 'engagement', 'click'].includes(raw.event)) throw new HttpError(400, 'Invalid event');
  const allowed = new Set(['v','event','eventId','viewId','sessionId','visitorId','path','title','referrer','utmSource','utmMedium','utmCampaign','activeMs','scrollDepth','linkHost','linkType','isReturning','sessionStart']);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new HttpError(400, 'Unknown event fields');
  const e = { ...raw };
  for (const name of ['eventId','viewId','sessionId','visitorId']) {
    if (typeof e[name] !== 'string' || !UUID.test(e[name])) throw new HttpError(400, `Invalid ${name}`);
    e[name] = e[name].toLowerCase();
  }
  e.path = validPath(e.path);
  e.title = cleanText(e.title ?? '', 200, 'title');
  e.referrer = '';
  if (raw.referrer) {
    let u;
    try { u = new URL(raw.referrer); } catch { throw new HttpError(400, 'Invalid referrer'); }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || raw.referrer !== u.origin || raw.referrer.length > 255) throw new HttpError(400, 'Referrer must be an origin only');
    if (u.origin !== ORIGIN) e.referrer = u.hostname;
  }
  for (const name of ['utmSource','utmMedium','utmCampaign']) e[name] = campaign(e[name], name);
  for (const [name,max] of [['activeMs', MAX_ACTIVE_MS], ['scrollDepth',100]]) {
    if (!Number.isSafeInteger(e[name]) || e[name] < 0 || e[name] > max) throw new HttpError(400, `Invalid ${name}`);
  }
  if (typeof e.isReturning !== 'boolean' || (e.sessionStart !== undefined && typeof e.sessionStart !== 'boolean')) throw new HttpError(400, 'Invalid session flags');
  e.sessionStart = e.sessionStart === true;
  if (e.event === 'click') {
    if (!['outbound','download','msds'].includes(e.linkType)) throw new HttpError(400, 'Invalid linkType');
    e.linkHost = cleanText(e.linkHost, 253, 'linkHost').toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(e.linkHost)) throw new HttpError(400, 'Invalid linkHost');
  } else if (e.linkHost || e.linkType) throw new HttpError(400, 'Link data requires click event');
  return e;
}
export async function readEvent(request) {
  if (!/^text\/plain(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new HttpError(415, 'Use text/plain JSON');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, 'Event is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing body');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new HttpError(413, 'Event is too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  let raw;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes)); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
  return validateEvent(raw);
}
export function coarseClient(request) {
  const ua = (request.headers.get('User-Agent') || '').slice(0, 1024);
  const bot = /bot\b|crawler|spider|headless|lighthouse|preview|facebookexternalhit/i.test(ua) || request.cf?.botManagement?.verifiedBot === true;
  const device = /ipad|tablet|android(?!.*mobile)/i.test(ua) ? 'tablet' : /mobile|iphone|ipod/i.test(ua) ? 'mobile' : /windows|macintosh|linux|cros/i.test(ua) ? 'desktop' : 'other';
  const browser = /edg\//i.test(ua) ? 'Edge' : /firefox\//i.test(ua) ? 'Firefox' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /opr\//i.test(ua) ? 'Opera' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const country = /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : 'XX';
  return { device, browser, country, bot };
}
export function localDate(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0,10); }
function dateStart(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Use YYYY-MM-DD dates');
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== date) throw new HttpError(400, 'Invalid date');
  return ms - 9 * 3600000;
}
export function reportRange(url, now = Date.now()) {
  const from = url.searchParams.get('from') || localDate(now - 29 * DAY);
  const to = url.searchParams.get('to') || localDate(now);
  const start = dateStart(from), end = dateStart(to) + DAY;
  const days = (end - start) / DAY;
  if (days < 1 || days > 366 || to > localDate(now)) throw new HttpError(400, 'Date range must cover 1–366 days, ending no later than today');
  const path = url.searchParams.get('path') || '';
  if (path) validPath(path);
  const source = cleanText(url.searchParams.get('source') || '', 255, 'source');
  const device = url.searchParams.get('device') || '';
  if (device && !['mobile','tablet','desktop','other'].includes(device)) throw new HttpError(400, 'Invalid device');
  return { start, end, previousStart: start-days*DAY, previousEnd:start, range:{from,to,timeZone:'Asia/Seoul',days,previousFrom:localDate(start-days*DAY),previousTo:localDate(start-DAY)}, filters:{path,source,device} };
}
export function retentionDays(env) {
  const n = Number(env.RETENTION_DAYS || 395);
  return Number.isSafeInteger(n) && n >= 1 && n <= 395 ? n : 395;
}
