// Kader access gateway. Deploy this complete file as a Railway Bun Function.
// No credentials, user records, or session tokens are stored by this service.
const UPSTREAM = 'https://media90.lemonygleam8.chatgpt.site';
const RELEASE = '2026-10-17.1';
const UPSTREAM_HOSTS = new Set(['media90.lemonygleam8.chatgpt.site', 'kader.media', 'www.kader.media', 'access.kader.media']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY = 25 * 1024 * 1024;
const REQUEST_HEADERS = new Set([
  'accept', 'accept-language', 'authorization', 'content-type', 'cookie',
  'range', 'if-range', 'if-none-match', 'if-modified-since', 'rsc',
  'next-action', 'next-router-state-tree', 'next-router-prefetch', 'next-url',
  'x-csrf-token', 'x-requested-with', 'idempotency-key', 'x-idempotency-key',
]);
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length',
  'content-encoding', 'set-cookie', 'alt-svc',
]);

function targetURL(url) {
  const incoming = new URL(url);
  const target = new URL(UPSTREAM);
  // Assigning pathname rather than resolving a relative URL prevents an open proxy.
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

function publicOrigin(url) {
  const u = new URL(url);
  return (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    ? u.origin : `https://${u.host}`;
}

function rewriteLocation(location, origin) {
  try {
    const url = new URL(location, UPSTREAM);
    if (UPSTREAM_HOSTS.has(url.hostname) && ['http:', 'https:'].includes(url.protocol)) {
      return origin + url.pathname + url.search + url.hash;
    }
  } catch { /* Preserve an unrecognized upstream Location without interpreting it. */ }
  return location;
}

function rewriteCookie(cookie) {
  // Host-only cookies keep separate sessions per access domain, preserving expiry,
  // HttpOnly, Secure, SameSite and deletion attributes exactly as the app sent them.
  return cookie.split(';').filter(part => !/^\s*domain\s*=/i.test(part)).join(';');
}

function requestHeaders(request, origin) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (REQUEST_HEADERS.has(name) || name.startsWith('x-vinext-')) headers.set(name, value);
  }
  // Never forward platform identity, proxy credentials, or claimed client IPs.
  // The gateway performs its own CSRF check before adapting the upstream origin.
  if (request.headers.has('origin')) headers.set('origin', UPSTREAM);
  const referrer = request.headers.get('referer');
  if (referrer) {
    try {
      const ref = new URL(referrer);
      if (ref.origin === origin) headers.set('referer', UPSTREAM + ref.pathname + ref.search);
    } catch { /* Omit invalid referrers. */ }
  }
  headers.set('accept-encoding', 'identity');
  return headers;
}

function responseHeaders(response, origin, pathname) {
  const headers = new Headers();
  const connectionHeaders = new Set((response.headers.get('connection') || '').toLowerCase().split(',').map(x => x.trim()));
  for (const [name, value] of response.headers) {
    if (!HOP_HEADERS.has(name) && !connectionHeaders.has(name) && !name.startsWith('access-control-')) {
      headers.set(name, value);
    }
  }
  const cookies = response.headers.getSetCookie?.() || [];
  for (const cookie of cookies) headers.append('set-cookie', rewriteCookie(cookie));
  if (headers.has('location')) headers.set('location', rewriteLocation(headers.get('location'), origin));
  // No intermediary may cache authenticated pages or API responses.
  headers.set('cache-control', /^\/_next\/static\//.test(pathname)
    ? 'private, max-age=31536000, immutable' : 'private, no-store');
  headers.set('cdn-cache-control', 'no-store');
  headers.set('surrogate-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'same-origin');
  headers.set('x-kader-access-path', 'railway-gateway');
  return headers;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-kader-access-path': 'railway-gateway',
  }});
}

