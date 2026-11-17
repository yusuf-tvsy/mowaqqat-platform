import {createServer} from 'node:http';
import {createBridge, validateKaderSyncUrl} from './bridge.mjs';

const webhookSecret = process.env.DOCUMENSO_WEBHOOK_SECRET || '';
const apiToken = process.env.DOCUMENSO_API_TOKEN || '';
const kaderSyncUrl = process.env.KADER_DOCUMENSO_SYNC_URL || '';
const kaderSyncToken = process.env.KADER_DOCUMENSO_SYNC_TOKEN || '';

if (webhookSecret.length < 16 || !apiToken.startsWith('api_') ||
    !validateKaderSyncUrl(kaderSyncUrl) || kaderSyncToken.length < 16) {
  console.error('Documenso bridge disabled: missing or invalid secured configuration.');
  process.exit(1);
}

const port = Number(process.env.PORT || '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) process.exit(1);

const handler = createBridge({webhookSecret, apiToken, kaderSyncUrl, kaderSyncToken});
createServer(handler).listen(port, '0.0.0.0', () => {
  console.log('Documenso bridge listening; no credentials are logged.');
});
