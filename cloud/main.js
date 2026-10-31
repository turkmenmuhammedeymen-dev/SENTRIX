/**
 * SENTRIX — Back4App Cloud Code
 * Deploy as cloud/main.js in the SENTRIX Back4App app.
 * All privileged writes use masterKey only after validating request.user.
 */
const APP = 'SENTRIX';
const MAX_URL = 2048;
const now = () => new Date();
function requireUser(request) { if (!request.user) throw new Error('AUTH_REQUIRED'); return request.user; }
function cleanText(value, max, field) {
  if (typeof value !== 'string') throw new Error(field + '_INVALID');
  const v = value.trim();
  if (!v || v.length > max) throw new Error(field + '_INVALID');
  return v;
}
function safeUrl(value) {
  const raw = cleanText(value, MAX_URL, 'URL');
  let u; try { u = new URL(raw); } catch (_) { throw new Error('URL_INVALID'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('URL_INVALID');
  return { url: u.toString(), host: u.hostname.toLowerCase() };
}
async function ownedAsset(user, id) {
  const q = new Parse.Query('SxAsset'); q.equalTo('objectId', cleanText(id, 64, 'ASSET_ID')); q.equalTo('owner', user);
  const asset = await q.first({ useMasterKey: true }); if (!asset) throw new Error('ASSET_NOT_FOUND'); return asset;
}
Parse.Cloud.define('sentrixHealth', async () => ({ app: APP, status: 'ok', version: '1.0.0', serverTime: now().toISOString() }));
Parse.Cloud.define('sentrixAddAsset', async request => {
  const user = requireUser(request);
  if (request.params.authorizationConfirmed !== true) throw new Error('AUTHORIZATION_REQUIRED');
  const parsed = safeUrl(request.params.url);
  const q = new Parse.Query('SxAsset'); q.equalTo('owner', user); q.equalTo('host', parsed.host);
  const existing = await q.first({ useMasterKey: true });
  if (existing) return { id: existing.id, url: existing.get('url'), host: existing.get('host'), existing: true };
  const Asset = Parse.Object.extend('SxAsset'); const asset = new Asset();
  asset.set('owner', user); asset.set('url', parsed.url); asset.set('host', parsed.host);
  asset.set('authorizationConfirmed', request.params.authorizationConfirmed === true);
  asset.set('status', 'registered');
  await asset.save(null, { useMasterKey: true });
  await audit(user, asset, 'asset.registered');
  return { id: asset.id, url: asset.get('url'), host: asset.get('host'), existing: false };
});
Parse.Cloud.define('sentrixListAssets', async request => {
  const user = requireUser(request); const q = new Parse.Query('SxAsset'); q.equalTo('owner', user); q.descending('createdAt'); q.limit(100);
  const rows = await q.find({ useMasterKey: true });
  return rows.map(x => ({ id: x.id, url: x.get('url'), host: x.get('host'), status: x.get('status'), createdAt: x.createdAt }));
});
Parse.Cloud.define('sentrixDeleteAsset', async request => {
  const user = requireUser(request); const asset = await ownedAsset(user, request.params.assetId);
  await audit(user, asset, 'asset.deleted'); await asset.destroy({ useMasterKey: true }); return { deleted: true };
});
Parse.Cloud.define('sentrixCreateAssessmentRequest', async request => {
  const user = requireUser(request); const asset = await ownedAsset(user, request.params.assetId);
  if (request.params.authorizationConfirmed !== true) throw new Error('AUTHORIZATION_REQUIRED');
  const note = typeof request.params.scopeNote === 'string' ? request.params.scopeNote.trim().slice(0, 1000) : '';
  const Assessment = Parse.Object.extend('SxAssessment'); const item = new Assessment();
  item.set('owner', user); item.set('asset', asset); item.set('status', 'requested'); item.set('scopeNote', note);
  item.set('authorizationConfirmed', true); item.set('notice', 'No automated scan is executed by this starter backend.');
  await item.save(null, { useMasterKey: true }); await audit(user, asset, 'assessment.requested');
  return { id: item.id, status: item.get('status'), scannerEnabled: false };
});
async function audit(user, asset, type) {
  const Audit = Parse.Object.extend('SxAuditEvent'); const event = new Audit();
  event.set('actor', user); if (asset) event.set('asset', asset); event.set('eventType', type);
  await event.save(null, { useMasterKey: true });
}
// Prevent clients from directly creating or changing privileged records.
['SxAssessment','SxAuditEvent'].forEach(className => {
  Parse.Cloud.beforeSave(className, request => {
    if (!request.master) throw new Error('SERVER_WRITE_ONLY');
  });
});
Parse.Cloud.beforeSave('SxAsset', request => {
  if (!request.master) throw new Error('USE_SENTRIX_CLOUD_FUNCTIONS');
  const host = request.object.get('host');
  if (typeof host !== 'string' || host.length > 253) throw new Error('HOST_INVALID');
});
