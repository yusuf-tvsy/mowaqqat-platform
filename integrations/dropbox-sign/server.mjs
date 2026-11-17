import {createServer} from 'node:http';
import {createBridgeHandler} from './bridge.mjs';

const webhookKey = process.env.DROPBOX_SIGN_WEBHOOK_KEY || '';
const expectedAppId = process.env.DROPBOX_SIGN_EXPECTED_APP_ID || '';
const kaderSyncUrl = process.env.KADER_SIGN_SYNC_URL || '';
const kaderSyncToken = process.env.KADER_SIGN_SYNC_TOKEN || '';

if (!webhookKey || !kaderSyncUrl || !kaderSyncToken) {
  console.error('Bridge disabled: configure webhook key, Kader sync URL, and Kader sync token.');
  process.exit(1);
}

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('Invalid PORT');
  process.exit(1);
}

createServer(createBridgeHandler({
  webhookKey, expectedAppId, kaderSyncUrl, kaderSyncToken,
})).listen(port, '0.0.0.0', () => {
  console.log('Dropbox Sign bridge ready on port ' + port + ' (no provider secrets logged)');
});
