/**
 * SENTRIX Cloud Code — verified-domain event foundation.
 * Deploy as Back4App Cloud Code main.js. Never expose the Master Key.
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const user = r => { if (!r.user) throw new Error('AUTH_REQUIRED'); return r.user; };
const clean = (v,n,k) => { if(typeof v!=='string'||!v.trim()||v.trim().length>n) throw new Error(k+'_INVALID'); return v.trim(); };
function urlInfo(v){let raw=clean(v,2048,'URL');if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))raw='https://'+raw;let u;try{u=new URL(raw);}catch(e){throw new Error('URL_INVALID');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname||!u.hostname.includes('.')||u.hostname.length>253)throw new Error('URL_INVALID');u.hash='';u.hostname=u.hostname.toLowerCase();return {url:u.toString().replace(/\/$/,''),host:u.hostname};}

// SENTRIX FEATURE REGISTRY — the single source of truth for persisted data.
// Every new feature must register its schema requirements here before release.
// Parse built-ins are described but never recreated. _User is extended in-place;
// _Session remains fully managed by Parse authentication.
const SENTRIX_FEATURE_REGISTRY = {
  account: {
    builtIns: {
      _User: { fields: { name: { type: 'String' } }, note: 'Built-in Parse user; preserve username/email/password/authData/session behavior.' },
      _Session: { fields: {}, note: 'Built-in Parse session; managed only by Parse authentication.' }
    },
    classes: {}
  },
  assetManagement: {
    classes: {
      SxDomain: {
        fields: {
          owner:{type:'Pointer',targetClass:'_User'}, url:{type:'String'}, host:{type:'String'},
          token:{type:'String'}, verificationFile:{type:'String'}, verificationPath:{type:'String'}, verified:{type:'Boolean'}, siteId:{type:'String'}, verifiedAt:{type:'Date'}
        },
        indexes: { host:{host:1}, siteId:{siteId:1}, ownerCreated:{'_p_owner':1,createdAt:-1} },
        access:'cloud-only'
      },
      SxAsset: {
        fields: { owner:{type:'Pointer',targetClass:'_User'}, url:{type:'String'}, host:{type:'String'}, status:{type:'String'} },
        indexes: { ownerHost:{'_p_owner':1,host:1}, host:{host:1} },
        access:'cloud-only'
      }
    }
  },
  githubOwnership: {
    classes: {
      SxGitHubDeviceRequest: {
        fields: { owner:{type:'Pointer',targetClass:'_User'}, deviceCodeHash:{type:'String'}, expiresAt:{type:'Date'} },
        indexes: { owner:{'_p_owner':1}, codeHash:{deviceCodeHash:1} },
        access:'cloud-only'
      },
      SxGitHubConnection: {
        fields: {
          owner:{type:'Pointer',targetClass:'_User'}, githubId:{type:'String'}, login:{type:'String'},
          encryptedToken:{type:'String'}, tokenIv:{type:'String'}, tokenTag:{type:'String'},
          scopes:{type:'String'}, connectedAt:{type:'Date'}
        },
        indexes: { owner:{'_p_owner':1} },
        access:'cloud-only'
      },
      SxGitHubRepo: {
        fields: {
          owner:{type:'Pointer',targetClass:'_User'}, connection:{type:'Pointer',targetClass:'SxGitHubConnection'},
          repositoryId:{type:'String'}, fullName:{type:'String'}, htmlUrl:{type:'String'},
          repositoryOwner:{type:'String'}, repositoryOwnerType:{type:'String'},
          githubLogin:{type:'String'}, permission:{type:'String'}, verificationType:{type:'String'},
          verified:{type:'Boolean'}, verifiedAt:{type:'Date'}
        },
        indexes: { ownerRepo:{'_p_owner':1,fullName:1}, repoId:{repositoryId:1} },
        access:'cloud-only'
      }
    }
  },
  analytics: {
    classes: {
      SxPageEvent: {
        fields: {
          domain:{type:'Pointer',targetClass:'SxDomain'}, siteId:{type:'String'}, host:{type:'String'},
          path:{type:'String'}, referrer:{type:'String'}, visitorHash:{type:'String'}, occurredAt:{type:'Date'}
        },
        indexes: { domainDate:{'_p_domain':1,occurredAt:-1}, siteVisitor:{siteId:1,visitorHash:1}, siteDate:{siteId:1,occurredAt:-1} },
        access:'cloud-only'
      }
    }
  },
  securityTelemetry: {
    classes: {
      SxSecurityEvent: {
        fields: {
          domain:{type:'Pointer',targetClass:'SxDomain'}, siteId:{type:'String'}, source:{type:'String'},
          eventType:{type:'String'}, summary:{type:'String'}, occurredAt:{type:'Date'}
        },
        indexes: { domainDate:{'_p_domain':1,occurredAt:-1}, siteDate:{siteId:1,occurredAt:-1} },
        access:'cloud-only'
      },
      SxAuditEvent: {
        fields: { actor:{type:'Pointer',targetClass:'_User'}, domain:{type:'Pointer',targetClass:'SxDomain'}, eventType:{type:'String'} },
        indexes: { domainDate:{'_p_domain':1,createdAt:-1}, actorDate:{'_p_actor':1,createdAt:-1} },
        access:'cloud-only'
      }
    }
  },
  assessments: {
    classes: {
      SxAssessment: {
        fields: {
          owner:{type:'Pointer',targetClass:'_User'}, asset:{type:'Pointer',targetClass:'SxAsset'},
          status:{type:'String'}, scopeNote:{type:'String'}, scannerEnabled:{type:'Boolean'}
        },
        indexes: { ownerDate:{'_p_owner':1,createdAt:-1}, assetDate:{'_p_asset':1,createdAt:-1} },
        access:'cloud-only'
      }
    }
  }
};

function flattenFeatureRegistry(registry) {
  const classes = {};
  Object.keys(registry).forEach(feature => {
    const entry = registry[feature];
    Object.keys(entry.classes || {}).forEach(name => {
      if (classes[name]) throw new Error('DUPLICATE_SCHEMA_REGISTRATION:'+name);
      classes[name] = Object.assign({feature}, entry.classes[name]);
    });
  });
  return classes;
}
const SENTRIX_SCHEMAS = flattenFeatureRegistry(SENTRIX_FEATURE_REGISTRY);
const SENTRIX_PRIVATE_CLP = new Parse.CLP();

function addRegisteredField(schema, name, spec) {
  switch (spec.type) {
    case 'String': schema.addString(name); break;
    case 'Number': schema.addNumber(name); break;
    case 'Boolean': schema.addBoolean(name); break;
    case 'Date': schema.addDate(name); break;
    case 'Object': schema.addObject(name); break;
    case 'Array': schema.addArray(name); break;
    case 'File': schema.addFile(name); break;
    case 'GeoPoint': schema.addGeoPoint(name); break;
    case 'Pointer': schema.addPointer(name, spec.targetClass); break;
    case 'Relation': schema.addRelation(name, spec.targetClass); break;
    default: throw new Error('UNSUPPORTED_SCHEMA_FIELD_TYPE:'+name+':'+spec.type);
  }
}

// Safe, additive reconciliation: never deletes classes, fields, indexes or data.
// Existing field types are checked and mismatches fail loudly instead of mutating data.
async function ensureSentrixSchemas() {
  const report = [];
  const builtIns = SENTRIX_FEATURE_REGISTRY.account.builtIns;
  for (const [className, definition] of Object.entries(builtIns)) {
    if (className === '_Session') continue; // Parse owns session schema and lifecycle.
    const schema = new Parse.Schema(className);
    const current = await schema.get();
    const present = current.fields || {};
    let changed = false;
    for (const [field, spec] of Object.entries(definition.fields)) {
      if (present[field]) {
        if (present[field].type !== spec.type) throw new Error('SCHEMA_TYPE_CONFLICT:'+className+'.'+field);
      } else {
        addRegisteredField(schema, field, spec);
        changed = true;
      }
    }
    // Never alter _User CLPs or _Session: signup/login/session lifecycle are Parse-managed.
    if (changed) {
      await schema.update();
      report.push({className, feature:'account', addedFields:Object.keys(definition.fields).filter(k=>!present[k])});
    }
  }

  for (const [className, definition] of Object.entries(SENTRIX_SCHEMAS)) {
    const schema = new Parse.Schema(className);
    let current, exists = true;
    try {
      current = await schema.get();
    } catch (error) {
      const code = Number(error && error.code);
      const message = String(error && error.message || error);
      if (code !== 101 && !/class.*not.*exist|schema.*not.*found|does not exist/i.test(message)) throw error;
      exists = false;
      current = {fields:{}, indexes:{}};
    }
    const present = current.fields || {};
    const indexes = current.indexes || {};
    let changed = false;
    const addedFields = [];
    for (const [field, spec] of Object.entries(definition.fields)) {
      if (present[field]) {
        if (present[field].type !== spec.type ||
            (spec.type === 'Pointer' && present[field].targetClass !== spec.targetClass)) {
          throw new Error('SCHEMA_TYPE_CONFLICT:'+className+'.'+field);
        }
      } else {
        addRegisteredField(schema, field, spec);
        changed = true;
        addedFields.push(field);
      }
    }
    // Indexes are added only after their referenced fields exist. Pointer indexes
    // use Parse's physical _p_field representation. No index is falsely called unique.
    for (const [name, keys] of Object.entries(definition.indexes || {})) {
      if (!indexes[name]) {
        schema.addIndex(name, keys);
        changed = true;
      }
    }
    // These records contain private account, telemetry or assessment data.
    // Clients cannot CRUD or alter their schemas; Cloud Code uses Master Key.
    schema.setCLP(SENTRIX_PRIVATE_CLP);
    if (!exists) {
      await schema.save();
    } else if (changed || JSON.stringify(current.classLevelPermissions || {}) !== JSON.stringify(SENTRIX_PRIVATE_CLP.toJSON())) {
      await schema.update();
    }
    report.push({className, feature:definition.feature, created:!exists, addedFields, indexCount:Object.keys(definition.indexes||{}).length, access:definition.access});
  }
  return {ok:true, registryVersion:1, features:Object.keys(SENTRIX_FEATURE_REGISTRY), schemas:report};
}

Parse.Cloud.job('sentrixBootstrap', async request => {
  const result = await ensureSentrixSchemas();
  if (request && request.message) request.message('SENTRIX registry reconciliation completed: '+result.schemas.length+' schema updates checked');
  return result;
});
const sentrixBootstrapOnLoad = ensureSentrixSchemas()
  .then(result => { console.info('[SENTRIX] registry reconciled:', result.schemas.length, 'schemas'); return result; })
  .catch(error => { console.error('[SENTRIX] registry reconciliation failed:', error && error.message || error); throw error; });

function obj(c,p){const x=new (Parse.Object.extend(c))();Object.keys(p).forEach(k=>x.set(k,p[k]));return x;}
async function domainFor(u,id){const q=new Parse.Query('SxDomain');q.equalTo('objectId',clean(id,64,'DOMAIN_ID'));q.equalTo('owner',u);const d=await q.first({useMasterKey:true});if(!d)throw new Error('DOMAIN_NOT_FOUND');return d;}
async function audit(u,d,type){try{await obj('SxAuditEvent',{actor:u,domain:d,eventType:type}).save(null,{useMasterKey:true});}catch(error){console.error('[SENTRIX] audit write failed:',error&&error.message||error);}}
function snippet(d){return '<script async src="https://cdn.jsdelivr.net/gh/turkmenmuhammedeymen-dev/SENTRIX@main/tracker.js" data-site-id="'+d.get('siteId')+'"></script>';}
function verificationPayload(d){
  const file=d.get('verificationFile')||('sentrix-verify-'+d.get('siteId')+'.txt');
  const content='sentrix-verification='+d.get('token')+'\n';
  return {fileName:file,filePath:'.well-known/'+file,content,publicUrl:'https://'+d.get('host')+'/.well-known/'+file};
}
Parse.Cloud.define('sentrixHealth',async()=>({app:'SENTRIX',status:'ok',serverTime:new Date().toISOString()}));
Parse.Cloud.define('sentrixCreateDomain',async r=>{await sentrixBootstrapOnLoad;const u=user(r),p=urlInfo(r.params.url),q=new Parse.Query('SxDomain');q.equalTo('host',p.host);const old=await q.first({useMasterKey:true});if(old){if(old.get('owner').id!==u.id)throw new Error('DOMAIN_ALREADY_CLAIMED');return {domainId:old.id,host:p.host,verified:old.get('verified')===true,verification:verificationPayload(old)};}const token=crypto.randomBytes(32).toString('hex'),siteId=crypto.randomBytes(16).toString('hex'),verificationFile='sentrix-verify-'+siteId+'.txt';const d=obj('SxDomain',{owner:u,url:p.url,host:p.host,token,verificationFile,verificationPath:'/.well-known/'+verificationFile,verified:false,siteId});await d.save(null,{useMasterKey:true});await audit(u,d,'domain.created');return {domainId:d.id,host:p.host,verified:false,verification:verificationPayload(d)};});
Parse.Cloud.define('sentrixDeleteDomain',async r=>{
  await sentrixBootstrapOnLoad;
  const u=user(r),d=await domainFor(u,r.params.domainId);
  if(r.params.confirmation!==d.get('host')) throw new Error('DOMAIN_DELETE_CONFIRMATION_REQUIRED');
  const related=[];
  for(const name of ['SxPageEvent','SxSecurityEvent','SxAuditEvent']){
    const q=new Parse.Query(name);q.equalTo('domain',d);
    const rows=await q.find({useMasterKey:true});related.push(...rows);
  }
  const aq=new Parse.Query('SxAsset');aq.equalTo('owner',u);aq.equalTo('host',d.get('host'));
  const assets=await aq.find({useMasterKey:true});
  for(const rows of [related,assets]) for(let i=0;i<rows.length;i+=100) await Parse.Object.destroyAll(rows.slice(i,i+100),{useMasterKey:true});
  const assess=new Parse.Query('SxAssessment');assess.equalTo('owner',u);
  const assessments=await assess.find({useMasterKey:true});
  const assetIds=new Set(assets.map(x=>x.id));
  const linked=assessments.filter(x=>x.get('asset')&&assetIds.has(x.get('asset').id));
  for(let i=0;i<linked.length;i+=100) await Parse.Object.destroyAll(linked.slice(i,i+100),{useMasterKey:true});
  await d.destroy({useMasterKey:true});
  return {deleted:true,domainId:d.id};
});
Parse.Cloud.define('sentrixListDomains',async r=>{await sentrixBootstrapOnLoad;const u=user(r),q=new Parse.Query('SxDomain');q.equalTo('owner',u);q.descending('createdAt');q.limit(100);return (await q.find({useMasterKey:true})).map(d=>({id:d.id,url:d.get('url'),host:d.get('host'),verified:d.get('verified')===true,verification:verificationPayload(d),snippet:d.get('verified')===true?snippet(d):null}));});
async function isPublicVerificationHost(host) {
  const h=String(host||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')) return false;
  if(net.isIPv4(h)) {
    const p=h.split('.').map(Number);
    return !(p[0]===10||p[0]===127||p[0]===0||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168));
  }
  if(net.isIPv6(h)) return !(h==='::1'||/^f[cd]/i.test(h)||/^fe[89ab]/i.test(h)||h==='::');
  const records=await dns.lookup(h,{all:true,verbatim:true});
  return records.length>0 && records.every(x=>isPublicVerificationHost(x.address));
}
async function fetchVerificationFile(host,fileName) {
  if(!await isPublicVerificationHost(host)) throw new Error('VERIFICATION_HOST_NOT_PUBLIC');
  const paths=['/.well-known/'+encodeURIComponent(fileName),'/'+encodeURIComponent(fileName)];
  for(const path of paths) {
    let url='https://'+host+path;
    for(let hop=0;hop<4;hop++) {
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.hostname.toLowerCase()!==host.toLowerCase()) throw new Error('VERIFICATION_REDIRECT_REJECTED');
      const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location'); if(!location) break;
        const next=new URL(location,url);
        if(next.hostname.toLowerCase()!==host.toLowerCase()||next.protocol!=='https:') throw new Error('VERIFICATION_REDIRECT_REJECTED');
        url=next.toString(); continue;
      }
      if(response.ok) return (await response.text()).slice(0,2048).trim();
      break;
    }
  }
  return null;
}
Parse.Cloud.define('sentrixVerifyDomain',async r=>{
  await sentrixBootstrapOnLoad;
  const u=user(r),d=await domainFor(u,r.params.domainId),vf=verificationPayload(d);
  if(d.get('verified')) return {verified:true,snippet:snippet(d),verification:vf};
  let body;
  try { body=await fetchVerificationFile(d.get('host'),vf.fileName); }
  catch(e) { return {verified:false,reason:e.message==='VERIFICATION_HOST_NOT_PUBLIC'?'HOST_NOT_PUBLIC':'VERIFICATION_FETCH_FAILED',verification:vf}; }
  const expected=('sentrix-verification='+d.get('token')).trim();
  if(body===null||body!==expected) return {verified:false,reason:'FILE_NOT_FOUND_OR_CONTENT_MISMATCH',verification:vf};
  d.set('verified',true); d.set('verifiedAt',new Date());
  await d.save(null,{useMasterKey:true}); await audit(u,d,'domain.verified');
  return {verified:true,snippet:snippet(d),verification:vf};
});

Parse.Cloud.define('sentrixGetDomainDetails',async r=>{
  await sentrixBootstrapOnLoad;
  const u=user(r),d=await domainFor(u,r.params.domainId);
  const since=new Date(Date.now()-30*86400000);
  const pq=new Parse.Query('SxPageEvent');pq.equalTo('domain',d);pq.greaterThanOrEqualTo('occurredAt',since);pq.descending('occurredAt');pq.limit(100);
  const sq=new Parse.Query('SxSecurityEvent');sq.equalTo('domain',d);sq.descending('occurredAt');sq.limit(100);
  const aq=new Parse.Query('SxAsset');aq.equalTo('owner',u);aq.equalTo('host',d.get('host'));aq.limit(100);
  const [pages,security,assets]=await Promise.all([pq.find({useMasterKey:true}),sq.find({useMasterKey:true}),aq.find({useMasterKey:true})]);
  return {domain:{id:d.id,url:d.get('url'),host:d.get('host'),verified:d.get('verified')===true,verifiedAt:d.get('verifiedAt')||null,createdAt:d.createdAt},analytics:{pageViews:pages.length,uniqueVisitors:new Set(pages.map(x=>x.get('visitorHash'))).size,recentPages:pages.map(x=>({path:x.get('path'),referrer:x.get('referrer'),occurredAt:x.get('occurredAt')}))},securityEvents:security.map(x=>({source:x.get('source'),eventType:x.get('eventType'),summary:x.get('summary'),occurredAt:x.get('occurredAt')})),assets:assets.map(x=>({id:x.id,url:x.get('url'),status:x.get('status')}))};
});
Parse.Cloud.define('sentrixDeleteAccount',async r=>{
  const u=user(r);
  if(r.params.confirmation!=='DELETE MY ACCOUNT') throw new Error('DELETE_CONFIRMATION_REQUIRED');
  await sentrixBootstrapOnLoad;
  const ownedDomains=new Parse.Query('SxDomain');ownedDomains.equalTo('owner',u);
  const domains=await ownedDomains.find({useMasterKey:true});
  const ownedAssets=new Parse.Query('SxAsset');ownedAssets.equalTo('owner',u);
  const assets=await ownedAssets.find({useMasterKey:true});
  const domainIds=domains.map(d=>d.id);
  if(domainIds.length){
    const classes=['SxPageEvent','SxSecurityEvent','SxAuditEvent'];
    for(const c of classes){const q=new Parse.Query(c);q.containedIn('domain',domains);const rows=await q.find({useMasterKey:true});for(let i=0;i<rows.length;i+=100)await Parse.Object.destroyAll(rows.slice(i,i+100),{useMasterKey:true});}
  }
  for(const c of ['SxAssessment']){const q=new Parse.Query(c);q.equalTo('owner',u);const rows=await q.find({useMasterKey:true});for(let i=0;i<rows.length;i+=100)await Parse.Object.destroyAll(rows.slice(i,i+100),{useMasterKey:true});}
  for(const c of ['SxGitHubDeviceRequest','SxGitHubRepo','SxGitHubConnection']){const q=new Parse.Query(c);q.equalTo('owner',u);const rows=await q.find({useMasterKey:true});for(let i=0;i<rows.length;i+=100)await Parse.Object.destroyAll(rows.slice(i,i+100),{useMasterKey:true});}
  const actorAudit=new Parse.Query('SxAuditEvent');actorAudit.equalTo('actor',u);const actorEvents=await actorAudit.find({useMasterKey:true});for(let i=0;i<actorEvents.length;i+=100)await Parse.Object.destroyAll(actorEvents.slice(i,i+100),{useMasterKey:true});
  for(const rows of [assets,domains])for(let i=0;i<rows.length;i+=100)await Parse.Object.destroyAll(rows.slice(i,i+100),{useMasterKey:true});
  await u.destroy({useMasterKey:true});
  return {deleted:true};
});
Parse.Cloud.define('sentrixTrackPageView',async r=>{await sentrixBootstrapOnLoad;const site=clean(r.params.siteId,64,'SITE_ID'),host=clean(r.params.host,253,'HOST').toLowerCase(),q=new Parse.Query('SxDomain');q.equalTo('siteId',site);q.equalTo('host',host);q.equalTo('verified',true);const d=await q.first({useMasterKey:true});if(!d)throw new Error('DOMAIN_NOT_VERIFIED');const visitor=crypto.createHash('sha256').update(site+'|'+clean(r.params.visitorId,100,'VISITOR_ID')).digest('hex');await obj('SxPageEvent',{domain:d,siteId:site,host,path:String(r.params.path||'/').slice(0,500),referrer:String(r.params.referrer||'').slice(0,500),visitorHash:visitor,occurredAt:new Date()}).save(null,{useMasterKey:true});return {accepted:true};});
Parse.Cloud.define('sentrixGetOverview',async r=>{await sentrixBootstrapOnLoad;const u=user(r),dq=new Parse.Query('SxDomain');dq.equalTo('owner',u);dq.equalTo('verified',true);const ds=await dq.find({useMasterKey:true});if(!ds.length)return {pageViews:0,sessions:0,securityEvents:0,daily:[]};const q=new Parse.Query('SxPageEvent');q.containedIn('domain',ds);q.greaterThanOrEqualTo('occurredAt',new Date(Date.now()-30*86400000));q.limit(1000);const ev=await q.find({useMasterKey:true}),vis=new Set(ev.map(x=>x.get('visitorHash'))),days={};ev.forEach(x=>{const k=x.get('occurredAt').toISOString().slice(0,10);days[k]=(days[k]||0)+1;});const sq=new Parse.Query('SxSecurityEvent');sq.containedIn('domain',ds);const securityEvents=await sq.count({useMasterKey:true}).catch(()=>0);return {pageViews:ev.length,sessions:vis.size,securityEvents,daily:Object.keys(days).sort().slice(-7).map(day=>({day,views:days[day]}))};});
Parse.Cloud.define('sentrixIngestSecurityEvent',async r=>{await sentrixBootstrapOnLoad;const config=await Parse.Config.get();const secret=config.get('SENTRIX_WAF_INGEST_TOKEN');if(!secret||r.params.token!==secret)throw new Error('INGEST_UNAUTHORIZED');const q=new Parse.Query('SxDomain');q.equalTo('siteId',clean(r.params.siteId,64,'SITE_ID'));q.equalTo('verified',true);const d=await q.first({useMasterKey:true});if(!d)throw new Error('DOMAIN_NOT_VERIFIED');await obj('SxSecurityEvent',{domain:d,siteId:d.get('siteId'),source:clean(r.params.source||'external',50,'SOURCE'),eventType:clean(r.params.eventType,80,'EVENT_TYPE'),summary:String(r.params.summary||'').slice(0,500),occurredAt:new Date()}).save(null,{useMasterKey:true});return {accepted:true};});
Parse.Cloud.define('sentrixAddAsset',async r=>{await sentrixBootstrapOnLoad;const u=user(r);if(r.params.authorizationConfirmed!==true)throw new Error('AUTHORIZATION_REQUIRED');const p=urlInfo(r.params.url),q=new Parse.Query('SxAsset');q.equalTo('owner',u);q.equalTo('host',p.host);const old=await q.first({useMasterKey:true});if(old)return {id:old.id,host:p.host,existing:true};const a=obj('SxAsset',{owner:u,url:p.url,host:p.host,status:'registered'});await a.save(null,{useMasterKey:true});return {id:a.id,host:p.host,existing:false};});
Parse.Cloud.define('sentrixListAssets',async r=>{await sentrixBootstrapOnLoad;const q=new Parse.Query('SxAsset');q.equalTo('owner',user(r));return (await q.find({useMasterKey:true})).map(a=>({id:a.id,url:a.get('url'),host:a.get('host'),status:a.get('status')}));});
Parse.Cloud.define('sentrixDeleteAsset',async r=>{await sentrixBootstrapOnLoad;const q=new Parse.Query('SxAsset');q.equalTo('objectId',clean(r.params.assetId,64,'ASSET_ID'));q.equalTo('owner',user(r));const a=await q.first({useMasterKey:true});if(!a)throw new Error('ASSET_NOT_FOUND');await a.destroy({useMasterKey:true});return {deleted:true};});
Parse.Cloud.define('sentrixCreateAssessmentRequest',async r=>{await sentrixBootstrapOnLoad;const u=user(r);if(r.params.authorizationConfirmed!==true)throw new Error('AUTHORIZATION_REQUIRED');const q=new Parse.Query('SxAsset');q.equalTo('objectId',clean(r.params.assetId,64,'ASSET_ID'));q.equalTo('owner',u);const a=await q.first({useMasterKey:true});if(!a)throw new Error('ASSET_NOT_FOUND');const x=obj('SxAssessment',{owner:u,asset:a,status:'requested',scopeNote:String(r.params.scopeNote||'').slice(0,1000),scannerEnabled:false});await x.save(null,{useMasterKey:true});return {id:x.id,status:'requested',scannerEnabled:false};});

/* GitHub repository ownership verification.
 * Requires Back4App Config:
 * SENTRIX_GITHUB_CLIENT_ID (OAuth App with Device Flow enabled)
 * SENTRIX_GITHUB_TOKEN_ENCRYPTION_KEY (64 hex characters; random 32-byte key)
 * OAuth tokens are encrypted before persistence and never returned to clients.
 */
