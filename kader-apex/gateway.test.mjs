import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalGateway, PORTAL_RELEASE, PORTAL_UPSTREAM} from './gateway.mjs';

const root = 'https://kader.media';
function fixture(responder = () => new Response('<!doctype html><html lang="ar" dir="rtl"><head></head><body>كادر</body></html>', {status: 200, headers: {'content-type': 'text/html; charset=utf-8'}})) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url: String(url), options});
    return responder(url, options);
  };
  return {calls, handler: createPortalGateway({allowedHosts: ['kader.media', 'www.kader.media', 'access.kader.media'], fetcher})};
}

test('portal release remains explicit and root renders the unified interface', async () => {
  const {handler, calls} = fixture();
  const response = await handler(new Request(root + '/'));
  assert.equal(PORTAL_RELEASE, '2.8.0');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('x-kader-portal-release'), PORTAL_RELEASE);
  assert.equal(calls[0].url, PORTAL_UPSTREAM + '/mowaqqat/');
  const html = await response.text();
  assert.match(html, /<base href="\/mowaqqat\/">/);
  assert.match(html, /<meta name="kader-base-path" content="\/mowaqqat">/);
});

test('root removes the obsolete workspace override without deleting other query parameters', async () => {
  const {handler, calls} = fixture();
  await handler(new Request(root + '/?workspace=legacy&view=tasks'));
  assert.equal(calls[0].url, PORTAL_UPSTREAM + '/mowaqqat/?view=tasks');
});

test('health endpoint is served locally without querying backend', async () => {
  const {handler, calls} = fixture();
  const response = await handler(new Request(root + '/_portal/health'));
  assert.deepEqual(await response.json(), {status: 'ok', service: 'kader-portal', release: PORTAL_RELEASE});
  assert.equal(calls.length, 0);
});

test('API paths and versioned assets use the central backend', async () => {
  for (const [path, target] of [
    ['/api/health', '/mowaqqat/api/health'],
    ['/api/auth/login', '/mowaqqat/api/auth/login'],
    ['/mowaqqat/', '/mowaqqat/'],
    ['/mowaqqat/ui-font-20261019.1.css', '/mowaqqat/ui-font-20261019.1.css'],
  ]) {
    const {handler, calls} = fixture();
    const response = await handler(new Request(root + path));
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, PORTAL_UPSTREAM + target);
  }
});

test('missing slash in /mowaqqat redirects within the same host', async () => {
  const {handler, calls} = fixture();
  const response = await handler(new Request(root + '/mowaqqat?view=tasks'));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/mowaqqat/?view=tasks');
  assert.equal(calls.length, 0);
});

test('unrecognized routes are rejected rather than reaching any backend', async () => {
  const {handler, calls} = fixture();
  assert.equal((await handler(new Request(root + '/some-old-page'))).status, 404);
  assert.equal(calls.length, 0);
});

test('forged hosts are rejected before forwarding', async () => {
  const {handler, calls} = fixture();
  assert.equal((await handler(new Request('https://example.org/'))).status, 421);
  assert.equal(calls.length, 0);
});

test('same-origin write enforces the origin and forwards method, CSRF header and body', async () => {
  const {handler, calls} = fixture();
  const response = await handler(new Request(root + '/api/tasks/1', {
    method: 'PATCH', headers: {origin: root, 'content-type': 'application/json', 'x-csrf-token': 'token-example'}, body: '{"status":"done"}'
  }));
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, PORTAL_UPSTREAM + '/mowaqqat/api/tasks/1');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers.get('x-csrf-token'), 'token-example');
  assert.equal(new TextDecoder().decode(calls[0].options.body), '{"status":"done"}');
});

test('write requests without an origin or from another site cannot reach the backend', async () => {
  for (const headers of [{}, {origin: 'https://example.org'}, {origin: root, 'sec-fetch-site': 'cross-site'}]) {
    const {handler, calls} = fixture();
    const response = await handler(new Request(root + '/api/tasks', {method: 'POST', headers, body: '{}'}));
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  }
});

test('writes to root and unsupported methods are rejected', async () => {
  const {handler, calls} = fixture();
  assert.equal((await handler(new Request(root + '/', {method: 'POST', headers: {origin: root}, body: 'x'}))).status, 405);
  assert.equal((await handler({url: root + '/api/tasks', method: 'TRACE', headers: new Headers()})).status, 405);
  assert.equal(calls.length, 0);
});

test('declared oversized requests are stopped before backend access', async () => {
  const {handler, calls} = fixture();
  const response = await handler(new Request(root + '/api/upload', {method: 'POST', headers: {origin: root, 'content-length': String(53 * 1024 * 1024)}, body: 'x'}));
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test('session cookies are host-only, secure and scoped for the central portal', async () => {
  const {handler, calls} = fixture(() => new Response('ok', {status: 200, headers: {
    'set-cookie': 'mowaqqat_session=abc123; Domain=wrong.example; Path=/mowaqqat; HttpOnly; SameSite=Lax',
    'content-type': 'text/plain', 'access-control-allow-origin': '*', connection: 'keep-alive'
  }}));
  const response = await handler(new Request(root + '/api/health', {headers: {cookie: 'noise=secret; mowaqqat_session=abc123'}}));
  assert.equal(calls[0].options.headers.get('cookie'), 'mowaqqat_session=abc123');
  const cookie = response.headers.get('set-cookie') || '';
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /HttpOnly/i);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('connection'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('unrelated cookies are not passed through from backend', async () => {
  const {handler} = fixture(() => new Response('ok', {headers: {'set-cookie': 'legacy_session=secret; Path=/'}}));
  const response = await handler(new Request(root + '/api/health'));
  assert.equal(response.headers.get('set-cookie'), null);
});

test('backend redirects remain on the public origin', async () => {
  const {handler} = fixture(() => new Response(null, {status: 302, headers: {location: PORTAL_UPSTREAM + '/mowaqqat/login?next=tasks'}}));
  const response = await handler(new Request(root + '/mowaqqat/'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/mowaqqat/login?next=tasks');
});

test('unexpected redirects are blocked', async () => {
  for (const location of ['https://evil.example/', PORTAL_UPSTREAM + '/admin']) {
    const {handler} = fixture(() => new Response(null, {status: 302, headers: {location}}));
    assert.equal((await handler(new Request(root + '/api/health'))).status, 502);
  }
});

test('unavailable backend yields a controlled 503', async () => {
  const handler = createPortalGateway({allowedHosts: ['kader.media'], fetcher: async () => {throw new Error('upstream unavailable');}});
  const response = await handler(new Request(root + '/api/health'));
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('HEAD responses do not include a response body', async () => {
  const {handler} = fixture();
  const response = await handler(new Request(root + '/mowaqqat/', {method: 'HEAD'}));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('aliases point at central Kader without cross-host redirects', async () => {
  for (const host of ['www.kader.media', 'access.kader.media']) {
    const {handler, calls} = fixture();
    const response = await handler(new Request('https://' + host + '/'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(calls[0].url, PORTAL_UPSTREAM + '/mowaqqat/');
  }
});
