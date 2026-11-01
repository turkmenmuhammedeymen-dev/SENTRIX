/* SENTRIX dedicated workspaces — real Back4App data only. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const root=$('sentrixWorkspaces');
if(!root||!window.Parse)return;
const state={domains:[],active:'overview',cache:{}};
const esc=s=>String(s==null?'—':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('tr-TR');
const date=d=>d?new Date(d).toLocaleString('tr-TR'):'—';
const call=(name,params={})=>Parse.Cloud.run(name,params);
function notice(id,msg){const el=$(id);if(el)el.textContent=msg;}
function activeDomain(){return $('sxDomainSelect')?.value||state.domains.find(x=>x.verified)?.id;}
function verified(){return state.domains.filter(x=>x.verified);}
function nav(){return [
['overview','Genel Bakış','Canlı metrikler'],['geo','Coğrafi Analiz','Ülke ve şehir dağılımı'],['behavior','Davranış Analizi','Isı haritası ve yolculuk'],['security','Güvenlik Merkezi','Anomali sinyalleri'],['performance','Performans & Uptime','Gerçek ölçümler'],['ai','Yapay Zekâ','Veriye dayalı analiz'],['reports','Raporlama','CSV ve PDF'],['alerts','Bildirim Merkezi','E-posta testi'],['settings','Entegrasyonlar','Bağlantı sağlık durumu']
];}
function shell(){
 root.innerHTML=`<div class="sx-workspace-head"><div><div class="eyebrow">SENTRIX CONTROL CENTER</div><h2>Çalışma Alanları</h2><p class="notice">Her modül doğrulanmış mülklerin gerçek Back4App kayıtlarını kullanır. Veri bulunmuyorsa boş durum gösterilir.</p></div><label class="sx-domain-label">Mülk seçimi<select id="sxDomainSelect"></select></label></div>
 <div class="sx-workspace-layout"><nav class="sx-side-nav" aria-label="SENTRIX çalışma alanları" id="sxWorkspaceNav"></nav><div class="sx-workspace-content" id="sxWorkspaceContent" aria-live="polite"></div></div>`;
 const select=$('sxDomainSelect');
 select.innerHTML=verified().map(d=>'<option value="'+esc(d.id)+'">'+esc(d.host)+'</option>').join('');
 if(!verified().length)select.innerHTML='<option value="">Doğrulanmış mülk yok</option>';
 select.addEventListener('change',()=>{state.cache={};renderActive();});
 $('sxWorkspaceNav').innerHTML=nav().map(([id,label,sub])=>'<button type="button" class="sx-nav-item" data-sx-page="'+id+'"><strong>'+label+'</strong><small>'+sub+'</small></button>').join('');
 $('sxWorkspaceNav').addEventListener('click',e=>{const b=e.target.closest('[data-sx-page]');if(!b)return;state.active=b.dataset.sxPage;renderActive();});
}
function card(title,value,sub=''){return '<article class="sx-metric"><span>'+title+'</span><strong>'+value+'</strong><small>'+sub+'</small></article>';}
function rows(items,empty){return items&&items.length?'<div class="sx-table">'+items.map(x=>'<div class="sx-row">'+x+'</div>').join('')+'</div>':'<p class="sx-empty">'+empty+'</p>';}
function section(title,desc,body){return '<section class="sx-module"><div class="eyebrow">SENTRIX MODULE</div><h3>'+title+'</h3><p class="notice">'+desc+'</p>'+body+'</section>';}
function renderActive(){
 const content=$('sxWorkspaceContent');if(!content)return;
 document.querySelectorAll('[data-sx-page]').forEach(b=>b.classList.toggle('active',b.dataset.sxPage===state.active));
 const id=activeDomain();
 if(!id){content.innerHTML=section('Doğrulanmış mülk gerekli','Analiz modüllerini kullanmak için önce alan adını ekle ve canlı HTTPS doğrulamasını tamamla.','<p class="sx-empty">Henüz doğrulanmış mülk bulunmuyor. Mülk yönetimi bölümünden alan adı ekleyebilirsin.</p>');return;}
 const page=state.active;
 content.innerHTML=section(nav().find(x=>x[0]===page)[1],'Seçili mülk: '+esc(verified().find(d=>d.id===id)?.host||'')+' · Son 30 gün','<p class="sx-loading">Gerçek veriler yükleniyor…</p>');
 load(page,id).catch(e=>{content.innerHTML=section(nav().find(x=>x[0]===page)[1],'Sunucu yanıtı alınamadı.','<p class="sx-error">'+esc(e.message||e)+'</p>');});
}
async function load(page,id){
 const content=$('sxWorkspaceContent');
 if(page==='ai'||page==='alerts'||page==='reports'||page==='settings'){renderActionPage(page,id);return;}
 if(page==='overview'){
  const [overview,advanced,intel]=await Promise.all([call('sentrixGetDomainDetails',{domainId:id}),call('sentrixGetAdvancedAnalytics',{domainId:id}),call('sentrixGetIntelligence',{domainId:id})]);
  const a=overview.analytics||{};
  content.innerHTML=section('Mülk özeti','Yalnızca sunucuda kayıtlı olaylar.','<div class="sx-metrics">'+card('Sayfa görüntüleme',fmt(a.pageViews),'Son 30 gün')+card('Tekil ziyaretçi',fmt(a.uniqueVisitors),'Son 30 gün')+card('Güvenlik olayı',fmt((overview.securityEvents||[]).length),'Kayıtlı olay')+card('Etkileşim',fmt(advanced.interactions.clicks),'Tıklama')+card('Dönüşüm',fmt(advanced.interactions.conversions),'İşaretlenmiş dönüşüm')+card('Uptime',advanced.uptime.availability==null?'—':advanced.uptime.availability+'%','Ölçülmüş kontroller')+'</div><h4>Son sayfa olayları</h4>'+rows((a.recentPages||[]).map(x=>'<span>'+esc(x.path)+'</span><b>'+date(x.occurredAt)+'</b>'),'Henüz gerçek sayfa görüntüleme kaydı yok.')+'<p class="sx-footnote">Coğrafi olay: '+fmt(intel.geo.length)+' konum grubu · Isı haritası hücresi: '+fmt(intel.heatmap.length)+' · Yolculuk adımı: '+fmt(intel.journey.length)+'</p>');
 } else if(page==='geo'){
  const d=await call('sentrixGetIntelligence',{domainId:id});
  const geo=d.geo||[];
  content.innerHTML=section('Coğrafi ziyaretçi analizi','IP adresi saklanmadan GeoIP sağlayıcısından alınan yaklaşık konumlar.','<div class="sx-map-wrap" id="sxGeoMap"></div>'+rows(geo.map(x=>'<span>'+esc(x.place)+'</span><b>'+fmt(x.count)+' ziyaret</b>'),'Coğrafi veri yok. Yeni ziyaretler için SENTRIX_GEOIP_TOKEN yapılandırılmalı ve GeoIP izinli olmalı.'));
  const pts=d.mapPoints||[];
  if(!document.getElementById('sx-leaflet-css')){const css=document.createElement('link');css.id='sx-leaflet-css';css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(css);}
  if(pts.length&&window.L){const map=L.map('sxGeoMap').setView([pts[0].latitude,pts[0].longitude],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);pts.forEach(p=>L.circleMarker([p.latitude,p.longitude],{radius:7}).addTo(map).bindPopup(esc([p.city,p.country].filter(Boolean).join(', '))));}
  else if(pts.length){const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=()=>{const map=L.map('sxGeoMap').setView([pts[0].latitude,pts[0].longitude],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);pts.forEach(p=>L.circleMarker([p.latitude,p.longitude]).addTo(map).bindPopup([p.city,p.country].filter(Boolean).join(', ')));};document.head.append(s);}
  else $('sxGeoMap').innerHTML='<p class="sx-empty">Haritada gösterilecek koordinat yok.</p>';
 } else if(page==='behavior'){
  const d=await call('sentrixGetIntelligence',{domainId:id});
  const dots=(d.heatmap||[]).map(p=>'<i class="sx-heat-dot" style="left:'+(p.x*100)+'%;top:'+(p.y*100)+'%;opacity:'+Math.min(.95,.2+p.count/20)+'" title="'+fmt(p.count)+' etkileşim"></i>').join('');
  content.innerHTML=section('Isı haritası','Koordinat tabanlı toplu tıklama yoğunluğu. Form içeriği ve tuş vuruşları kaydedilmez.','<div class="sx-heat-canvas">'+dots+'</div>'+rows((d.journey||[]).map(x=>'<span>'+esc(x.step)+'</span><b>'+fmt(x.count)+' adım</b>'),'Henüz etkileşim veya yolculuk kaydı yok. Tracker yeni ziyaretlerden sonra veri gönderecektir.'));
 } else if(page==='security'){
  const d=await call('sentrixGetIntelligence',{domainId:id});
  content.innerHTML=section('Güvenlik sinyalleri','Kural tabanlı trafik anomalileri ve uptime geçişleri. Bunlar tek başına saldırı kanıtı değildir.','<div class="sx-metrics">'+card('Sinyal sayısı',fmt((d.security||[]).length),'Son 30 gün')+'</div>'+rows((d.security||[]).map(x=>'<span>'+esc(x.eventType)+'<small>'+esc(x.summary)+'</small></span><b>'+date(x.occurredAt)+'</b>'),'Henüz otomatik güvenlik sinyali kaydedilmedi.'));
 } else if(page==='performance'){
  const d=await call('sentrixGetAdvancedAnalytics',{domainId:id}),p=d.performance,u=d.uptime;
  content.innerHTML=section('Performans ve erişilebilirlik','Tarayıcı performans ölçümleri ve Back4App uptime kontrolleri.','<div class="sx-metrics">'+card('Ort. yüklenme',p.avgLoadMs==null?'—':fmt(p.avgLoadMs)+' ms',fmt(p.samples)+' örnek')+card('DOM hazır',p.avgDomReadyMs==null?'—':fmt(p.avgDomReadyMs)+' ms','Ortalama')+card('LCP',p.avgLcpMs==null?'—':fmt(p.avgLcpMs)+' ms','Ortalama')+card('CLS',p.avgCls==null?'—':p.avgCls,'Ortalama')+card('Uptime',u.availability==null?'—':u.availability+'%',fmt(u.checks)+' kontrol')+card('Son durum',u.last?esc(u.last.status):'—',u.last?date(u.last.checkedAt):'Kontrol bekleniyor')+'</div><p class="sx-footnote">Uptime kontrolleri için Back4App Cloud Job sentrixUptimeSweep zamanlanmalıdır.</p>');
 }
}
async function renderActionPage(page,id){
 const content=$('sxWorkspaceContent'),host=verified().find(d=>d.id===id)?.host||'';
 if(page==='ai')content.innerHTML=section('Yapay zekâ analiz merkezi','Yalnızca seçili mülkün gerçek ve toplulaştırılmış son 7 günlük verisi analiz edilir.','<button class="btn primary" id="sxRunAI">Gerçek verilerle analiz oluştur</button><div id="sxAIResult" class="sx-result">Analiz henüz çalıştırılmadı.</div>');
 if(page==='alerts')content.innerHTML=section('E-posta bildirim merkezi','Yapılandırılmış alıcıya gerçek test e-postası gönderir.','<button class="btn primary" id="sxTestMail">Test e-postası gönder</button><p id="sxMailResult" class="sx-result">Gönderim henüz denenmedi.</p>');
 if(page==='reports')content.innerHTML=section('Raporlama merkezi','Raporlar mevcut sunucu kayıtlarından oluşturulur.','<button class="btn primary" id="sxCsv">CSV indir</button> <button class="btn" id="sxPdf">PDF olarak kaydet</button><p class="sx-result">CSV gerçek olay kayıtlarını dışa aktarır. PDF yazdırma penceresinden kaydedilir.</p>');
 if(page==='settings')content.innerHTML=section('Entegrasyon ve servis durumu','Gizli anahtarlar tarayıcıya gönderilmez. Sağlık kontrolü Back4App Cloud Code üzerinden yapılır.','<button class="btn" id="sxHealth">Sunucu bağlantısını denetle</button><div id="sxHealthResult" class="sx-result">Henüz denetlenmedi.</div><p class="sx-footnote">GeoIP, AI, e-posta ve WAF servislerinin etkinleşmesi için BACKEND_SETUP.md içindeki sunucu Config anahtarları gereklidir.</p>');
 if(page==='ai')$('sxRunAI').onclick=async()=>{const b=$('sxRunAI'),out=$('sxAIResult');b.disabled=true;out.textContent='AI sağlayıcısından yanıt bekleniyor…';try{const r=await call('sentrixGenerateAiSummary',{domainId:id});out.textContent=r.summary;}catch(e){out.textContent='Analiz oluşturulamadı: '+(e.message||e);}finally{b.disabled=false;}};
 if(page==='alerts')$('sxTestMail').onclick=async()=>{const b=$('sxTestMail'),out=$('sxMailResult');b.disabled=true;out.textContent='E-posta servisi yanıtı bekleniyor…';try{const r=await call('sentrixSendTestAlert');out.textContent=r.sent?'Test e-postası gönderildi.':'Gönderilemedi: '+(r.reason||'Bilinmeyen hata');}catch(e){out.textContent='Gönderim başarısız: '+(e.message||e);}finally{b.disabled=false;}};
 if(page==='reports'){
  $('sxCsv').onclick=async()=>{const b=$('sxCsv');b.disabled=true;try{const [d,a,i]=await Promise.all([call('sentrixGetDomainDetails',{domainId:id}),call('sentrixGetAdvancedAnalytics',{domainId:id}),call('sentrixGetIntelligence',{domainId:id})]);const rows=[['metric','value'],['host',host],['pageViews',d.analytics.pageViews],['uniqueVisitors',d.analytics.uniqueVisitors],['securityEvents',d.securityEvents.length],['clicks',a.interactions.clicks],['conversions',a.interactions.conversions],['uptimeAvailability',a.uptime.availability],['geoGroups',i.geo.length],['heatmapBins',i.heatmap.length]];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='sentrix-'+host+'-report.csv';link.click();URL.revokeObjectURL(url);}catch(e){alert('CSV oluşturulamadı: '+(e.message||e));}finally{b.disabled=false;}};
  $('sxPdf').onclick=()=>window.print();
 }
 if(page==='settings')$('sxHealth').onclick=async()=>{const out=$('sxHealthResult');out.textContent='Sunucu denetleniyor…';try{const r=await call('sentrixHealth');out.textContent='Cloud Code yanıt verdi: '+JSON.stringify(r);}catch(e){out.textContent='Sunucu sağlık kontrolü başarısız: '+(e.message||e);}};
}
async function boot(){
 try{const user=await Parse.User.currentAsync();if(!user)return;state.domains=await call('sentrixListDomains');shell();renderActive();}
 catch(e){root.innerHTML='<p class="sx-error">Çalışma alanları başlatılamadı: '+esc(e.message||e)+'</p>';}
}
boot();
})();
