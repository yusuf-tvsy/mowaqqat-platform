import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createBridge, createDocumensoClient, normalizeEvent, secureEquals, validateKaderSyncUrl} from '../bridge.mjs';

const SECRET = 'test-secret-value-at-least-16-characters';
const TOKEN = 'api_test-token-do-not-use';
const SYNC = 'https://kader.media/mowaqqat/api/integrations/documenso/events';
const KADER_TOKEN = 'kader-test-token-long';
const ID = 'envelope_abcdef123456';
const BASE = {webhookSecret: SECRET, apiToken: TOKEN, kaderSyncUrl: SYNC, kaderSyncToken: KADER_TOKEN};
const sample = (event = 'DOCUMENT_COMPLETED') => ({
  event, payload: {envelopeId: ID, externalId: 'KADER-TEST-1'}, createdAt: '2026-11-17T08:00:00.000Z',
});
const api = ({id = ID, status = 'COMPLETED', externalId = 'KADER-TEST-1'} = {}) =>
  ({id, status, externalId, type: 'DOCUMENT', recipients: [{email: 'never@example.com', token: 'sensitive'}]});

async function server(t, config) {
  const s = createServer(createBridge(config));
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => s.close(resolve)));
  return 'http://127.0.0.1:' + s.address().port;
}
async function send(url, body = sample(), secret = SECRET, headers = {}) {
  return fetch(url + '/hooks/documenso', {method: 'POST', headers: {'content-type':'application/json', 'x-documenso-secret':secret, ...headers}, body:JSON.stringify(body)});
}
function fakeFetch({status = 'COMPLETED', ok = true, capture = []} = {}) {
  return async (url, options) => {
    capture.push({url, options});
    if (url.startsWith('https://app.documenso.com/')) return {ok: true, json: async () => api({status})};
    return {ok};
  };
}
test('constant-time comparison and reject unconfigured secret', () => {
  assert.equal(secureEquals(SECRET, SECRET), true);
  assert.equal(secureEquals('wrong', SECRET), false);
  assert.equal(secureEquals('', ''), false);
});
test('Kader endpoint is HTTPS and exact allowed host and path', () => {
  assert.ok(validateKaderSyncUrl(SYNC));
  assert.equal(validateKaderSyncUrl('http://kader.media/mowaqqat/api/integrations/documenso/events'),false);
  assert.equal(validateKaderSyncUrl('https://kader.media.evil.example/mowaqqat/api/integrations/documenso/events'),false);
  assert.equal(validateKaderSyncUrl('https://evil.com/mowaqqat/api/integrations/documenso/events'),false);
});
test('client only uses read-only API v2 envelope endpoints', async () => {
  const capture = [];
  const client = createDocumensoClient({token:TOKEN, fetcher:fakeFetch({capture})});
  assert.equal((await client.getEnvelope(ID)).id,ID);
  await client.listEnvelopes({page:2,perPage:10});
  assert.equal(capture.length,2);
  assert.ok(capture.every(c=>c.options.method==='GET' && c.options.headers.authorization===TOKEN));
  assert.ok(capture[0].url.endsWith('/api/v2/envelope/'+ID));
  assert.ok(capture[1].url.endsWith('/api/v2/envelope?page=2&perPage=10'));
});
test('sensitive signer details do not leak into normalized sync record', () => {
  const normalized = normalizeEvent(sample(), api());
  assert.equal(normalized.observed_status,'completed');
  assert.equal(normalized.external_contract_id,'KADER-TEST-1');
  assert.ok(!JSON.stringify(normalized).includes('never@example.com'));
  assert.ok(!JSON.stringify(normalized).includes('sensitive'));
  assert.match(normalized.idempotency_key,/^[a-f0-9]{64}$/);
});
test('valid webhook is cross-checked against provider and forwarded once', async t => {
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture})});
  const res=await send(url);
  assert.equal(res.status,200);
  assert.equal(capture.length,2);
  assert.equal(capture[1].url,SYNC);
  assert.equal(capture[1].options.headers.authorization,'Bearer '+KADER_TOKEN);
  assert.equal(JSON.parse(capture[1].options.body).provider,'documenso');
});
test('wrong webhook secret never calls any external endpoint',async t=>{
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture})});
  const res=await send(url,sample(),'wrong-secret');
  assert.equal(res.status,401);
  assert.equal(capture.length,0);
});
test('invalid envelope ID returns 400 before provider lookup',async t=>{
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture})});
  const res=await send(url,{...sample(),payload:{envelopeId:'../../admin'}});
  assert.equal(res.status,400);
  assert.equal(capture.length,0);
});
test('a fake completion event cannot override PENDING provider state',async t=>{
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture,status:'PENDING'})});
  const res=await send(url);
  assert.equal(res.status,502);
  assert.equal(capture.length,1);
});
test('outage of Kader fails closed for provider retry',async t=>{
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture,ok:false})});
  assert.equal((await send(url)).status,502);
});
test('unconfigured bridge declines webhooks',async t=>{
  const url=await server(t,{});
  assert.equal((await send(url)).status,503);
  assert.equal((await fetch(url+'/healthz')).status,503);
});
test('unsupported event declined, no external calls',async t=>{
  const capture=[];
  const url=await server(t,{...BASE,fetcher:fakeFetch({capture})});
  assert.equal((await send(url,sample('FAKE_ADMIN_CHANGE'))).status,400);
  assert.equal(capture.length,0);
});
test('wrong content-type or invalid JSON is rejected',async t=>{
  const url=await server(t,{...BASE,fetcher:fakeFetch()});
  assert.equal((await send(url,sample(),SECRET,{'content-type':'text/plain'})).status,400);
  const res=await fetch(url+'/hooks/documenso',{method:'POST',headers:{'content-type':'application/json','x-documenso-secret':SECRET},body:'{'});
  assert.equal(res.status,400);
});
