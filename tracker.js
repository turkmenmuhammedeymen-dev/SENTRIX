(function(){
'use strict';
var script=document.currentScript;
function findTrackerScript(){
  if(script&&script.getAttribute('data-site-id'))return script;
  var all=document.querySelectorAll('script[data-site-id]');
  for(var i=all.length-1;i>=0;i--){
    var src=all[i].src||'';
    if(src.indexOf('/tracker.js')!==-1)return all[i];
  }
  return null;
}
script=findTrackerScript();
if(!script){console.error('[SENTRIX] Tracker script tag could not be identified.');return;}
var siteId=script.getAttribute('data-site-id');
if(!siteId){console.error('[SENTRIX] data-site-id is missing.');return;}
var endpoint='https://parseapi.back4app.com/functions/sentrixTrackPageView';
var appId='33iVkF8qI8RLYO55iSJ7EUkkj4VwTVBOWznZU8tn';
var jsKey='5GITBYvsaM77CaqQWRGpqo8Bwe6OTdKcD0IzohgF';
function visitor(){
  try{
    var k='sentrix_session_id',v=sessionStorage.getItem(k);
    if(!v){v=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));sessionStorage.setItem(k,v);}
    return v;
  }catch(e){return 'ephemeral-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
}
function report(message,error){
  try{console.warn('[SENTRIX] '+message,error||'');}catch(_){}
}
function sendAttempt(payload,attempt){
  fetch(endpoint,{
    method:'POST',
    mode:'cors',
    cache:'no-store',
    headers:{
      'Content-Type':'application/json',
      'X-Parse-Application-Id':appId,
      'X-Parse-Javascript-Key':jsKey
    },
    body:JSON.stringify(payload),
    keepalive:true,
    credentials:'omit'
  }).then(function(response){
    return response.text().then(function(raw){
      var data={};try{data=raw?JSON.parse(raw):{};}catch(_){}
      if(!response.ok||data.error){
        var message=(data.error&&data.error.message)||data.error||('HTTP_'+response.status);
        report('Page-view event rejected: '+message);
        if(attempt<3)setTimeout(function(){sendAttempt(payload,attempt+1);},1500*attempt);
        return;
      }
      report('Page-view event accepted for '+payload.host+' '+payload.path);
      try{window.dispatchEvent(new CustomEvent('sentrix:tracked',{detail:{siteId:siteId,host:payload.host}}));}catch(_){}
    });
  }).catch(function(error){
    report('Page-view request failed (attempt '+attempt+'/3).',error);
    if(attempt<3)setTimeout(function(){sendAttempt(payload,attempt+1);},1500*attempt);
  });
}
function send(){
  var payload={
    siteId:siteId,
    host:location.hostname.toLowerCase(),
    path:location.pathname.slice(0,500),
    referrer:document.referrer.slice(0,500),
    visitorId:visitor()
  };
  sendAttempt(payload,1);
}
if(document.readyState==='complete'||document.readyState==='interactive')send();
else document.addEventListener('DOMContentLoaded',send,{once:true});
})();