const diagnosticHTML = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>كادر · فحص الاتصال</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f6f5;color:#143b3f;font:17px/1.9 Tahoma,Arial,sans-serif}main{max-width:800px;margin:6vh auto;padding:25px}section{background:#fff;border:1px solid #d8e3e1;border-radius:18px;padding:28px}h1{font-size:28px;margin:0 0 12px}button,a{display:inline-block;padding:10px 18px;border-radius:9px;margin:6px 0 6px 8px}button{background:#155e63;color:white;border:0;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}a{color:#155e63}pre{white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left;background:#f3f6f5;border-radius:10px;padding:15px;font-size:13px}small{color:#586c6b}#state{font-weight:bold}</style><main><section><h1>فحص اتصال كادر</h1><p>شغّل الفحص دون VPN من الشبكة التي تظهر فيها المشكلة. يقيس اتصالك ببوابة الوصول واتصال البوابة بالتطبيق؛ ولا يقرأ حسابك أو مهامك.</p><button id="run">بدء الفحص</button><button id="download" disabled>تنزيل النتيجة</button><a href="/">فتح كادر</a><p id="state" role="status" aria-live="polite">جاهز للفحص.</p><pre id="result" hidden></pre><small>نجاح الفحص يؤكد المسارات المذكورة فقط. للتأكد من الاستخدام الكامل، افتح كادر وسجّل الدخول بحسابك. هذه البوابة تستخدم التطبيق والبيانات نفسيهما، وقد تحتاج تسجيل الدخول مرة واحدة على هذا العنوان.</small></section></main><script>let report;const run=document.getElementById('run'),download=document.getElementById('download'),state=document.getElementById('state'),result=document.getElementById('result');run.onclick=async()=>{run.disabled=true;download.disabled=true;state.textContent='جارٍ الفحص…';const started=performance.now();report={time:new Date().toISOString(),origin:location.origin,tests:[]};for(const [name,path] of [['بوابة الوصول','/_gateway/health'],['التطبيق من البوابة','/_gateway/check']]){const t=performance.now();try{const r=await fetch(path,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});const data=await r.json();report.tests.push({name,status:r.status,ok:r.ok,durationMs:Math.round(performance.now()-t),data})}catch(e){report.tests.push({name,ok:false,durationMs:Math.round(performance.now()-t),error:e.name})}}report.durationMs=Math.round(performance.now()-started);const ok=report.tests.every(t=>t.ok);state.textContent=ok?'نجحت اختبارات الاتصال. جرّب الآن فتح كادر وتسجيل الدخول.':'تعثر أحد الاختبارات. نزّل النتيجة لمراجعتها.';result.hidden=false;result.textContent=JSON.stringify(report,null,2);download.disabled=false;run.disabled=false};download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kader-connection-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};</script></html>`;

function diagnostics() {
  return new Response(diagnosticHTML, {headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  }});
}

