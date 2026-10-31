(() => {
'use strict';
const cfg=window.APP_BACK4APP,$=id=>document.getElementById(id);
const status=(id,msg)=>{const el=$(id);if(el)el.textContent=msg;};
let mode='login',domains=[],currentUser=null;
const modal=$('authModal');
function openAuth(next){mode=next;renderAuth();modal.classList.remove('hidden');$('authEmail').focus();}
function renderAuth(){const signup=mode==='signup';$('authTitle').textContent=signup?'Hesap oluştur':'Hesabına giriş yap';$('authSubmit').textContent=signup?'Kayıt ol':'Giriş yap';$('nameLabel').classList.toggle('hidden',!signup);$('authName').required=signup;$('authPassword').autocomplete=signup?'new-password':'current-password';$('authSwitch').textContent=signup?'Zaten hesabın var mı? Giriş yap':'Hesabın yok mu? Kayıt ol';status('authMessage','');}
function message(err){const m=err&&err.message?err.message:'Beklenmeyen bir hata oluştu.';return m.replace(/^Error: /,'').replace(/\(\d+\)/g,'').trim();}
function api(name,params={}){return Parse.Cloud.run(name,params);}
function setAuthenticated(user){
 currentUser=user;
 $('publicView').classList.add('hidden');$('dashboard').classList.remove('hidden');
 $('publicNavActions').classList.add('hidden');
 $('welcomeText').textContent=(user.get('name')||user.get('username')||user.get('email'))+' · hesabın ve mülklerin';
 loadWorkspace();
}
function setPublic(){
 currentUser=null;$('dashboard').classList.add('hidden');$('publicView').classList.remove('hidden');
 $('publicNavActions').classList.remove('hidden');$('propertyDetail').classList.add('hidden');
}
async function loadWorkspace(){
 try{domains=await api('sentrixListDomains');renderDomains();
 const d=await api('sentrixGetOverview');
 $('statViews').textContent=Number(d.pageViews||0).toLocaleString('tr-TR');
 $('statSessions').textContent=Number(d.sessions||0).toLocaleString('tr-TR');
 $('statSecurity').textContent=Number(d.securityEvents||0).toLocaleString('tr-TR');
 }catch(e){status('domainNotice','Panel verileri alınamadı: '+message(e));}
}
function makeButton(label,cls,fn){const b=document.createElement('button');b.className='btn '+(cls||'');b.textContent=label;b.addEventListener('click',fn);return b;}
function renderDomains(){
 const root=$('domainList');root.replaceChildren();
 if(!domains.length){root.textContent='Henüz mülk eklemedin. İlk alan adını yukarıdan ekleyebilirsin.';return;}
 domains.forEach(d=>{
  const card=document.createElement('article');card.className='domain-card property-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',d.host+' mülk ayrıntılarını aç');
  const left=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('p'),badge=document.createElement('span'),actions=document.createElement('div');
  title.textContent=d.host;meta.textContent=d.url;badge.className='state '+(d.verified?'good':'pending');badge.textContent=d.verified?'Sahiplik doğrulandı':'Sahiplik doğrulanmadı';
  left.append(title,meta,badge);actions.className='domain-actions';
  if(!d.verified){actions.append(makeButton('Doğrulama dosyasını indir','primary',e=>{}));actions.lastChild.addEventListener('click',ev=>{ev.stopPropagation();downloadVerification(d);});actions.append(makeButton('Dosyayı kontrol et','',ev=>{ev.stopPropagation();verifyDomain(d.id);}));}
  else actions.append(makeButton('Mülkü aç','primary',ev=>{ev.stopPropagation();openProperty(d.id);}));
  card.append(left,actions);card.addEventListener('click',()=>openProperty(d.id));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProperty(d.id);}});root.append(card);
 });
}
function downloadVerification(d){
 const payload=d.verification||{};
 if(!payload.content||!payload.fileName){status('domainNotice','Doğrulama dosyası alınamadı. Alan adını yeniden eklemeyi dene.');return;}
 const blob=new Blob([payload.content],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=payload.fileName;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 status('domainNotice','Dosya indirildi. GitHub projenin .well-known klasörüne '+payload.fileName+' adıyla yükle, commit/publish et ve sonra Dosyayı kontrol et.');
}
async function verifyDomain(id){
 status('domainNotice','Mülke ait özel doğrulama dosyası aranıyor…');
 try{const r=await api('sentrixVerifyDomain',{domainId:id});
  if(!r.verified){status('domainNotice','Başarısız: doğrulama dosyası bulunamadı veya içeriği eşleşmedi. Mülk doğrulanmadı. Dosyanın .well-known klasöründe ve yayınlanmış olduğundan emin ol.');return;}
  const d=domains.find(x=>x.id===id);if(d){d.verified=true;d.verification=null;}renderDomains();
  status('domainNotice','Başarılı: '+(d?d.host:'Mülk')+' sahipliği doğrulandı.');await openProperty(id);
 }catch(e){status('domainNotice','Doğrulama başarısız; mülk doğrulanmadı: '+message(e));}
}
function addDetailRow(parent,label,value){
 const row=document.createElement('div');row.className='detail-row';const k=document.createElement('span'),v=document.createElement('strong');k.textContent=label;v.textContent=value==null?'—':String(value);row.append(k,v);parent.append(row);
}
async function openProperty(id){
 const d=domains.find(x=>x.id===id);if(!d)return;
 $('domainForm').classList.add('hidden');$('domainList').classList.add('hidden');$('propertyDetail').classList.remove('hidden');
 const root=$('propertyDetailContent');root.replaceChildren();
 const heading=document.createElement('div');heading.className='section';const eyebrow=document.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent='PROPERTY WORKSPACE';
 const h=document.createElement('h2');h.textContent=d.host;const p=document.createElement('p');p.className='lead';p.textContent=d.url;
 const badge=document.createElement('span');badge.className='state '+(d.verified?'good':'pending');badge.textContent=d.verified?'Sahiplik doğrulandı':'Sahiplik doğrulanmadı';heading.append(eyebrow,h,p,badge);root.append(heading);
 const panel=document.createElement('div');panel.className='property-details card';panel.textContent='Mülkün verileri yükleniyor…';root.append(panel);
 if(!d.verified){panel.replaceChildren();const msg=document.createElement('p');msg.textContent='Bu mülk henüz doğrulanmadı. Doğrulama dosyasını GitHub deposunun .well-known klasörüne ekleyip yayınladıktan sonra kontrol et.';panel.append(msg,makeButton('Doğrulama dosyasını indir','primary',()=>downloadVerification(d)),makeButton('Dosyayı kontrol et','',()=>verifyDomain(id)));return;}
 try{
  const data=await api('sentrixGetDomainDetails',{domainId:id});panel.replaceChildren();
  const stats=document.createElement('div');stats.className='property-stats';
  [['Son 30 gün sayfa görüntüleme',data.analytics.pageViews],['Tekil ziyaretçi',data.analytics.uniqueVisitors],['Güvenlik olayı',data.securityEvents.length]].forEach(([k,v])=>{const box=document.createElement('article');box.className='stat';const l=document.createElement('span'),n=document.createElement('strong');l.textContent=k;n.textContent=Number(v||0).toLocaleString('tr-TR');box.append(l,n);stats.append(box);});panel.append(stats);
  const pages=document.createElement('section');pages.className='detail-section';const ph=document.createElement('h3');ph.textContent='Son sayfa görüntülemeleri';pages.append(ph);
  if(!data.analytics.recentPages.length){const empty=document.createElement('p');empty.textContent='Henüz izleme verisi yok. Tracker kodunu mülküne eklediğinde gerçek veriler burada görünür.';pages.append(empty);}
  data.analytics.recentPages.forEach(x=>{const r=document.createElement('div');r.className='detail-row';r.textContent=(x.path||'/')+' · '+(x.occurredAt?new Date(x.occurredAt).toLocaleString('tr-TR'):'');pages.append(r);});panel.append(pages);
  const sec=document.createElement('section');sec.className='detail-section';const sh=document.createElement('h3');sh.textContent='Güvenlik olayları';sec.append(sh);
  if(!data.securityEvents.length){const empty=document.createElement('p');empty.textContent='Bağlı kaynaklardan henüz güvenlik olayı alınmadı.';sec.append(empty);}
  data.securityEvents.forEach(x=>{const r=document.createElement('div');r.className='detail-row';r.textContent=[x.eventType,x.source,x.summary].filter(Boolean).join(' · ');sec.append(r);});panel.append(sec);
  const assets=document.createElement('section');assets.className='detail-section';const ah=document.createElement('h3');ah.textContent='İlişkili varlıklar';assets.append(ah);
  if(!data.assets.length){const empty=document.createElement('p');empty.textContent='Bu mülke bağlı ek varlık yok.';assets.append(empty);}
  data.assets.forEach(x=>{const r=document.createElement('div');r.className='detail-row';r.textContent=x.url+' · '+x.status;assets.append(r);});panel.append(assets);
  if(d.verified)panel.append(makeButton('İzleme kodunu göster','',()=>showSnippet(d)));
 }catch(e){panel.textContent='Mülk verileri yüklenemedi: '+message(e);}
}
function showSnippet(d){
 const code=d.snippet||'';
 if(!code){status('domainNotice','İzleme kodu alınamadı.');return;}
 const box=document.createElement('div');box.className='snippet-box';const p=document.createElement('p');p.textContent='Bu kodu mülkünün sayfalarında kapanış body etiketinden önce kullan:';const pre=document.createElement('pre');pre.textContent=code;
 const b=makeButton('Kodu kopyala','primary',async()=>{try{await navigator.clipboard.writeText(code);b.textContent='Kopyalandı';}catch(e){b.textContent='Kopyalama başarısız';}});box.append(p,pre,b);$('propertyDetailContent').prepend(box);
}
if(!window.Parse||!cfg){status('authMessage','Back4App istemci yapılandırması bulunamadı.');return;}
Parse.initialize(cfg.applicationId,cfg.javascriptKey);Parse.serverURL=cfg.serverURL;
document.querySelectorAll('[data-open-auth]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.openAuth)));
$('closeAuth').addEventListener('click',()=>modal.classList.add('hidden'));
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden');});
$('authSwitch').addEventListener('click',()=>{mode=mode==='login'?'signup':'login';renderAuth();});
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=$('authSubmit');b.disabled=true;b.textContent='İşleniyor…';
 try{let u;if(mode==='signup'){u=new Parse.User();u.set('username',$('authEmail').value.trim().toLowerCase());u.set('email',$('authEmail').value.trim().toLowerCase());u.set('password',$('authPassword').value);u.set('name',$('authName').value.trim());await u.signUp();}
 else u=await Parse.User.logIn($('authEmail').value.trim().toLowerCase(),$('authPassword').value);
 modal.classList.add('hidden');setAuthenticated(u);
 }catch(err){status('authMessage',message(err));}finally{b.disabled=false;b.textContent=mode==='signup'?'Kayıt ol':'Giriş yap';}
});
$('logoutBtn').addEventListener('click',async()=>{await Parse.User.logOut();setPublic();});
$('domainForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{const d=await api('sentrixCreateDomain',{url:$('domainUrl').value.trim()});$('domainUrl').value='';status('domainNotice','Mülk eklendi. Sana özel doğrulama dosyasını indirip GitHub deposunun .well-known klasörüne yükle.');await loadWorkspace();const saved=domains.find(x=>x.id===d.domainId);if(saved){saved.verification=d.verification;downloadVerification(saved);}}
 catch(err){status('domainNotice','Mülk eklenemedi: '+message(err));}finally{b.disabled=false;}
});
$('backToProperties').addEventListener('click',()=>{$('propertyDetail').classList.add('hidden');$('domainForm').classList.remove('hidden');$('domainList').classList.remove('hidden');});
$('deleteAccountBtn').addEventListener('click',async()=>{
 const confirmation=window.prompt('Hesabın, mülklerin ve ilişkili verilerin kalıcı olarak silinecek. Devam etmek için DELETE MY ACCOUNT yaz:');
 if(confirmation!=='DELETE MY ACCOUNT'){status('accountNotice','Hesap silme işlemi iptal edildi.');return;}
 const b=$('deleteAccountBtn');b.disabled=true;b.textContent='Hesap siliniyor…';
 try{await api('sentrixDeleteAccount',{confirmation});await Parse.User.logOut();setPublic();status('authMessage','Hesap ve ilişkili SENTRIX verileri silindi.');}
 catch(e){status('accountNotice','Hesap silinemedi: '+message(e));}
 finally{b.disabled=false;b.textContent='Hesabımı sil';}
});
$('year').textContent=new Date().getFullYear();
const current=Parse.User.current();if(current)setAuthenticated(current);else setPublic();
})();