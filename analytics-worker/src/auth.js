import { HttpError } from './validation.js';
const cache = new Map();
function decode64(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid encoding');
  const padded=value.replace(/-/g, '+').replace(/_/g, '/')+'='.repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function decodeJSON(value) { return JSON.parse(new TextDecoder().decode(decode64(value))); }
export function accessConfig(env) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https:\/\//, '').replace(/\/$/, '');
  const audience = String(env.ACCESS_AUD || '');
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(domain) || !/^[A-Za-z0-9_-]{16,256}$/.test(audience) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new HttpError(503, 'Dashboard authentication is not configured');
  return { issuer:`https://${domain}`, audience, adminEmail };
}
export async function verifyAccess(request, env, fetcher = (input,init)=>globalThis.fetch(input,init), now = Date.now()) {
  const { issuer, audience, adminEmail } = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401, 'Administrator sign-in required');
  let stage='token_decode';
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const header = decodeJSON(parts[0]), payload = decodeJSON(parts[1]);
    stage='token_algorithm';
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256 || header.crit) throw new Error('Unsupported JWT');
    const seconds = now / 1000;
    stage='issuer';
    if(payload.iss!==issuer) throw new Error('Invalid issuer');
    stage='audience';
    if(!(Array.isArray(payload.aud)?payload.aud:[payload.aud]).includes(audience)) throw new Error('Invalid audience');
    stage='expiry';
    if(!Number.isFinite(payload.exp)||payload.exp<=seconds) throw new Error('Expired token');
    stage='not_before';
    if(payload.nbf!==undefined&&(!Number.isFinite(payload.nbf)||payload.nbf>seconds+30)) throw new Error('Token not active');
    stage='issued_at';
    if(payload.iat!==undefined&&(!Number.isFinite(payload.iat)||payload.iat>seconds+30)) throw new Error('Token issued in future');
    let entry = cache.get(issuer);
    if (!entry || entry.until <= now) {
      stage='key_timeout_setup';
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),5000);
      try {
        stage='key_fetch';
        const res = await fetcher(`${issuer}/cdn-cgi/access/certs`, { redirect:'manual', signal:controller.signal });
        stage='key_response';
        // Never follow a redirect to a different issuer or login page.
        if (!res.ok || res.status>=300) throw new Error('Unavailable keys');
        stage='key_json';
        const data = await res.json();
        stage='key_set';
        if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error('Invalid keys');
        entry = { keys:data.keys, until:now+300000 };
        cache.set(issuer, entry);
      } finally {clearTimeout(timeout);}
    }
    stage='key_match';
    const jwk = entry.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!jwk) throw new Error('Unknown key');
    stage='key_import';
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    stage='signature';
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error('Invalid signature');
    stage='owner';
    if (typeof payload.email !== 'string' || payload.email.trim().toLowerCase() !== adminEmail) throw new Error('Wrong administrator');
    return true;
  } catch(error) {
    // Optional incident diagnostics expose only a fixed stage, never tokens/claims/keys.
    const names=new Set(['TypeError','ReferenceError','DataError','OperationError','InvalidAccessError','NotSupportedError','TimeoutError','AbortError','SyntaxError']);
    const name=names.has(error?.name)?`:${error.name}`:'';
    const detail=env.AUTH_DIAGNOSTICS==='true'?` (${stage}${name})`:'';
    throw new HttpError(403, `Administrator authorization failed${detail}`);
  }
}
