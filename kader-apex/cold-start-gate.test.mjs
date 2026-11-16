import test from 'node:test';
import assert from 'node:assert/strict';
import {createColdStartGate} from './cold-start-gate.mjs';
import {createPortalGateway} from './gateway.mjs';

const healthUrl = 'https://upstream.test/mowaqqat/api/health';

test('cold 502 wakes once, then 200 with ok:true marks readiness', async () => {
  let attempts = 0;
  const gate = createColdStartGate({
    healthUrl, pause: async () => {},
    fetcher: async () => ++attempts === 1
      ? new Response('not ready', {status: 502})
      : Response.json({ok: true}),
  });
  assert.equal(await gate.ensureReady(), true);
  assert.equal(await gate.ensureReady(), true);
  assert.equal(attempts, 2, 'ready TTL avoids unnecessary warm checks');
});

test('concurrent callers share exactly one unauthenticated health probe', async () => {
  let attempts = 0;
  let finish;
  const fetcher = async (url, options) => {
    attempts++;
    assert.equal(url, healthUrl);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.accept, 'application/json');
    assert.equal(options.headers.cookie, undefined);
    return await new Promise(resolve => { finish = () => resolve(Response.json({ok: true})); });
  };
  const gate = createColdStartGate({fetcher, healthUrl});
  const a = gate.ensureReady();
  const b = gate.ensureReady();
  assert.equal(attempts, 1);
  finish();
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
});

test('failed health probes do not produce false readiness', async () => {
  let attempts = 0;
  const gate = createColdStartGate({
    healthUrl, pause: async () => {}, maxAttempts: 2,
    fetcher: async () => { attempts++; return new Response('maintenance', {status: 503}); },
  });
  assert.equal(await gate.ensureReady(), false);
  assert.equal(attempts, 2);
  assert.equal(await gate.ensureReady(), false);
  assert.equal(attempts, 4, 'a failure is not cached as success');
});

test('200 without ok:true cannot mark the backend as ready', async () => {
  let attempts = 0;
  const gate = createColdStartGate({
    healthUrl, pause: async () => {}, maxAttempts: 2,
    fetcher: async () => { attempts++; return Response.json({ok: false}); },
  });
  assert.equal(await gate.ensureReady(), false);
  assert.equal(attempts, 2);
});

test('cache freshness expires after configured TTL', async () => {
  let now = 1000, attempts = 0;
  const gate = createColdStartGate({
    healthUrl, now: () => now, readyTtlMs: 2000,
    fetcher: async () => { attempts++; return Response.json({ok: true}); },
  });
  assert.equal(await gate.ensureReady(), true);
  now = 2500;
  assert.equal(await gate.ensureReady(), true);
  now = 3100;
  assert.equal(await gate.ensureReady(), true);
  assert.equal(attempts, 2);
});

test('gateway gates concurrent safe requests, but never combines their responses', async () => {
  let probes = 0, pages = 0;
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/mowaqqat/api/health') {
      probes++;
      return Response.json({ok: true});
    }
    pages++;
    return new Response('page-' + pages, {status: 200, headers: {'content-type':'text/plain'}});
  };
  const handler = createPortalGateway({
    allowedHosts: ['kader.media'], fetcher, coldStartProtection: true,
  });
  const [a, b] = await Promise.all([
    handler(new Request('https://kader.media/mowaqqat/app.js')),
    handler(new Request('https://kader.media/mowaqqat/auth.js')),
  ]);
  assert.equal(probes, 1);
  assert.equal(pages, 2);
  assert.notEqual(await a.text(), await b.text());
});

test('gateway does not probe or retry mutation requests', async () => {
  let probes = 0, writes = 0;
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/mowaqqat/api/health') { probes++; return Response.json({ok: true}); }
    writes++; return new Response('saved', {status: 201});
  };
  const handler = createPortalGateway({allowedHosts:['kader.media'],fetcher,coldStartProtection:true});
  const response = await handler(new Request('https://kader.media/mowaqqat/api/state',{
    method:'POST', headers:{origin:'https://kader.media','content-type':'application/json'}, body:'{"fixture":1}',
  }));
  assert.equal(response.status, 201);
  assert.equal(probes, 0);
  assert.equal(writes, 1);
});

test('gateway rejects cross-origin writes before probing upstream', async () => {
  let calls = 0;
  const handler = createPortalGateway({
    allowedHosts: ['kader.media'], coldStartProtection: true,
    fetcher: async () => { calls++; throw new Error('Never call upstream'); },
  });
  const result = await handler(new Request('https://kader.media/mowaqqat/api/state',{
    method:'POST',headers:{origin:'https://evil.example'},body:'{}',
  }));
  assert.equal(result.status, 403);
  assert.equal(calls, 0);
});
