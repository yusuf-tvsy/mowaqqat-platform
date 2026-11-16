import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithSafeReadRetries} from './safe-read-retry.mjs';

const base = {url: 'https://example.invalid/api/health', options: {}, method: 'GET', delay: async () => {}};

test('GET retries one 503 and then succeeds', async () => {
  let calls = 0;
  const response = await fetchWithSafeReadRetries({...base, fetcher: async () =>
    new Response(++calls === 1 ? 'unavailable' : 'ok', {status: calls === 1 ? 503 : 200})});
  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
});

test('GET retries transient network errors', async () => {
  let calls = 0;
  const response = await fetchWithSafeReadRetries({...base, fetcher: async () => {
    if (++calls === 1) throw new Error('ECONNRESET');
    return new Response('ok');
  }});
  assert.equal(calls, 2);
  assert.equal(response.status, 200);
});

test('HEAD retries transient 502 once', async () => {
  let calls = 0;
  const response = await fetchWithSafeReadRetries({...base, method: 'HEAD', fetcher: async () =>
    new Response(null, {status: ++calls === 1 ? 502 : 204})});
  assert.equal(calls, 2);
  assert.equal(response.status, 204);
});

test('POST/PUT/PATCH/DELETE never retry', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let calls = 0;
    const response = await fetchWithSafeReadRetries({...base, method, fetcher: async () => {
      calls++;
      return new Response('busy', {status: 503});
    }});
    assert.equal(calls, 1, method);
    assert.equal(response.status, 503);
  }
});

test('GET does not retry 401/403/404', async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0;
    const response = await fetchWithSafeReadRetries({...base, fetcher: async () => {
      calls++;
      return new Response('client failure', {status});
    }});
    assert.equal(calls, 1);
    assert.equal(response.status, status);
  }
});

test('GET stops after three failed upstream attempts', async () => {
  let calls = 0;
  const response = await fetchWithSafeReadRetries({...base, fetcher: async () => {
    calls++;
    return new Response('busy', {status: 503});
  }});
  assert.equal(calls, 3);
  assert.equal(response.status, 503);
});

test('aborted upstream calls do not retry', async () => {
  let calls = 0;
  const controller = new AbortController();
  await assert.rejects(fetchWithSafeReadRetries({...base, options: {signal: controller.signal}, fetcher: async () => {
    calls++;
    controller.abort();
    throw new Error('aborted');
  }}), /aborted/);
  assert.equal(calls, 1);
});
