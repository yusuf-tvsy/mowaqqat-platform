import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {
  DROPBOX_SIGN_ACK, createBridgeHandler, decodeEventBody,
  normalizeEvent, verifyEvent,
} from '../bridge.mjs';

const KEY = 'temporary-fixture-key-not-a-real-secret';
function fixture(type = 'signature_request_all_signed', extra = {}) {
  const time = '1794873600';
  const hash = createHmac('sha256', KEY).update(time + type).digest('hex');
  return {
    event: {
      event_time: time,
      event_type: type,
      event_hash: hash,
      event_metadata: {reported_for_app_id: 'test-app', related_signature_id: 'sig-1'},
    },
    signature_request: {signature_request_id: 'fake-test-request', signer_name: 'not-forwarded'},
    ...extra,
  };
}

async function withServer(t, config) {
  const server = createServer(createBridgeHandler(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

async function send(base, payload, headers = {}) {
  return fetch(base + '/hooks/dropbox-sign', {
    method: 'POST',
    headers: {'content-type': 'application/json', ...headers},
    body: JSON.stringify(payload),
  });
}

test('HMAC accepts authentic event and rejects altered app and hash', () => {
  const good = fixture();
  assert.equal(verifyEvent(good, KEY, 'test-app'), true);
  assert.equal(verifyEvent(good, KEY, 'other-app'), false);
  assert.equal(verifyEvent({...good, event: {...good.event, event_hash: '0'.repeat(64)}}, KEY), false);
  assert.equal(verifyEvent(good, 'wrong-key'), false);
});

test('decodes JSON, urlencoded and multipart Dropbox Sign payloads', async () => {
  const event = fixture();
  const json = JSON.stringify(event);
  assert.deepEqual(await decodeEventBody(Buffer.from(json), 'application/json'), event);
  assert.deepEqual(await decodeEventBody(Buffer.from(new URLSearchParams({json}).toString()), 'application/x-www-form-urlencoded'), event);
  const form = new FormData();
  form.set('json', json);
  const request = new Request('http://localhost/', {method: 'POST', body: form});
  const body = Buffer.from(await request.arrayBuffer());
  assert.deepEqual(await decodeEventBody(body, request.headers.get('content-type')), event);
});

test('normalizes minimal metadata and never forwards signer names', () => {
  const normalized = normalizeEvent(fixture());
  assert.equal(normalized.status, 'completed');
  assert.equal(normalized.provider, 'dropbox_sign');
  assert.ok(/^[0-9a-f]{64}$/.test(normalized.idempotency_key));
  assert.ok(!JSON.stringify(normalized).includes('not-forwarded'));
});

test('valid webhook forwards only signed metadata and acknowledges', async (t) => {
  const calls = [];
  const base = await withServer(t, {
    webhookKey: KEY, expectedAppId: 'test-app',
    kaderSyncUrl: 'https://kader.media/mowaqqat/api/integrations/dropbox-sign/events',
    kaderSyncToken: 'test-token',
    fetcher: async (url, options) => { calls.push({url, options}); return {ok: true}; },
  });
  const response = await send(base, fixture());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), DROPBOX_SIGN_ACK);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-token');
  assert.equal(calls[0].options.headers['idempotency-key'], JSON.parse(calls[0].options.body).idempotency_key);
  assert.ok(!calls[0].options.body.includes('signer_name'));
});

test('invalid webhook never reaches Kader', async (t) => {
  let forwarded = 0;
  const base = await withServer(t, {webhookKey: KEY, kaderSyncUrl: 'https://kader.media/api', kaderSyncToken: 'x',
    fetcher: async () => { forwarded += 1; return {ok: true}; }});
  const bad = fixture();
  bad.event.event_hash = 'f'.repeat(64);
  const response = await send(base, bad);
  assert.equal(response.status, 403);
  assert.equal(forwarded, 0);
});

test('no Kader endpoint returns retryable failure instead of falsely acknowledging', async (t) => {
  const base = await withServer(t, {webhookKey: KEY});
  const response = await send(base, fixture());
  assert.equal(response.status, 503);
});

test('sync error causes retryable failure', async (t) => {
  const base = await withServer(t, {
    webhookKey: KEY, kaderSyncUrl: 'https://kader.media/api', kaderSyncToken: 'test',
    fetcher: async () => ({ok: false}),
  });
  const response = await send(base, fixture());
  assert.equal(response.status, 502);
});

test('callback_test is acknowledged without creating a Kader record', async (t) => {
  const base = await withServer(t, {webhookKey: KEY, expectedAppId: 'test-app'});
  const response = await send(base, fixture('callback_test'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), DROPBOX_SIGN_ACK);
});

test('other routes do not write or disclose anything', async (t) => {
  const base = await withServer(t, {});
  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  const unknown = await fetch(base + '/api/contracts');
  assert.equal(unknown.status, 404);
});

test('cannot forward to non-Kader origin or non-HTTPS endpoint', async (t) => {
  for (const kaderSyncUrl of ['https://kader.media.evil.example/receive', 'http://kader.media/receive']) {
    const base = await withServer(t, {webhookKey: KEY, kaderSyncUrl, kaderSyncToken: 'x'});
    const result = await send(base, fixture());
    assert.equal(result.status, 503);
  }
});
