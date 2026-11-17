import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

export const DROPBOX_SIGN_ACK = 'Hello API Event Received';
const MAX_BODY_BYTES = 128 * 1024;
const STATUSES = Object.freeze({
  signature_request_sent: 'awaiting_signature',
  signature_request_signed: 'partially_signed',
  signature_request_all_signed: 'completed',
  signature_request_declined: 'declined',
  signature_request_expired: 'expired',
  signature_request_canceled: 'canceled',
});

function reply(res, status, body) {
  res.writeHead(status, {
    'content-type': status === 200 ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(status === 200 ? body : JSON.stringify({error: body}));
}

async function readLimited(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let count = 0;
  for await (const chunk of req) {
    count += chunk.length;
    if (count > limit) throw new Error('too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Dropbox Sign usually POSTs multipart/form-data with a "json" field.
export async function decodeEventBody(raw, contentType = '') {
  let data;
  const type = String(contentType).toLowerCase();
  if (type.startsWith('application/json')) {
    data = JSON.parse(raw.toString('utf8'));
  } else if (type.startsWith('application/x-www-form-urlencoded')) {
    data = {json: new URLSearchParams(raw.toString('utf8')).get('json')};
  } else if (type.startsWith('multipart/form-data')) {
    const request = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {'content-type': contentType},
      body: raw,
    });
    data = {json: (await request.formData()).get('json')};
  } else {
    throw new Error('unsupported_content_type');
  }
  const event = typeof data?.json === 'string' ? JSON.parse(data.json) : data;
  if (!event || typeof event !== 'object' || !event.event) throw new Error('missing_event');
  return event;
}

export function verifyEvent(payload, key, expectedAppId = '') {
  const event = payload?.event;
  if (!key || !event) return false;
  const time = String(event.event_time ?? '');
  const type = event.event_type;
  const supplied = String(event.event_hash ?? '');
  if (!/^[0-9]+$/.test(time) || typeof type !== 'string' || !/^[0-9a-fA-F]{64}$/.test(supplied)) return false;
  const expected = createHmac('sha256', key).update(time + type).digest();
  if (!timingSafeEqual(expected, Buffer.from(supplied, 'hex'))) return false;
  if (expectedAppId && event.event_metadata?.reported_for_app_id !== expectedAppId) return false;
  return true;
}

export function normalizeEvent(payload) {
  const event = payload.event;
  if (event.event_type === 'callback_test') return null;
  const status = STATUSES[event.event_type];
  if (!status) return null; // New event types require explicit mapping and review.
  const requestId = payload.signature_request?.signature_request_id;
  if (typeof requestId !== 'string' || !requestId) throw new Error('missing_signature_request_id');
  const time = String(event.event_time);
  const signatureId = event.event_metadata?.related_signature_id || '';
  const idempotencyKey = createHash('sha256')
    .update([requestId, event.event_type, time, signatureId].join('|')).digest('hex');
  return {
    schema_version: 1,
    provider: 'dropbox_sign',
    signature_request_id: requestId,
    event_type: event.event_type,
    occurred_at: new Date(Number(time) * 1000).toISOString(),
    status,
    idempotency_key: idempotencyKey,
  };
}

function safeKaderUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'kader.media' && !host.endsWith('.kader.media')) return null;
  if (url.username || url.password || url.hash) return null;
  return url.href;
}

export function createBridgeHandler({
  webhookKey = '',
  expectedAppId = '',
  kaderSyncUrl = '',
  kaderSyncToken = '',
  fetcher = fetch,
} = {}) {
  return async function handler(req, res) {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path === '/healthz' && req.method === 'GET') return reply(res, 200, 'ok');
    if (path !== '/hooks/dropbox-sign' || req.method !== 'POST') return reply(res, 404, 'not_found');
    if (!webhookKey) return reply(res, 503, 'webhook_not_configured');

    let payload;
    try {
      const raw = await readLimited(req);
      payload = await decodeEventBody(raw, req.headers['content-type'] || '');
    } catch (error) {
      return reply(res, error.message === 'too_large' ? 413 : 400, 'invalid_event_payload');
    }
    if (!verifyEvent(payload, webhookKey, expectedAppId)) return reply(res, 403, 'invalid_event_hash');

    let normalized;
    try { normalized = normalizeEvent(payload); }
    catch { return reply(res, 400, 'invalid_signature_request'); }
    if (!normalized) return reply(res, 200, DROPBOX_SIGN_ACK);

    const target = safeKaderUrl(kaderSyncUrl);
    if (!target || !kaderSyncToken) return reply(res, 503, 'kader_sync_not_configured');
    try {
      const upstream = await fetcher(target, {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + kaderSyncToken,
          'content-type': 'application/json',
          'idempotency-key': normalized.idempotency_key,
        },
        body: JSON.stringify(normalized),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) return reply(res, 502, 'kader_sync_failed');
      return reply(res, 200, DROPBOX_SIGN_ACK);
    } catch {
      return reply(res, 502, 'kader_sync_failed');
    }
  };
}
