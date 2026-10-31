(() => {
  const cfg=window.APP_BACK4APP;
  const status=document.getElementById('backendStatus');
  if(!window.Parse || !cfg || cfg.applicationId.startsWith('PASTE_')) { if(status) status.textContent='Back4App bağlantısı için public App ID ve JavaScript Key ayarlanmalı.'; return; }
  Parse.initialize(cfg.applicationId,cfg.javascriptKey); Parse.serverURL=cfg.serverURL;
  const say=t=>{if(status)status.textContent=t;};
  window.SENTRIX={async signUp(username,email,password){const u=new Parse.User();u.set('username',username);u.set('email',email);u.set('password',password);return u.signUp();},
    async login(username,password){return Parse.User.logIn(username,password);}, async logout(){return Parse.User.logOut();},
    async addAsset(url,authorizationConfirmed){return Parse.Cloud.run('sentrixAddAsset',{url,authorizationConfirmed});},
    async listAssets(){return Parse.Cloud.run('sentrixListAssets');},
    async requestAssessment(assetId,scopeNote,authorizationConfirmed){return Parse.Cloud.run('sentrixCreateAssessmentRequest',{assetId,scopeNote,authorizationConfirmed});}};
  Parse.Cloud.run('sentrixHealth').then(()=>say('Back4App bağlı · oturum '+(Parse.User.current()?'açık':'kapalı'))).catch(e=>say('Back4App bağlantı hatası: '+e.message));
  const form=document.getElementById('assetForm');
  if(form)form.addEventListener('submit',async e=>{e.preventDefault();const input=document.getElementById('asset');const box=document.getElementById('result');try{if(!Parse.User.current())throw Error('Önce giriş yapmalısın.');const r=await SENTRIX.addAsset(input.value,true);box.style.display='block';box.textContent='Varlık Back4App hesabına kaydedildi: '+r.host;input.value='';}catch(err){box.style.display='block';box.textContent='İşlem tamamlanamadı: '+err.message;}});
})();
