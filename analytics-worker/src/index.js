import { ORIGIN,HttpError,readEvent,coarseClient,reportRange } from './validation.js';
import { verifyAccess } from './auth.js';
import { collect,purge } from './store.js';
import { buildReport } from './report.js';
const PRIVATE_HEADERS={
  'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const EVENTS_HOST='events.oehnps.co.uk';
const DASHBOARD_HOST='insights.oehnps.co.uk';
function json(body,status=200,extra={}) {return new Response(JSON.stringify(body),{status,headers:{...PRIVATE_HEADERS,'Content-Type':'application/json; charset=utf-8',...extra}});}
function cors(request) {return request.headers.get('Origin')===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'}:{};}
export async function handle(request,env,ctx={}) {
  const url=new URL(request.url),isCollector=url.pathname==='/api/collect';
  try {
    if(![EVENTS_HOST,DASHBOARD_HOST].includes(url.hostname)) throw new HttpError(404,'Not found');
    if(url.pathname==='/health'&&request.method==='GET') return json({ok:true,service:'oehnps-blog-analytics'});
    if(url.hostname===EVENTS_HOST&&!isCollector) throw new HttpError(404,'Not found');
    if(url.hostname===DASHBOARD_HOST&&isCollector) throw new HttpError(404,'Not found');
    if(isCollector) {
      if(request.headers.get('Origin')!==ORIGIN) throw new HttpError(403,'Origin is not allowed');
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors(request),'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store'}});
      if(request.method!=='POST') throw new HttpError(405,'Method not allowed');
      if(!env.DB||!env.RATE_LIMITER) throw new HttpError(503,'Collection is not configured');
      const event=await readEvent(request),client=coarseClient(request);
      if(!client.bot) {
        {
          // Edge IP is used only as an ephemeral limiter key, never written to D1/logs.
          const ip=request.headers.get('CF-Connecting-IP');
          const limits=await Promise.all([
            env.RATE_LIMITER.limit({key:`visitor:${event.visitorId}`}),
            ...(ip?[env.RATE_LIMITER.limit({key:`edge:${ip}`})]:[])
          ]);
          if(limits.some(result=>!result.success)) throw new HttpError(429,'Too many events');
        }
        await collect(env.DB,event,client);
      }
      return new Response(null,{status:204,headers:{...cors(request),'Cache-Control':'no-store'}});
    }
    await verifyAccess(request,env);
    if(!['GET','HEAD'].includes(request.method)) throw new HttpError(405,'Method not allowed');
    if(url.pathname==='/api/report') {
      if(!env.DB) throw new HttpError(503,'Reporting is not configured');
      const result=await buildReport(env.DB,reportRange(url),env);
      return json(result);
    }
    if(url.pathname.startsWith('/api/')) throw new HttpError(404,'Not found');
    if(!env.ASSETS) throw new HttpError(503,'Dashboard is not configured');
    const response=await env.ASSETS.fetch(request);
    const secured=new Response(response.body,response);
    for(const [key,value] of Object.entries(PRIVATE_HEADERS)) secured.headers.set(key,value);
    return secured;
  } catch(error) {
    // Do not log payloads, IP addresses, user agents, tokens, or D1 error details.
    return json({error:error instanceof HttpError?error.message:'Service temporarily unavailable'},error instanceof HttpError?error.status:503,isCollector?cors(request):{});
  }
}
export default {
  fetch:handle,
  async scheduled(controller,env,ctx) {if(env.DB) await purge(env.DB,env);}
};
