import {readFileSync} from 'node:fs';
import {repairPortalAsset,UI_REPAIR_REV,UI_REPAIR_CSS_PATH} from './ui-repair.mjs';
const UI_REPAIR_CSS=readFileSync(new URL('./ui-repair.css',import.meta.url),'utf8');
export const PORTAL_RELEASE='2.8.0';
export const PORTAL_UPSTREAM='https://mowaqqat-full-production.up.railway.app';
const UI_FIX_PATH='/_kader/ui-correction-20261110.css';
const UI_FIX_REV='20261110.v1';
const UI_FIX_CSS=String.raw`/* KADER_UI_CORRECTION_20261110_V1
   Scope: presentation only. Append AFTER the existing design-system.css rules
   on a verified PRIVATE staging copy of the exact current runtime source.
   Do not load it from an external host, do not edit roles/data or task workflow.
*/
:root {
  --kader-a11y-side: #123c38;
  --kader-a11y-side-label: #e6eee7;
  --kader-a11y-side-secondary: #d5e5da;
  --kader-a11y-side-hover: #21564e;
  --kader-a11y-side-active: #eaf1e7;
  --kader-a11y-ink: #173b36;
  --kader-a11y-border: #dfe6d9;
  --kader-a11y-focus: #dfc889;
}
/* Restore readable text after 2026-11-08 dark sidebar override.
   Use explicit high-specificity selectors instead of changing all component tokens. */
body[data-kader-ui="portal"] .sidebar {
  background: var(--kader-a11y-side) !important;
  color: #f2f8f4;
}
body[data-kader-ui="portal"] .sidebar .nav-item,
body[data-kader-ui="portal"] .sidebar .side-collapse {
  color: var(--kader-a11y-side-label);
}
body[data-kader-ui="portal"] .sidebar .nav-heading,
body[data-kader-ui="portal"] .sidebar .logo-tag,
body[data-kader-ui="portal"] .sidebar .workspace-pill small,
body[data-kader-ui="portal"] .sidebar .side-user small {
  color: var(--kader-a11y-side-secondary);
}
body[data-kader-ui="portal"] .sidebar .logo-name,
body[data-kader-ui="portal"] .sidebar .workspace-pill strong,
body[data-kader-ui="portal"] .sidebar .side-user strong {
  color: #fff;
}
body[data-kader-ui="portal"] .sidebar .workspace-pill {
  background: rgba(255,255,255,.075);
  border-color: rgba(255,255,255,.34);
}
body[data-kader-ui="portal"] .sidebar .nav-item:hover,
body[data-kader-ui="portal"] .sidebar .nav-item:focus-visible {
  background: var(--kader-a11y-side-hover);
  color: #fff;
}
body[data-kader-ui="portal"] .sidebar .nav-item.active,
body[data-kader-ui="portal"] .sidebar .nav-item.active:hover,
body[data-kader-ui="portal"] .sidebar .nav-item.active:focus-visible {
  background: var(--kader-a11y-side-active);
  color: #153b2e;
  font-weight: 600;
}
body[data-kader-ui="portal"] .sidebar .nav-item.active .icon-slot,
body[data-kader-ui="portal"] .sidebar .nav-item.active svg {
  color: currentColor;
}
body[data-kader-ui="portal"] .sidebar .nav-item:focus-visible,
body[data-kader-ui="portal"] .sidebar .side-collapse:focus-visible {
  outline: 3px solid var(--kader-a11y-focus);
  outline-offset: 2px;
}
/* Common interactive controls: avoid the 39px regression introduced in the
   newer last-pass CSS. Exempt intentionally compact table controls from layout
   changes until their role-specific screenshots and flows are verified. */
body[data-kader-ui="portal"] .topbar button,
body[data-kader-ui="portal"] .head-actions .btn,
body[data-kader-ui="portal"] .task-flow-toolbar .btn,
body[data-kader-ui="portal"] .task-flow-primary .btn,
body[data-kader-ui="portal"] .modal-foot .btn,
body[data-kader-ui="portal"] .hub-card-actions .btn {
  min-height: 44px;
}
/* Consistent bounded content and visible focus for data-rich RTL screens. */
body[data-kader-ui] :is(.page-inner,.panel,.card,.form-grid,.layout-grid) { min-width: 0; }
body[data-kader-ui] :is(.table-wrap,.table-scroll) { max-width: 100%; }
body[data-kader-ui] :is(.form-grid,.layout-grid) > * { min-width: 0; }
body[data-kader-ui] :is(button,input,select,textarea,a):focus-visible {
  outline: 3px solid #9b742e;
  outline-offset: 2px;
}
body[data-kader-ui] :is(input,select,textarea) { max-width:100%; }
body[data-kader-ui] :is(.panel,.card,.stat-card) { border-color: var(--kader-a11y-border); }
/* Avoid misleading status colors: do not recolor semantic danger/warning states. */
@media (max-width: 440px) {
  body[data-kader-ui="portal"] .sidebar .nav-item { min-height: 44px; }
  body[data-kader-ui="portal"] .page-inner { padding-inline: 16px !important; }
}
@media (prefers-reduced-motion: reduce) {
  body[data-kader-ui] :is(.sidebar,.nav-item,.btn) {
    transition-duration: .01ms !important;
  }
}
`;
const UI_FIX_LINK=`<link rel="stylesheet" href="${UI_FIX_PATH}" data-kader-ui-fix="${UI_FIX_REV}">`;
function attachUiFix(html){
  if(typeof html!=='string')return html;
  if(!html.includes(`data-kader-ui-fix="${UI_FIX_REV}"`))html=html.replace(/<\/head>/i,UI_FIX_LINK+'</head>');
  if(!html.includes(`data-kader-ui-repair="${UI_REPAIR_REV}"`))html=html.replace(/<\/head>/i,`<link rel="stylesheet" href="${UI_REPAIR_CSS_PATH}" data-kader-ui-repair="${UI_REPAIR_REV}"></head>`);
  return html;
}
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
    if(url.pathname===UI_REPAIR_CSS_PATH){
      if(!['GET','HEAD'].includes(request.method))return portalFailure('Method not allowed',405);
      return new Response(request.method==='HEAD'?null:UI_REPAIR_CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff','x-kader-ui-repair':UI_REPAIR_REV}});
    }
    if(url.pathname===UI_FIX_PATH){
      if(!['GET','HEAD'].includes(request.method))return portalFailure('Method not allowed',405);
      return new Response(request.method==='HEAD'?null:UI_FIX_CSS,{status:200,headers:{
        'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300',
        'x-content-type-options':'nosniff','x-kader-ui-fix':UI_FIX_REV}});
    }
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
      if(request.method==='GET'&&response.status===200&&/^\/mowaqqat\/(?:app(?:-limited)?|people)\.js$/.test(url.pathname)){
        const original=await response.text();
        const repaired=repairPortalAsset(url.pathname,original);
        output.delete('etag');output.delete('last-modified');
        if(repaired!==original)output.set('x-kader-ui-repair',UI_REPAIR_REV);
        return new Response(repaired,{status:200,headers:output});
      }
      if(request.method==='GET'&&response.status===200&&/text\/html/i.test(output.get('content-type')||'')){
        const upstreamHtml=await response.text();
        const baseHtml=root?upstreamHtml.replace('<head>','<head><base href="/mowaqqat/"><meta name="kader-base-path" content="/mowaqqat">'):upstreamHtml;
        const html=attachUiFix(baseHtml);
        if(html!==baseHtml)output.set('x-kader-ui-fix',UI_FIX_REV);
        output.delete('etag');output.delete('last-modified');
        return new Response(html,{status:200,headers:output});
      }
      return new Response(request.method==='HEAD'||[204,304].includes(response.status)?null:response.body,{status:response.status,headers:output});
    }catch{return portalFailure('خادم كادر غير متاح مؤقتًا؛ أعد المحاولة',503)}
  };
}

if(typeof Bun!=='undefined'){
  const hosts=[Bun.env.RAILWAY_PUBLIC_DOMAIN,Bun.env.RENDER_EXTERNAL_HOSTNAME,'kader.media','www.kader.media','access.kader.media'].filter(Boolean);
  Bun.serve({port:Number(Bun.env.PORT||3000),idleTimeout:120,maxRequestBodySize:PORTAL_MAX_BODY,fetch:createPortalGateway({allowedHosts:hosts})});
}