async function githubConfig() {
  const cfg = await Parse.Config.get();
  const clientId = cfg && cfg.get('SENTRIX_GITHUB_CLIENT_ID');
  const keyHex = cfg && cfg.get('SENTRIX_GITHUB_TOKEN_ENCRYPTION_KEY');
  if (typeof clientId !== 'string' || !clientId.trim()) throw new Error('GITHUB_OAUTH_NOT_CONFIGURED');
  if (typeof keyHex !== 'string' || !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('GITHUB_TOKEN_ENCRYPTION_NOT_CONFIGURED');
  return {clientId:clientId.trim(),key:Buffer.from(keyHex,'hex')};
}
function encryptGitHubToken(token,key) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return {encryptedToken:encrypted.toString('base64'),tokenIv:iv.toString('base64'),tokenTag:cipher.getAuthTag().toString('base64')};
}
function decryptGitHubToken(row,key) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.get('tokenIv'),'base64'));
  decipher.setAuthTag(Buffer.from(row.get('tokenTag'),'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.get('encryptedToken'),'base64')),decipher.final()]).toString('utf8');
}
async function githubRequest(url,token,options={}) {
  const headers=Object.assign({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'SENTRIX-Security-Intelligence'},options.headers||{});
  if(token) headers.Authorization='Bearer '+token;
  const response=await fetch(url,Object.assign({},options,{headers,signal:AbortSignal.timeout(15000)}));
  const raw=await response.text();
  let data={};try{data=raw?JSON.parse(raw):{};}catch(_){throw new Error('GITHUB_INVALID_RESPONSE');}
  if(!response.ok) {
    if(response.status===401) throw new Error('GITHUB_TOKEN_INVALID_OR_REVOKED');
    if(response.status===403) throw new Error('GITHUB_PERMISSION_DENIED_OR_RATE_LIMITED');
    if(response.status===404) throw new Error('GITHUB_REPOSITORY_NOT_FOUND_OR_NOT_ACCESSIBLE');
    throw new Error('GITHUB_API_ERROR_'+response.status);
  }
  return data;
}
async function githubConnectionFor(u) {
  const q=new Parse.Query('SxGitHubConnection');q.equalTo('owner',u);q.descending('connectedAt');
  return q.first({useMasterKey:true});
}
Parse.Cloud.define('sentrixGitHubDeviceStart',async r=>{
  const u=user(r),cfg=await githubConfig();
  const body=new URLSearchParams({client_id:cfg.clientId,scope:'repo'}).toString();
  const response=await fetch('https://github.com/login/device/code',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||!data.device_code||!data.user_code||!data.verification_uri) throw new Error('GITHUB_DEVICE_FLOW_START_FAILED');
  const pending=obj('SxGitHubDeviceRequest',{owner:u,deviceCodeHash:crypto.createHash('sha256').update(data.device_code).digest('hex'),expiresAt:new Date(Date.now()+(Number(data.expires_in)||900)*1000)});
  await pending.save(null,{useMasterKey:true});
  return {deviceCode:data.device_code,userCode:data.user_code,verificationUri:data.verification_uri,expiresIn:Number(data.expires_in)||900,interval:Math.max(5,Number(data.interval)||5)};
});
Parse.Cloud.define('sentrixGitHubDevicePoll',async r=>{
  const u=user(r),cfg=await githubConfig(),deviceCode=clean(r.params.deviceCode,512,'DEVICE_CODE');
  const codeHash=crypto.createHash('sha256').update(deviceCode).digest('hex');
  const pendingQuery=new Parse.Query('SxGitHubDeviceRequest');pendingQuery.equalTo('owner',u);pendingQuery.equalTo('deviceCodeHash',codeHash);
  const pendingRecord=await pendingQuery.first({useMasterKey:true});
  if(!pendingRecord||pendingRecord.get('expiresAt').getTime()<=Date.now()) throw new Error('GITHUB_DEVICE_CODE_EXPIRED_OR_NOT_OWNED');
  const body=new URLSearchParams({client_id:cfg.clientId,device_code:deviceCode,grant_type:'urn:ietf:params:oauth:grant-type:device_code'}).toString();
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(data.error==='authorization_pending'||data.error==='slow_down') return {pending:true,interval:data.error==='slow_down'?10:5};
  if(data.error==='expired_token'||data.error==='access_denied'){await pendingRecord.destroy({useMasterKey:true});return {connected:false,reason:data.error==='expired_token'?'GITHUB_DEVICE_CODE_EXPIRED':'GITHUB_ACCESS_DENIED'};}
  if(!response.ok||!data.access_token) throw new Error('GITHUB_TOKEN_EXCHANGE_FAILED');
  const profile=await githubRequest('https://api.github.com/user',data.access_token);
  await pendingRecord.destroy({useMasterKey:true});
  if(!profile||!profile.id||!profile.login) throw new Error('GITHUB_PROFILE_INVALID');
  const encrypted=encryptGitHubToken(data.access_token,cfg.key);
  let connection=await githubConnectionFor(u);
  if(!connection) connection=obj('SxGitHubConnection',{owner:u});
  connection.set('githubId',String(profile.id));connection.set('login',profile.login);
  connection.set('encryptedToken',encrypted.encryptedToken);connection.set('tokenIv',encrypted.tokenIv);
  connection.set('tokenTag',encrypted.tokenTag);connection.set('scopes',String(data.scope||''));
  connection.set('connectedAt',new Date());
  await connection.save(null,{useMasterKey:true});
  await audit(u,null,'github.connected');
  return {connected:true,login:profile.login,githubId:String(profile.id)};
});
Parse.Cloud.define('sentrixGitHubConnectionStatus',async r=>{
  const u=user(r),connection=await githubConnectionFor(u);
  return connection?{connected:true,login:connection.get('login'),githubId:connection.get('githubId'),connectedAt:connection.get('connectedAt')||null}:{connected:false};
});
Parse.Cloud.define('sentrixGitHubVerifyRepository',async r=>{
  const u=user(r),raw=clean(r.params.repositoryUrl,500,'REPOSITORY_URL');
  let parsed;try{parsed=new URL(raw.includes('://')?raw:'https://'+raw);}catch(_){throw new Error('GITHUB_REPOSITORY_URL_INVALID');}
  if(parsed.protocol!=='https:'||parsed.hostname.toLowerCase()!=='github.com') throw new Error('GITHUB_REPOSITORY_URL_INVALID');
  const parts=parsed.pathname.split('/').filter(Boolean);
  if(parts.length<2||!/^[-a-zA-Z0-9_.]+$/.test(parts[0])||!/^[-a-zA-Z0-9_.]+$/.test(parts[1])) throw new Error('GITHUB_REPOSITORY_URL_INVALID');
  const fullName=parts[0]+'/'+parts[1].replace(/\.git$/i,'');
  const connection=await githubConnectionFor(u);if(!connection)throw new Error('GITHUB_ACCOUNT_NOT_CONNECTED');
  const cfg=await githubConfig(),token=decryptGitHubToken(connection,cfg.key);
  const [profile,repo]=await Promise.all([
    githubRequest('https://api.github.com/user',token),
    githubRequest('https://api.github.com/repos/'+encodeURIComponent(parts[0])+'/'+encodeURIComponent(parts[1].replace(/\.git$/i,'')),token)
  ]);
  const permission=repo.permissions||{};
  const isPersonalOwner=String(repo.owner&&repo.owner.login||'').toLowerCase()===String(profile.login).toLowerCase();
  const isAdmin=permission.admin===true;
  const verified=isAdmin&&(isPersonalOwner||String(repo.owner&&repo.owner.type)==='Organization');
  const verificationType=isPersonalOwner&&isAdmin?'PERSONAL_REPOSITORY_OWNER':isAdmin?'ORGANIZATION_REPOSITORY_ADMIN':null;
  const q=new Parse.Query('SxGitHubRepo');q.equalTo('owner',u);q.equalTo('repositoryId',String(repo.id));
  let record=await q.first({useMasterKey:true});
  if(!record)record=obj('SxGitHubRepo',{owner:u,connection});
  record.set('connection',connection);record.set('repositoryId',String(repo.id));
  record.set('fullName',repo.full_name||fullName);record.set('htmlUrl',repo.html_url);
  record.set('repositoryOwner',repo.owner.login);record.set('repositoryOwnerType',repo.owner.type);
  record.set('githubLogin',profile.login);record.set('permission',isAdmin?'admin':permission.maintain?'maintain':permission.push?'push':permission.pull?'pull':'none');
  record.set('verified',verified);record.set('verificationType',verificationType);
  if(verified)record.set('verifiedAt',new Date());
  await record.save(null,{useMasterKey:true});
  if(!verified) return {verified:false,status:'NOT_VERIFIED',reason:!permission.admin?'ADMIN_PERMISSION_REQUIRED':'ACCOUNT_OWNER_MISMATCH',repository:repo.full_name,githubLogin:profile.login,permission:record.get('permission'),owner:repo.owner.login,ownerType:repo.owner.type};
  await audit(u,null,'github.repository.verified');
  return {verified:true,status:'VERIFIED',verificationType,repository:repo.full_name,repositoryUrl:repo.html_url,githubLogin:profile.login,owner:repo.owner.login,ownerType:repo.owner.type,permission:'admin',verifiedAt:record.get('verifiedAt')};
});
Parse.Cloud.define('sentrixGitHubListRepositories',async r=>{
  const u=user(r),q=new Parse.Query('SxGitHubRepo');q.equalTo('owner',u);q.descending('verifiedAt');q.limit(100);
  return (await q.find({useMasterKey:true})).map(x=>({id:x.id,repository:x.get('fullName'),repositoryUrl:x.get('htmlUrl'),owner:x.get('repositoryOwner'),ownerType:x.get('repositoryOwnerType'),githubLogin:x.get('githubLogin'),permission:x.get('permission'),verified:x.get('verified')===true,verificationType:x.get('verificationType'),verifiedAt:x.get('verifiedAt')||null}));
});
Parse.Cloud.define('sentrixGitHubDisconnect',async r=>{
  const u=user(r),connection=await githubConnectionFor(u);
  if(!connection)return {disconnected:true};
  const q=new Parse.Query('SxGitHubRepo');q.equalTo('owner',u);const repos=await q.find({useMasterKey:true});
  for(let i=0;i<repos.length;i+=100)await Parse.Object.destroyAll(repos.slice(i,i+100),{useMasterKey:true});
  await connection.destroy({useMasterKey:true});await audit(u,null,'github.disconnected');
  return {disconnected:true};
});

['SxDomain','SxAuditEvent','SxPageEvent','SxSecurityEvent','SxAssessment','SxAsset','SxGitHubDeviceRequest','SxGitHubConnection','SxGitHubRepo'].forEach(c=>Parse.Cloud.beforeSave(c,r=>{if(!r.master)throw new Error('SERVER_WRITE_ONLY');}));
