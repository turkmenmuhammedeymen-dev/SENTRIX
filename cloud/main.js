/**
 * SENTRIX Cloud Code — verified-domain event foundation.
 * Deploy as Back4App Cloud Code main.js. Never expose the Master Key.
 */
const crypto = require('crypto');
const user = r => { if (!r.user) throw new Error('AUTH_REQUIRED'); return r.user; };
const clean = (v,n,k) => { if(typeof v!=='string'||!v.trim()||v.trim().length>n) throw new Error(k+'_INVALID'); return v.trim(); };
function urlInfo(v){let u;try{u=new URL(clean(v,2048,'URL'));}catch(e){throw new Error('URL_INVALID');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('URL_INVALID');u.hash='';return {url:u.toString().replace(/\/$/,''),host:u.hostname.toLowerCase()};}

// Idempotent Parse schema bootstrap. Custom classes are private to Cloud Code;
// client CRUD and schema mutation are denied by CLP. Cloud Functions use Master Key.
const SENTRIX_SCHEMAS = {
  SxDomain: { owner:['pointer','_User'], url:['string'], host:['string'], token:['string'], verified:['boolean'], siteId:['string'], verifiedAt:['date'] },
  SxAuditEvent: { actor:['pointer','_User'], domain:['pointer','SxDomain'], eventType:['string'] },
  SxPageEvent: { domain:['pointer','SxDomain'], siteId:['string'], host:['string'], path:['string'], referrer:['string'], visitorHash:['string'], occurredAt:['date'] },
  SxSecurityEvent: { domain:['pointer','SxDomain'], siteId:['string'], source:['string'], eventType:['string'], summary:['string'], occurredAt:['date'] },
  SxAsset: { owner:['pointer','_User'], url:['string'], host:['string'], status:['string'] },
  SxAssessment: { owner:['pointer','_User'], asset:['pointer','SxAsset'], status:['string'], scopeNote:['string'], scannerEnabled:['boolean'] }
};
async function ensureSentrixSchemas(){
  const report=[];
  for (const [className, fields] of Object.entries(SENTRIX_SCHEMAS)) {
    const schema=new Parse.Schema(className);
    let exists=true, current;
    try { current=await schema.get({useMasterKey:true}); }
    catch(e) {
      const msg=String(e && (e.message||e.code)||e);
      if (!/does not exist|not found|class.*exist|101/i.test(msg)) throw e;
      exists=false; current={fields:{},indexes:{}};
    }
    const present=current.fields||{};
    let changed=false;
    for (const [field,spec] of Object.entries(fields)) {
      if (present[field]) continue;
      const [type,target]=spec;
      if(type==='pointer') schema.addPointer(field,target);
      else if(type==='string') schema.addString(field);
      else if(type==='boolean') schema.addBoolean(field);
      else if(type==='date') schema.addDate(field);
      changed=true;
    }
    // Add ordinary query indexes only. A MongoDB UNIQUE constraint is a separate
    // database-level operation and is deliberately not misrepresented as unique here.
    const indexes=current.indexes||{};
    const wanted={
      SxDomain:{host:{host:1},siteId:{siteId:1},ownerCreated:{owner:1,createdAt:-1}},
      SxPageEvent:{domainDate:{domain:1,occurredAt:-1},siteVisitor:{siteId:1,visitorHash:1}},
      SxSecurityEvent:{domainDate:{domain:1,occurredAt:-1}},
      SxAsset:{ownerHost:{owner:1,host:1}},
      SxAuditEvent:{domainDate:{domain:1,createdAt:-1}},
      SxAssessment:{ownerDate:{owner:1,createdAt:-1}}
    }[className]||{};
    for (const [name,keySpec] of Object.entries(wanted)) {
      if (!indexes[name]) { schema.addIndex(name,keySpec); changed=true; }
    }
    // Empty CLP means no public, authenticated-user, or role-level client access.
    schema.setCLP(new Parse.CLP());
    if (!exists) await schema.save({useMasterKey:true});
    else if (changed || current.classLevelPermissions) await schema.update({useMasterKey:true});
    report.push({className,created:!exists,fields:Object.keys(fields).length});
  }
  return {ok:true,schemas:report};
}
Parse.Cloud.job('sentrixBootstrap', async request => {
  const result=await ensureSentrixSchemas();
  if(request && request.message) request.message('SENTRIX schema bootstrap completed: '+result.schemas.length+' classes');
  return result;
});
// Run once on Cloud Code startup; the job above is available for safe manual reruns.
const sentrixBootstrapOnLoad=ensureSentrixSchemas()
  .then(r=>console.info('[SENTRIX] schema bootstrap ready:',r.schemas.length,'classes'))
  .catch(e=>console.error('[SENTRIX] schema bootstrap failed; run sentrixBootstrap job:',e && e.message || e));

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
