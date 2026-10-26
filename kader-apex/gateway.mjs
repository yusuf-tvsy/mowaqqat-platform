export const PORTAL_RELEASE='2.8.0';
export const PORTAL_UPSTREAM='https://mowaqqat-full-production.up.railway.app';
const PORTAL_MAX_BODY=52*1024*1024;
const PORTAL_SAFE=new Set(['GET','HEAD','OPTIONS']);
const PORTAL_HEADERS=['accept','accept-language','content-type','x-csrf-token','idempotency-key','range','if-range','if-none-match','if-modified-since','origin','referer'];
const PORTAL_HOP=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-length','content-encoding','access-control-allow-origin','access-control-allow-credentials'];
function portalFailure(message,status=502){return new Response(JSON.stringify({detail:message}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function portalCookie(value){return (value||'').split(';').map(v=>v.trim()).find(v=>/^mowaqqat_session=[A-Za-z0-9_-]+$/.test(v))||''}

export function createPortalGateway({allowedHosts,fetcher=fetch,legacyHandler}={}){
  const hosts=new Set(allowedHosts||['kader.media','www.kader.media','access.kader.media']);
  return async function portalGateway(request){
    const url=new URL(request.url);
    if(!hosts.has(url.hostname.toLowerCase()))return portalFailure('Unrecognized host',421);
    if(url.pathname==='/_portal/health')return Response.json({status:'ok',service:'kader-portal',release:PORTAL_RELEASE},{headers:{'cache-control':'no-store'}});
    const root=url.pathname==='/';
    const api=url.pathname==='/api'||url.pathname.startsWith('/api/');
    if(!root&&!api&&url.pathname!=='/mowaqqat'&&!url.pathname.startsWith('/mowaqqat/'))return portalFailure('Not found',404);
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
    const target=new URL(PORTAL_UPSTREAM);target.pathname=root?'/mowaqqat/':api?'/mowaqqat'+url.pathname:url.pathname;target.search=url.search;if(root)target.searchParams.delete('workspace');
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


