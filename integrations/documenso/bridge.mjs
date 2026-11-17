import {createHash, timingSafeEqual} from 'node:crypto';

const MAX_EVENT_BYTES = 128 * 1024;
const VALID_EVENTS = new Set([
  'DOCUMENT_CREATED', 'DOCUMENT_SENT', 'DOCUMENT_OPENED',
  'DOCUMENT_SIGNED', 'DOCUMENT_RECIPIENT_COMPLETED',
  'DOCUMENT_COMPLETED', 'DOCUMENT_REJECTED',
  'DOCUMENT_CANCELLED', 'RECIPIENT_EXPIRED',
]);
const STATUS_MAP = Object.freeze({
  DRAFT: 'draft', PENDING: 'awaiting_signature',
  COMPLETED: 'completed', REJECTED: 'rejected', CANCELLED: 'cancelled',
});
export const PROVIDER_API = 'https://app.documenso.com/api/v2';

function result(res, status, detail) {
  const payload = JSON.stringify(status < 300 ? {received: true} : {error: detail});
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

export function secureEquals(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string' || !expected) return false;
  const x = Buffer.from(received, 'utf8'), y = Buffer.from(expected, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function validEnvelopeId(id) {
  return typeof id === 'string' && /^envelope_[A-Za-z0-9_-]{6,100}$/.test(id);
}

export function validateKaderSyncUrl(input) {
  let url;
  try { url = new URL(input); } catch { return false; }
  return url.protocol === 'https:' && url.hostname.toLowerCase() === 'kader.media' &&
    !url.username && !url.password && !url.hash &&
    url.pathname.startsWith('/mowaqqat/api/integrations/documenso/');
}

export function normalizeEvent(incoming, remote) {
  if (!incoming || typeof incoming !== 'object' || !VALID_EVENTS.has(incoming.event)) throw new Error('unrecognized_event');
  const id = incoming.payload?.envelopeId;
  if (!validEnvelopeId(id) || remote?.id !== id || remote.type !== 'DOCUMENT') throw new Error('unknown_envelope');
  if (!Object.hasOwn(STATUS_MAP, remote.status)) throw new Error('unknown_provider_status');
  const externalId = remote.externalId;
  if (typeof externalId !== 'string' || externalId.length < 1 || externalId.length > 200) throw new Error('not_kader_managed');
  if (incoming.payload?.externalId != null && incoming.payload.externalId !== externalId) throw new Error('external_id_mismatch');
  const timestamp = Date.parse(incoming.createdAt);
  if (!Number.isFinite(timestamp)) throw new Error('invalid_timestamp');
  // A completion event must be confirmed by the authoritative API before updating Kader.
  if (incoming.event === 'DOCUMENT_COMPLETED' && remote.status !== 'COMPLETED') throw new Error('provider_not_completed');
  const idempotency = createHash('sha256').update([id, incoming.event, incoming.createdAt, remote.status].join('|')).digest('hex');
  return {
    schema_version: 1,
    provider: 'documenso',
    envelope_id: id,
    external_contract_id: externalId,
    event_type: incoming.event,
    observed_status: STATUS_MAP[remote.status],
    occurred_at: new Date(timestamp).toISOString(),
    idempotency_key: idempotency,
  };
}

async function limitedJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Error('content_type');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_EVENT_BYTES) throw new Error('oversize');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createDocumensoClient({token, fetcher = fetch, apiBase = PROVIDER_API} = {}) {
  if (!token || apiBase !== PROVIDER_API) throw new Error('invalid_provider_configuration');
  async function getJson(path) {
    const response = await fetcher(apiBase + path, {
      method: 'GET',
      headers: {authorization: token, accept: 'application/json'},
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('provider_unavailable_' + response.status);
    return response.json();
  }
  return {
    getEnvelope(id) {
      if (!validEnvelopeId(id)) throw new Error('invalid_envelope_id');
      return getJson('/envelope/' + encodeURIComponent(id));
    },
    listEnvelopes({page = 1, perPage = 20} = {}) {
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100)
        throw new Error('invalid_pagination');
      return getJson('/envelope?page=' + page + '&perPage=' + perPage);
    },
  };
}

export function createBridge({
  webhookSecret = '', apiToken = '', kaderSyncUrl = '', kaderSyncToken = '',
  fetcher = fetch,
} = {}) {
  const configReady = webhookSecret.length >= 16 && apiToken.startsWith('api_') &&
    kaderSyncToken.length >= 16 && validateKaderSyncUrl(kaderSyncUrl);
  const client = apiToken.startsWith('api_') ? createDocumensoClient({token: apiToken, fetcher}) : null;
  return async function handler(req, res) {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/healthz') return result(res, configReady ? 200 : 503, 'unconfigured');
    if (req.method !== 'POST' || path !== '/hooks/documenso') return result(res, 404, 'not_found');
    if (!configReady) return result(res, 503, 'not_configured');
    if (!secureEquals(req.headers['x-documenso-secret'], webhookSecret)) return result(res, 401, 'unauthorized');

    let event;
    try { event = await limitedJson(req); }
    catch (error) { return result(res, error.message === 'oversize' ? 413 : 400, 'invalid_payload'); }

    if (!VALID_EVENTS.has(event?.event)) return result(res, 400, 'unsupported_event');
    if (!validEnvelopeId(event.payload?.envelopeId)) return result(res, 400, 'invalid_envelope');

    let normalized;
    try {
      const remote = await client.getEnvelope(event.payload.envelopeId);
      normalized = normalizeEvent(event, remote);
    } catch {
      // Do not acknowledge a webhook unless its envelope and status were verified.
      return result(res, 502, 'provider_verification_failed');
    }

    try {
      const response = await fetcher(kaderSyncUrl, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + kaderSyncToken,
          'content-type': 'application/json',
          'idempotency-key': normalized.idempotency_key,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify(normalized),
      });
      if (!response.ok) return result(res, 502, 'kader_sync_failed');
      return result(res, 200);
    } catch {
      return result(res, 502, 'kader_sync_failed');
    }
  };
}