function unavailable(isAPI, requestId, status = 502) {
  if (isAPI) return json({error: 'تعذر الاتصال بكادر. تحقق من الاتصال قبل إعادة أي عملية حفظ.', code: 'KADER_UPSTREAM_UNAVAILABLE', requestId}, status);
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>كادر · تعذّر الاتصال</title><body style="font:18px/1.9 Tahoma,Arial,sans-serif;max-width:700px;margin:10vh auto;padding:25px"><h1>تعذّر الاتصال بكادر مؤقتاً</h1><p>بوابة الوصول تعمل، لكن اتصالها بالتطبيق تعثّر. إذا كنت تحفظ بيانات، تحقق من نتيجتها داخل كادر قبل تكرار الحفظ.</p><a href="/connection">فحص الاتصال</a><p>مرجع المحاولة: ${requestId}</p></body></html>`, {status, headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  }});
}

function createGateway({fetcher = fetch, allowedHosts = []} = {}) {
  const hosts = new Set(allowedHosts.map(host => host.toLowerCase()));
  return async function handle(request) {
    const url = new URL(request.url);
    const origin = publicOrigin(request.url);
    const method = request.method.toUpperCase();
    const requestId = crypto.randomUUID();
    if (url.hostname === 'healthcheck.railway.app' && url.pathname === '/_gateway/health' && method === 'GET') {
      return json({status:'ok', service:'kader-access', release:RELEASE});
    }
    if (!hosts.has(url.host.toLowerCase())) return json({error: 'Host not allowed'}, 421);
    if (!METHODS.has(method)) return json({error: 'Method not allowed'}, 405);
    if (request.headers.get('upgrade')) return json({error: 'Protocol upgrade not supported'}, 426);
    // Enforce before forwarding any cookie-authenticated mutation upstream.
    if (!SAFE_METHODS.has(method) && (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site')) {
      return json({error: 'طلب من مصدر غير مسموح.', code: 'CROSS_ORIGIN_BLOCKED'}, 403);
    }
    const size = Number(request.headers.get('content-length') || 0);
    if (!Number.isFinite(size) || size < 0 || size > MAX_BODY) return json({error: 'Request body too large'}, 413);
    if (url.pathname === '/_gateway/health' && (method === 'GET' || method === 'HEAD')) {
      return method === 'HEAD' ? new Response(null, {status:200}) : json({status: 'ok', service: 'kader-access', release: RELEASE});
    }
    if ((url.pathname === '/connection' || url.pathname === '/_gateway/connection') && (method === 'GET' || method === 'HEAD')) {
      const response = diagnostics();
      return method === 'HEAD' ? new Response(null, {headers:response.headers}) : response;
    }
    if (url.pathname === '/_gateway/check' && method === 'GET') {
      const start = Date.now();
      try {
        const response = await fetcher(UPSTREAM + '/api/health', {
          headers: {'accept': 'application/json'}, redirect: 'manual', signal: AbortSignal.timeout(20000),
        });
        const payload = await response.json();
        const ok = response.ok && payload.status === 'ok' && payload.service === 'kader';
        return json({status: ok ? 'ok' : 'unavailable', appStatus: response.status, application: 'kader',
          path: 'gateway-to-application', latencyMs: Date.now() - start, checkedAt: new Date().toISOString()}, ok ? 200 : 502);
      } catch { return json({status:'unavailable', path:'gateway-to-application', latencyMs:Date.now()-start}, 502); }
    }
    if (url.pathname.startsWith('/_gateway/')) return json({error:'Not found'}, 404);
    try {
      const init = {
        method, headers: requestHeaders(request, origin), redirect: 'manual',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
      };
      if (request.body && method !== 'GET' && method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
      }
      // A single attempt for all requests: in particular, never replay writes.
      const response = await fetcher(targetURL(request.url), init);
      const headers = responseHeaders(response, origin, url.pathname);
      if (response.status >= 500) headers.set('retry-after', '10');
      return new Response(method === 'HEAD' || [204,205,304].includes(response.status) ? null : response.body,
        {status: response.status, statusText: response.statusText, headers});
    } catch {
      return unavailable(url.pathname.startsWith('/api/'), requestId);
    }
  };
}


const createLegacyGateway=createGateway;

export const PORTAL_RELEASE='2.7.0';
export const PORTAL_UPSTREAM='https://mowaqqat-full-production.up.railway.app';
const PORTAL_MAX_BODY=52*1024*1024;
const PORTAL_SAFE=new Set(['GET','HEAD','OPTIONS']);
const PORTAL_HEADERS=['accept','accept-language','content-type','x-csrf-token','idempotency-key','range','if-range','if-none-match','if-modified-since','origin','referer'];
const PORTAL_HOP=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-length','content-encoding','access-control-allow-origin','access-control-allow-credentials'];
function portalFailure(message,status=502){return new Response(JSON.stringify({detail:message}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function portalCookie(value){return (value||'').split(';').map(v=>v.trim()).find(v=>/^mowaqqat_session=[A-Za-z0-9_-]+$/.test(v))||''}

export function createPortalGateway({allowedHosts,fetcher=fetch,legacyHandler}={}){
  const hosts=new Set(allowedHosts||['kader.media','www.kader.media','access.kader.media']);
  const legacy=legacyHandler||createLegacyGateway({allowedHosts:[...hosts],fetcher});
  return async function portalGateway(request){
    const url=new URL(request.url);
    if(!hosts.has(url.hostname.toLowerCase()))return portalFailure('Unrecognized host',421);
    if(url.pathname==='/_portal/health')return Response.json({status:'ok',service:'kader-portal',release:PORTAL_RELEASE},{headers:{'cache-control':'no-store'}});
    const rsc=request.headers.has('rsc')||request.headers.has('next-router-state-tree');
    const legacyRoot=url.pathname==='/'&&['1','legacy'].includes(url.searchParams.get('workspace'));
    const root=false; // The apex serves the existing management workspace; portal remains at /mowaqqat/.
    if(!root&&url.pathname!=='/mowaqqat'&&!url.pathname.startsWith('/mowaqqat/'))return legacy(request);
    if(url.pathname==='/mowaqqat')return new Response(null,{status:308,headers:{location:'/mowaqqat/'+url.search,'cache-control':'no-store'}});
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(request.method))return portalFailure('Method not allowed',405);
    if(root&&!['GET','HEAD'].includes(request.method))return portalFailure('Method not allowed',405);
    if(!PORTAL_SAFE.has(request.method)){
      let origin;try{origin=new URL(request.headers.get('origin')||'')}catch{return portalFailure('Origin required',403)}
      if(origin.protocol!=='https:'||origin.host!==url.host||request.headers.get('sec-fetch-site')==='cross-site')return portalFailure('Cross-origin write rejected',403);
    }
    const length=request.headers.get('content-length');
    if(length&&(!/^\d+$/.test(length)||Number(length)>PORTAL_MAX_BODY))return portalFailure('Request too large',413);
    if(request.headers.get('upgrade'))return portalFailure('Protocol upgrade not supported',426);
    const target=new URL(PORTAL_UPSTREAM);target.pathname=root?'/mowaqqat/':url.pathname;target.search=url.search;
    const headers=new Headers();for(const h of PORTAL_HEADERS)if(request.headers.has(h))headers.set(h,request.headers.get(h));
    headers.set('accept-encoding','identity');const cookie=portalCookie(request.headers.get('cookie'));if(cookie)headers.set('cookie',cookie);
    try{
      const options={method:request.method,headers,redirect:'manual',signal:AbortSignal.timeout(90000)};
      if(!['GET','HEAD'].includes(request.method)){const body=await request.arrayBuffer();if(body.byteLength>PORTAL_MAX_BODY)return portalFailure('Request too large',413);options.body=body;}
      const response=await fetcher(target.href,options);const output=new Headers(response.headers);for(const h of PORTAL_HOP)output.delete(h);
      const cookies=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')].filter(Boolean);output.delete('set-cookie');
      for(const value of cookies)if(/^mowaqqat_session=/.test(value)){
        let scoped=value.replace(/;\s*Domain=[^;]*/ig,'').replace(/;\s*Path=[^;]*/ig,'');scoped+='; Path=/';
        if(!/;\s*Secure(?:;|$)/i.test(scoped))scoped+='; Secure';if(!/;\s*HttpOnly(?:;|$)/i.test(scoped))scoped+='; HttpOnly';
        output.append('set-cookie',scoped);output.append('set-cookie','mowaqqat_session=; Path=/mowaqqat/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
      }
      const location=output.get('location');if(location){const next=new URL(location,target);if(next.origin!==target.origin||!next.pathname.startsWith('/mowaqqat/')){await response.body?.cancel();return portalFailure('Unexpected backend redirect',502)}output.set('location',next.pathname+next.search+next.hash)}
      output.set('cache-control','private, no-store');output.set('x-kader-portal-release',PORTAL_RELEASE);output.set('x-content-type-options','nosniff');
      if(root&&request.method==='GET'&&response.status===200&&/text\/html/i.test(output.get('content-type')||'')){
        const html=(await response.text()).replace('<head>','<head><base href="/mowaqqat/"><meta name="kader-base-path" content="/mowaqqat">');
        output.delete('etag');output.delete('last-modified');return new Response(html,{status:200,headers:output});
      }
      return new Response(request.method==='HEAD'||[204,304].includes(response.status)?null:response.body,{status:response.status,headers:output});
    }catch{return portalFailure('خادم كادر غير متاح مؤقتًا؛ أعد المحاولة',503)}
  };
}

if(typeof Bun!=='undefined'){
  const hosts=[Bun.env.RAILWAY_PUBLIC_DOMAIN,Bun.env.RENDER_EXTERNAL_HOSTNAME,'kader.media','www.kader.media','access.kader.media'].filter(Boolean);
  Bun.serve({port:Number(Bun.env.PORT||3000),idleTimeout:120,maxRequestBodySize:PORTAL_MAX_BODY,fetch:createPortalGateway({allowedHosts:hosts})});
}

