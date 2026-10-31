/**
 * SENTRIX Cloud Code — verified-domain event foundation.
 * Deploy as Back4App Cloud Code main.js. Never expose the Master Key.
 */
const crypto = require('crypto');
const user = r => { if (!r.user) throw new Error('AUTH_REQUIRED'); return r.user; };
const clean = (v,n,k) => { if(typeof v!=='string'||!v.trim()||v.trim().length>n) throw new Error(k+'_INVALID'); return v.trim(); };
function urlInfo(v){let u;try{u=new URL(clean(v,2048,'URL'));}catch(e){throw new Error('URL_INVALID');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('URL_INVALID');u.hash='';return {url:u.toString().replace(/\/$/,''),host:u.hostname.toLowerCase()};}

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
          token:{type:'String'}, verified:{type:'Boolean'}, siteId:{type:'String'}, verifiedAt:{type:'Date'}
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
async function audit(u,d,type){await obj('SxAuditEvent',{actor:u,domain:d,eventType:type}).save(null,{useMasterKey:true});}
function snippet(d){return '<script async src="https://cdn.jsdelivr.net/gh/turkmenmuhammedeymen-dev/SENTRIX@main/tracker.js" data-site-id="'+d.get('siteId')+'"></script>';}
Parse.Cloud.define('sentrixHealth',async()=>({app:'SENTRIX',status:'ok',serverTime:new Date().toISOString()}));
Parse.Cloud.define('sentrixCreateDomain',async r=>{await sentrixBootstrapOnLoad;const u=user(r),p=urlInfo(r.params.url),q=new Parse.Query('SxDomain');q.equalTo('host',p.host);const old=await q.first({useMasterKey:true});if(old){if(old.get('owner').id!==u.id)throw new Error('DOMAIN_ALREADY_CLAIMED');return {domainId:old.id,host:p.host,verificationContent:'sentrix-verification='+old.get('token'),verified:old.get('verified')===true};}const token=crypto.randomBytes(24).toString('hex');const d=obj('SxDomain',{owner:u,url:p.url,host:p.host,token,verified:false,siteId:crypto.randomBytes(16).toString('hex')});await d.save(null,{useMasterKey:true});await audit(u,d,'domain.created');return {domainId:d.id,host:p.host,verificationContent:'sentrix-verification='+token,verified:false};});
Parse.Cloud.define('sentrixListDomains',async r=>{await sentrixBootstrapOnLoad;const u=user(r),q=new Parse.Query('SxDomain');q.equalTo('owner',u);q.descending('createdAt');q.limit(100);return (await q.find({useMasterKey:true})).map(d=>({id:d.id,url:d.get('url'),host:d.get('host'),verified:d.get('verified')===true}));});
Parse.Cloud.define('sentrixVerifyDomain',async r=>{await sentrixBootstrapOnLoad;const u=user(r),d=await domainFor(u,r.params.domainId);if(d.get('verified'))return {verified:true,snippet:snippet(d)};let res;try{res=await fetch('https://'+d.get('host')+'/.well-known/sentrix-verification.txt',{redirect:'manual'});}catch(e){throw new Error('VERIFICATION_FETCH_FAILED');}if(!res.ok||(await res.text()).trim()!=='sentrix-verification='+d.get('token'))return {verified:false};d.set('verified',true);d.set('verifiedAt',new Date());await d.save(null,{useMasterKey:true});await audit(u,d,'domain.verified');return {verified:true,snippet:snippet(d)};});
Parse.Cloud.define('sentrixTrackPageView',async r=>{await sentrixBootstrapOnLoad;const site=clean(r.params.siteId,64,'SITE_ID'),host=clean(r.params.host,253,'HOST').toLowerCase(),q=new Parse.Query('SxDomain');q.equalTo('siteId',site);q.equalTo('host',host);q.equalTo('verified',true);const d=await q.first({useMasterKey:true});if(!d)throw new Error('DOMAIN_NOT_VERIFIED');const visitor=crypto.createHash('sha256').update(site+'|'+clean(r.params.visitorId,100,'VISITOR_ID')).digest('hex');await obj('SxPageEvent',{domain:d,siteId:site,host,path:String(r.params.path||'/').slice(0,500),referrer:String(r.params.referrer||'').slice(0,500),visitorHash:visitor,occurredAt:new Date()}).save(null,{useMasterKey:true});return {accepted:true};});
Parse.Cloud.define('sentrixGetOverview',async r=>{await sentrixBootstrapOnLoad;const u=user(r),dq=new Parse.Query('SxDomain');dq.equalTo('owner',u);dq.equalTo('verified',true);const ds=await dq.find({useMasterKey:true});if(!ds.length)return {pageViews:0,sessions:0,securityEvents:0,daily:[]};const q=new Parse.Query('SxPageEvent');q.containedIn('domain',ds);q.greaterThanOrEqualTo('occurredAt',new Date(Date.now()-30*86400000));q.limit(1000);const ev=await q.find({useMasterKey:true}),vis=new Set(ev.map(x=>x.get('visitorHash'))),days={};ev.forEach(x=>{const k=x.get('occurredAt').toISOString().slice(0,10);days[k]=(days[k]||0)+1;});const sq=new Parse.Query('SxSecurityEvent');sq.containedIn('domain',ds);const securityEvents=await sq.count({useMasterKey:true}).catch(()=>0);return {pageViews:ev.length,sessions:vis.size,securityEvents,daily:Object.keys(days).sort().slice(-7).map(day=>({day,views:days[day]}))};});
Parse.Cloud.define('sentrixIngestSecurityEvent',async r=>{await sentrixBootstrapOnLoad;const config=await Parse.Config.get();const secret=config.get('SENTRIX_WAF_INGEST_TOKEN');if(!secret||r.params.token!==secret)throw new Error('INGEST_UNAUTHORIZED');const q=new Parse.Query('SxDomain');q.equalTo('siteId',clean(r.params.siteId,64,'SITE_ID'));q.equalTo('verified',true);const d=await q.first({useMasterKey:true});if(!d)throw new Error('DOMAIN_NOT_VERIFIED');await obj('SxSecurityEvent',{domain:d,siteId:d.get('siteId'),source:clean(r.params.source||'external',50,'SOURCE'),eventType:clean(r.params.eventType,80,'EVENT_TYPE'),summary:String(r.params.summary||'').slice(0,500),occurredAt:new Date()}).save(null,{useMasterKey:true});return {accepted:true};});
Parse.Cloud.define('sentrixAddAsset',async r=>{await sentrixBootstrapOnLoad;const u=user(r);if(r.params.authorizationConfirmed!==true)throw new Error('AUTHORIZATION_REQUIRED');const p=urlInfo(r.params.url),q=new Parse.Query('SxAsset');q.equalTo('owner',u);q.equalTo('host',p.host);const old=await q.first({useMasterKey:true});if(old)return {id:old.id,host:p.host,existing:true};const a=obj('SxAsset',{owner:u,url:p.url,host:p.host,status:'registered'});await a.save(null,{useMasterKey:true});return {id:a.id,host:p.host,existing:false};});
Parse.Cloud.define('sentrixListAssets',async r=>{await sentrixBootstrapOnLoad;const q=new Parse.Query('SxAsset');q.equalTo('owner',user(r));return (await q.find({useMasterKey:true})).map(a=>({id:a.id,url:a.get('url'),host:a.get('host'),status:a.get('status')}));});
Parse.Cloud.define('sentrixDeleteAsset',async r=>{await sentrixBootstrapOnLoad;const q=new Parse.Query('SxAsset');q.equalTo('objectId',clean(r.params.assetId,64,'ASSET_ID'));q.equalTo('owner',user(r));const a=await q.first({useMasterKey:true});if(!a)throw new Error('ASSET_NOT_FOUND');await a.destroy({useMasterKey:true});return {deleted:true};});
Parse.Cloud.define('sentrixCreateAssessmentRequest',async r=>{await sentrixBootstrapOnLoad;const u=user(r);if(r.params.authorizationConfirmed!==true)throw new Error('AUTHORIZATION_REQUIRED');const q=new Parse.Query('SxAsset');q.equalTo('objectId',clean(r.params.assetId,64,'ASSET_ID'));q.equalTo('owner',u);const a=await q.first({useMasterKey:true});if(!a)throw new Error('ASSET_NOT_FOUND');const x=obj('SxAssessment',{owner:u,asset:a,status:'requested',scopeNote:String(r.params.scopeNote||'').slice(0,1000),scannerEnabled:false});await x.save(null,{useMasterKey:true});return {id:x.id,status:'requested',scannerEnabled:false};});
['SxDomain','SxAuditEvent','SxPageEvent','SxSecurityEvent','SxAssessment','SxAsset'].forEach(c=>Parse.Cloud.beforeSave(c,r=>{if(!r.master)throw new Error('SERVER_WRITE_ONLY');}));
