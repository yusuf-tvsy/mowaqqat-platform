import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalGateway} from './gateway.mjs';

function fixture(){
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response('<!doctype html><html lang="ar" dir="rtl"><head></head><body>كادر</body></html>',{
      status:200,headers:{'content-type':'text/html; charset=utf-8','set-cookie':'session=fixture; Domain=media90.lemonygleam8.chatgpt.site; Path=/; Secure; HttpOnly; SameSite=Lax'}
    });
  };
  return {calls,handler:createPortalGateway({allowedHosts:['kader.media','access.kader.media','www.kader.media','kader-apex-test.onrender.com'],fetcher})};
}

test('apex displays the corrected central portal with no host redirect',async()=>{
  const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media/'));
  assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
  assert.equal(calls[0].url,'https://mowaqqat-full-production.up.railway.app/mowaqqat/');
  const html=await response.text();
  assert.match(html,/<base href="\/mowaqqat\/">/);
  assert.match(html,/<meta name="kader-base-path" content="\/mowaqqat">/);
});
test('retired workspace queries stay on the authenticated central portal',async()=>{
  for(const query of ['?workspace=legacy','?workspace=1']){
    const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media/'+query));
    assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
    assert.equal(calls[0].url,'https://mowaqqat-full-production.up.railway.app/mowaqqat/');
    assert.match(await response.text(),/kader-base-path/);
  }
  const {handler,calls}=fixture();
  await handler(new Request('https://kader.media/?workspace=legacy',{headers:{rsc:'1'}}));
  assert.equal(calls[0].url,'https://mowaqqat-full-production.up.railway.app/mowaqqat/');
});
test('central API alias uses the native service and retired routes are rejected',async()=>{
  for(const path of ['/api/health']){
    const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media'+path));
    assert.equal(response.status,200);assert.equal(calls[0].url,'https://mowaqqat-full-production.up.railway.app/mowaqqat'+path);
  }
  for(const path of ['/login','/_next/static/ui.js']){
    const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media'+path));
    assert.equal(response.status,404);assert.equal(calls.length,0);
  }
});
test('corrected portal and versioned assets remain available under apex',async()=>{
  for(const path of ['/mowaqqat/','/mowaqqat/ui-font-20261019.1.css','/mowaqqat/finance-ui-20261019.1.js']){
    const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media'+path));
    assert.equal(response.status,200);assert.equal(calls[0].url,'https://mowaqqat-full-production.up.railway.app'+path);
  }
});
test('unrecognized upstream cookies are not forwarded',async()=>{
  const {handler}=fixture();const response=await handler(new Request('https://kader.media/'));
  const cookie=response.headers.get('set-cookie');
  assert.equal(cookie,null);
  assert.match(response.headers.get('cache-control'),/no-store/);
});
test('both login paths use the native authenticated backend',async()=>{
  for(const [path,target] of [['/mowaqqat/api/auth/login','https://mowaqqat-full-production.up.railway.app/mowaqqat/api/auth/login'],['/api/auth/login','https://mowaqqat-full-production.up.railway.app/mowaqqat/api/auth/login']]){
    const {handler,calls}=fixture();
    const response=await handler(new Request('https://kader.media'+path,{method:'POST',headers:{origin:'https://kader.media','content-type':'application/json'},body:'{"fixture":true}'}));
    assert.equal(response.status,200);assert.equal(calls[0].url,target);
    assert.equal(calls[0].options.method,'POST');
  }
});
test('forged host is rejected before any upstream call',async()=>{
  const {handler,calls}=fixture();const response=await handler(new Request('https://example.org/'));
  assert.equal(response.status,421);assert.equal(calls.length,0);
});
test('cross-origin portal writes stay blocked',async()=>{
  const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media/mowaqqat/api/state',{method:'POST',headers:{origin:'https://example.org'},body:'{}'}));
  assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('same-origin portal writes preserve method and body',async()=>{
  const {handler,calls}=fixture();const response=await handler(new Request('https://kader.media/mowaqqat/api/state',{method:'POST',headers:{origin:'https://kader.media','content-type':'application/json'},body:'{"fixture":true}'}));
  assert.equal(response.status,200);assert.equal(calls[0].options.method,'POST');
  assert.equal(new TextDecoder().decode(calls[0].options.body),'{"fixture":true}');
});
test('legacy aliases continue serving without a forced cross-host redirect',async()=>{
  for(const host of ['access.kader.media','www.kader.media']){
    const {handler}=fixture();const response=await handler(new Request('https://'+host+'/'));
    assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
  }
});
