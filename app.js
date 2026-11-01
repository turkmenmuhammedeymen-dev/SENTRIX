(() => {
'use strict';
const cfg=window.APP_BACK4APP,$=id=>document.getElementById(id);
const status=(id,msg)=>{const el=$(id);if(el)el.textContent=msg;};
let mode='login',domains=[],currentUser=null,propertyRouteLoading=false;
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
 const route=location.hash.match(/^#property\/(.+)$/);if(route)await openProperty(decodeURIComponent(route[1]),false);
 const d=await api('sentrixGetOverview');
 $('statViews').textContent=Number(d.pageViews||0).toLocaleString('tr-TR');
 $('statSessions').textContent=Number(d.sessions||0).toLocaleString('tr-TR');
 $('statSecurity').textContent=Number(d.securityEvents||0).toLocaleString('tr-TR');
 }catch(e){status('domainNotice','Panel verileri alınamadı: '+message(e));}
 try{await refreshGitHubState();}catch(e){status('githubRepoNotice','GitHub doğrulama servisi şu an kullanılamıyor: '+message(e));}
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
  if(!d.verified){
   actions.append(makeButton('Dosyayı indir','primary',ev=>{ev.stopPropagation();downloadVerification(d);}));
   actions.append(makeButton('Canlı siteyi tara','',ev=>{ev.stopPropagation();verifyDomain(d.id);}));
  } else actions.append(makeButton('Mülkü aç','primary',ev=>{ev.stopPropagation();openProperty(d.id);}));
  actions.append(makeButton('Mülkü sil','danger',ev=>{ev.stopPropagation();deleteDomain(d);}));
  card.append(left,actions);card.addEventListener('click',()=>openProperty(d.id));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProperty(d.id);}});root.append(card);
 });
}
function downloadVerification(d){
 const payload=d.verification||{};
 if(!payload.content||!payload.fileName){status('domainNotice','Doğrulama dosyası alınamadı. Alan adını yeniden eklemeyi dene.');return;}
 const blob=new Blob([payload.content],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=payload.fileName;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 status('domainNotice','Dosya indirildi. GitHub deposunun kökünde .well-known klasörü oluştur; dosyayı .well-known/'+payload.fileName+' yoluna ekle, commit et ve sitenin yayınlanmasını bekle. SENTRIX dosyayı canlı HTTPS adresinden tarar; depoya yüklemek tek başına yeterli değildir.');
}
async function verifyDomain(id){
 status('domainNotice','Mülke ait özel doğrulama dosyası aranıyor…');
 try{const r=await api('sentrixVerifyDomain',{domainId:id});
  if(!r.verified){const why=r.reason==='HOST_NOT_PUBLIC'?'Alan adı herkese açık bir sunucuya çözülmüyor.':r.reason==='VERIFICATION_FETCH_FAILED'?'SENTRIX doğrulama adresine HTTPS üzerinden ulaşamadı.':r.reason==='VERIFICATION_REDIRECT_REJECTED'?'Güvenlik nedeniyle farklı bir alan adına yönlendirme kabul edilmedi.':'Dosya yayındaki sitede bulunamadı veya içeriği bu mülke ait anahtarla eşleşmedi.';status('domainNotice','DOĞRULAMA BAŞARISIZ — '+why+' Mülk doğrulanmadı. Dosya yolu: /.well-known/'+(domains.find(x=>x.id===id)?.verification?.fileName||'sentrix-verify-….txt')+'. Dosyayı GitHub deposunda bu klasöre ekleyip değişiklikleri yayınla; yalnızca depoya yüklemek yeterli değildir.');return;}
  const d=domains.find(x=>x.id===id);if(d){d.verified=true;d.verification=null;}renderDomains();
  status('domainNotice','Başarılı: '+(d?d.host:'Mülk')+' sahipliği doğrulandı.');await openProperty(id);
 }catch(e){status('domainNotice','Doğrulama başarısız; mülk doğrulanmadı: '+message(e));}
}
async function deleteDomain(d){
 const confirmation=window.prompt('Bu mülkü ve ona bağlı SENTRIX kayıtlarını silmek için alan adını aynen yaz: '+d.host);
 if(confirmation!==d.host){status('domainNotice','Mülk silme işlemi iptal edildi.');return;}
 const buttons=[...$('domainList').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 status('domainNotice',d.host+' ve ilişkili kayıtlar siliniyor…');
 try{
  await api('sentrixDeleteDomain',{domainId:d.id,confirmation});
  status('domainNotice',d.host+' mülkü ve ona bağlı SENTRIX kayıtları silindi.');
  await loadWorkspace();
  if(!$('propertyDetail').classList.contains('hidden'))$('propertyDetail').classList.add('hidden');
  $('domainForm').classList.remove('hidden');$('domainList').classList.remove('hidden');
 }catch(e){status('domainNotice','Mülk silinemedi: '+message(e));buttons.forEach(b=>b.disabled=false);}
}
function addDetailRow(parent,label,value){
 const row=document.createElement('div');row.className='detail-row';const k=document.createElement('span'),v=document.createElement('strong');k.textContent=label;v.textContent=value==null?'—':String(value);row.append(k,v);parent.append(row);
}
function setPropertyPage(active){
 const dashboard=$('dashboard'),detail=$('propertyDetail');
 [...dashboard.children].forEach(el=>{if(el!==detail)el.classList.toggle('hidden',active);});
 detail.classList.toggle('hidden',!active);
 if(active){window.scrollTo({top:0,behavior:'auto'});document.title='Mülk · SENTRIX';}
 else{document.title='SENTRIX — Security Intelligence';}
}
async function openProperty(id,updateRoute=true){
 const d=domains.find(x=>x.id===id);if(!d)return;
 if(updateRoute&&location.hash!=='#property/'+encodeURIComponent(id))history.pushState({propertyId:id},'', '#property/'+encodeURIComponent(id));
 setPropertyPage(true);
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
  const tracking=document.createElement('section');tracking.className='detail-section tracker-status '+(data.tracker&&data.tracker.active?'is-connected':'is-pending');
  const th=document.createElement('h3');th.textContent='SENTRIX izleme bağlantısı';tracking.append(th);
  const state=document.createElement('div');state.className='tracker-state '+(data.tracker&&data.tracker.active?'connected':'pending');
  state.textContent=data.tracker&&data.tracker.active?'✓ İzleme kodu doğru yüklendi ve SENTRIX veri alıyor':data.tracker&&data.tracker.installed?'! Tracker daha önce veri gönderdi; son 24 saatte yeni sinyal alınmadı':'○ İzleme kodu henüz tespit edilmedi';tracking.append(state);
  const last=document.createElement('p');last.className='notice';last.textContent=data.tracker&&data.tracker.lastSeenAt?'Son başarılı sinyal: '+new Date(data.tracker.lastSeenAt).toLocaleString('tr-TR'):'SENTRIX, doğrulanmış alan adından ilk başarılı sayfa görüntüleme isteğini bekliyor.';tracking.append(last);
  if(!(data.tracker&&data.tracker.active))tracking.append(makeButton('İzleme kodunu göster','primary',()=>showSnippet(d)));
  tracking.append(makeButton('Durumu yeniden kontrol et','',()=>openProperty(id)));
  panel.prepend(tracking);
 }catch(e){panel.textContent='Mülk verileri yüklenemedi: '+message(e);}
}
function showSnippet(d){
 const code=d.snippet||'';
 if(!code){status('domainNotice','İzleme kodu henüz alınamadı. Mülk ayrıntılarını yenileyip tekrar dene.');return;}
 const root=$('propertyDetailContent');
 const previous=root.querySelector('.snippet-box');if(previous)previous.remove();
 const box=document.createElement('div');box.className='snippet-box card';
 const title=document.createElement('h3');title.textContent='SENTRIX izleme kodu';
 const p=document.createElement('p');p.textContent='Aşağıdaki kodu, doğrulanmış mülkünün tüm sayfalarında kapanış </body> etiketinden hemen önce ekle. Yayınladıktan sonra siteyi ziyaret ederek veri akışını başlat.';
 const pre=document.createElement('pre');pre.textContent=code;
 const b=makeButton('Kodu kopyala','primary',async()=>{
  try{
   if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(code);
   else {const ta=document.createElement('textarea');ta.value=code;ta.setAttribute('readonly','');ta.style.position='absolute';ta.style.left='-9999px';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('COPY_FAILED');}
   b.textContent='Kopyalandı';
  }catch(e){b.textContent='Kopyalama başarısız';}
 });
 const close=makeButton('Kapat','',()=>box.remove());
 box.append(title,p,pre,b,close);root.prepend(box);box.scrollIntoView({behavior:'smooth',block:'center'});
}

let githubDeviceCode=null;
function renderGitHubRepositories(items){
 const root=$('githubRepoList');if(!root)return;root.replaceChildren();
 if(!items||!items.length){root.textContent='Henüz doğrulanmış GitHub deposu yok.';return;}
 items.forEach(item=>{
  const card=document.createElement('article');card.className='domain-card';
  const left=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('p'),badge=document.createElement('span');
  name.textContent=item.repository;meta.textContent='GitHub hesabı: '+item.githubLogin+' · Yetki: '+(item.permission||'—');
  badge.className='state '+(item.verified?'good':'pending');
  badge.textContent=item.verified?(item.verificationType==='PERSONAL_REPOSITORY_OWNER'?'Depo sahibi doğrulandı':'Kuruluş yöneticisi doğrulandı'):'Doğrulanmadı';
  left.append(name,meta,badge);card.append(left);
  if(item.repositoryUrl){const a=document.createElement('a');a.className='btn';a.href=item.repositoryUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='GitHub deposunu aç';card.append(a);}
  root.append(card);
 });
}
async function refreshGitHubState(){
 const state=await api('sentrixGitHubConnectionStatus');
 const title=$('githubConnectionTitle'),detail=$('githubConnectionText'),connect=$('githubConnectBtn'),disconnect=$('githubDisconnectBtn');
 if(state.connected){title.textContent='GitHub hesabı bağlı: @'+state.login;detail.textContent='GitHub hesabı SENTRIX ile yetkilendirildi. Depolar için canlı API denetimi yapılabilir.';connect.classList.add('hidden');disconnect.classList.remove('hidden');}
 else{title.textContent='GitHub hesabı bağlı değil';detail.textContent='Depo mülkiyeti doğrulamak için GitHub hesabını bağla.';connect.classList.remove('hidden');disconnect.classList.add('hidden');}
 const repos=await api('sentrixGitHubListRepositories');renderGitHubRepositories(repos);
}
async function startGitHubDeviceFlow(){
 const b=$('githubConnectBtn');b.disabled=true;b.textContent='Bağlantı hazırlanıyor…';
 try{
  const r=await api('sentrixGitHubDeviceStart');githubDeviceCode=r.deviceCode;
  $('githubUserCode').textContent=r.userCode;$('githubDevicePanel').classList.remove('hidden');
  $('githubDeviceNotice').textContent='Kod '+Math.ceil(r.expiresIn/60)+' dakika geçerli. GitHub sayfasında kodu onayla, sonra SENTRIX’e dönüp kontrol et.';
  $('githubVerifyLink').href=r.verificationUri;
 }catch(e){status('githubRepoNotice','GitHub bağlantısı başlatılamadı: '+message(e));}
 finally{b.disabled=false;b.textContent='GitHub hesabını bağla';}
}
async function pollGitHubDeviceFlow(){
 if(!githubDeviceCode){status('githubDeviceNotice','Önce GitHub bağlantısını başlat.');return;}
 const b=$('githubPollBtn');b.disabled=true;b.textContent='Kontrol ediliyor…';
 try{
  const r=await api('sentrixGitHubDevicePoll',{deviceCode:githubDeviceCode});
  if(r.pending){status('githubDeviceNotice','GitHub onayı henüz tamamlanmadı. GitHub sayfasındaki adımı bitirip tekrar kontrol et.');return;}
  if(!r.connected){githubDeviceCode=null;status('githubDeviceNotice',r.reason==='GITHUB_ACCESS_DENIED'?'GitHub erişim izni verilmedi. Yeniden bağlanabilirsin.':'Yetkilendirme kodunun süresi doldu. Yeniden başlat.');return;}
  githubDeviceCode=null;$('githubDevicePanel').classList.add('hidden');
  status('githubRepoNotice','GitHub hesabı başarıyla bağlandı: @'+r.login+'. Şimdi depo adresini girip doğrulayabilirsin.');
  await refreshGitHubState();
 }catch(e){status('githubDeviceNotice','Yetkilendirme kontrol edilemedi: '+message(e));}
 finally{b.disabled=false;b.textContent='Yetkilendirmeyi kontrol et';}
}
async function verifyGitHubRepository(e){
 e.preventDefault();const b=$('githubRepoVerifyBtn'),url=$('githubRepoUrl').value.trim();
 if(!url)return;b.disabled=true;b.textContent='GitHub API denetleniyor…';
 status('githubRepoNotice','GitHub hesabı ve depo izinleri canlı API üzerinden kontrol ediliyor. Henüz doğrulanmadı.');
 try{
  const r=await api('sentrixGitHubVerifyRepository',{repositoryUrl:url});
  if(!r.verified){
   const why=r.reason==='ADMIN_PERMISSION_REQUIRED'?'Bağlı hesapta depo sahibi/yönetici (admin) yetkisi bulunamadı. Yazma veya katkıcı erişimi sahiplik sayılmaz.':'Depo sahibi ile yetkilendirilmiş GitHub hesabı eşleşmiyor.';
   status('githubRepoNotice','DOĞRULANMADI — '+why+' Depo: '+(r.repository||url)+' · Hesap: @'+r.githubLogin+' · Yetki: '+r.permission);
  }else{
   const label=r.verificationType==='PERSONAL_REPOSITORY_OWNER'?'Kişisel depo sahibi':'Kuruluş deposu yöneticisi';
   status('githubRepoNotice','DOĞRULANDI — '+label+' yetkisi GitHub API ile doğrulandı. Depo: '+r.repository+' · Hesap: @'+r.githubLogin);
   $('githubRepoUrl').value='';
  }
  await refreshGitHubState();
 }catch(err){status('githubRepoNotice','DOĞRULANMADI — GitHub doğrulaması tamamlanamadı: '+message(err));}
 finally{b.disabled=false;b.textContent='Depoyu doğrula';}
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
 e.preventDefault();
 const b=e.submitter||$('domainForm').querySelector('button[type="submit"],button:not([type])');
 const raw=$('domainUrl').value.trim();
 if(!raw){status('domainNotice','Önce bir alan adı gir.');return;}
 b.disabled=true;b.textContent='Ekleniyor…';
 try{
  const d=await api('sentrixCreateDomain',{url:raw});
  $('domainUrl').value='';
  status('domainNotice',d.verified?'Bu alan adı hesabında zaten doğrulanmış.':'Mülk kaydedildi. Sana özel doğrulama dosyası hazırlanıyor…');
  await loadWorkspace();
  const saved=domains.find(x=>x.id===d.domainId);
  if(saved){saved.verification=d.verification||saved.verification;renderDomains();if(!d.verified)downloadVerification(saved);}
 }catch(err){const detail=message(err);const missingFunction=/invalid function|function[^.]*not found|could not find function/i.test(detail);status('domainNotice',missingFunction?'Sunucu yapılandırması eksik: sentrixCreateDomain Cloud Code fonksiyonu Back4App üzerinde etkin değil. GitHub deposundaki cloud/main.js dosyasını Back4App Cloud Code alanına yükleyip Deploy et. GitHub commit işlemi Back4App dağıtımını otomatik yapmaz. Alan adı verin kaybolmadı; tekrar denemeden önce dağıtımı tamamla.':'Mülk eklenemedi: '+detail+' — Alan adını example.com veya https://example.com biçiminde gir.');}
 finally{b.disabled=false;b.textContent='Alan adı ekle';}
});
$('backToProperties').addEventListener('click',()=>{history.replaceState({},'',location.pathname+location.search);setPropertyPage(false);});
window.addEventListener('popstate',()=>{const route=location.hash.match(/^#property\/(.+)$/);if(route&&currentUser){openProperty(decodeURIComponent(route[1]),false);}else if(currentUser){setPropertyPage(false);}});
$('deleteAccountBtn').addEventListener('click',async()=>{
 const confirmation=window.prompt('Hesabın, mülklerin ve ilişkili verilerin kalıcı olarak silinecek. Devam etmek için DELETE MY ACCOUNT yaz:');
 if(confirmation!=='DELETE MY ACCOUNT'){status('accountNotice','Hesap silme işlemi iptal edildi.');return;}
 const b=$('deleteAccountBtn');b.disabled=true;b.textContent='Hesap siliniyor…';
 try{await api('sentrixDeleteAccount',{confirmation});await Parse.User.logOut();setPublic();status('authMessage','Hesap ve ilişkili SENTRIX verileri silindi.');}
 catch(e){status('accountNotice','Hesap silinemedi: '+message(e));}
 finally{b.disabled=false;b.textContent='Hesabımı sil';}
});
$('year').textContent=new Date().getFullYear();
$('githubConnectBtn').addEventListener('click',startGitHubDeviceFlow);
$('githubPollBtn').addEventListener('click',pollGitHubDeviceFlow);
$('githubRepoForm').addEventListener('submit',verifyGitHubRepository);
$('githubDisconnectBtn').addEventListener('click',async()=>{
 const b=$('githubDisconnectBtn');b.disabled=true;
 try{await api('sentrixGitHubDisconnect');githubDeviceCode=null;$('githubDevicePanel').classList.add('hidden');status('githubRepoNotice','GitHub bağlantısı kesildi ve doğrulama kayıtları kaldırıldı.');await refreshGitHubState();}
 catch(e){status('githubRepoNotice','Bağlantı kesilemedi: '+message(e));}
 finally{b.disabled=false;}
});

(async()=>{try{const current=await Parse.User.currentAsync();if(current&&current.getSessionToken()){setAuthenticated(current);}else{setPublic();}}catch(e){try{await Parse.User.logOut();}catch(_){}setPublic();}})();
})();