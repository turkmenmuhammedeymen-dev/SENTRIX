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
function sendExtra(name,payload){fetch('https://parseapi.back4app.com/functions/'+name,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','X-Parse-Application-Id':appId,'X-Parse-Javascript-Key':jsKey},body:JSON.stringify(payload),credentials:'omit',keepalive:true}).then(function(r){if(!r.ok)report(name+' rejected: HTTP_'+r.status);}).catch(function(e){report(name+' network error',e);});}
function sendInteraction(kind,target){sendExtra('sentrixTrackInteraction',{siteId:siteId,host:location.hostname.toLowerCase(),kind:kind,target:String(target||'').slice(0,120),path:location.pathname.slice(0,300),visitorId:visitor()});}
function sendJourney(step){sendExtra('sentrixTrackJourneyStep',{siteId:siteId,host:location.hostname.toLowerCase(),step:String(step||'').slice(0,60),path:location.pathname.slice(0,300),visitorId:visitor()});}
function sendHeatmap(node,event){var rect=node.getBoundingClientRect(),x=(event.clientX-rect.left)/Math.max(rect.width,1),y=(event.clientY-rect.top)/Math.max(rect.height,1);sendExtra('sentrixTrackHeatmap',{siteId:siteId,host:location.hostname.toLowerCase(),path:location.pathname.slice(0,300),x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),target:node.getAttribute('data-sentrix-heatmap')||'element'});}
var sentrixClsValue=0;try{if('PerformanceObserver' in window){var clsObserver=new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput)sentrixClsValue+=entry.value||0;});});clsObserver.observe({type:'layout-shift',buffered:true});}}catch(_){}
function capturePerformance(){try{var nav=performance.getEntriesByType('navigation')[0];if(!nav)return;var lcp=0;try{var entries=performance.getEntriesByType('largest-contentful-paint');if(entries.length)lcp=entries[entries.length-1].startTime;}catch(_){}sendExtra('sentrixTrackPerformance',{siteId:siteId,host:location.hostname.toLowerCase(),path:location.pathname.slice(0,300),loadMs:Math.round(nav.loadEventEnd||nav.duration||0),domReadyMs:Math.round(nav.domContentLoadedEventEnd||0),lcpMs:Math.round(lcp),cls:Number(sentrixClsValue.toFixed(4)),deviceType:/mobile|android|iphone/i.test(navigator.userAgent)?'mobile':'desktop'});}catch(e){report('Performance metrics unavailable',e);}}
document.addEventListener('click',function(event){var target=event.target&&event.target.closest?event.target.closest('a,button,[role=button],input,textarea,select,[contenteditable=true]'):null;if(target&&target.matches('input,textarea,select,[contenteditable=true]'))return;if(target&&document.body)sendHeatmap(document.body,event);var step=event.target&&event.target.closest?event.target.closest('[data-sentrix-journey]'):null;if(step)sendJourney(step.getAttribute('data-sentrix-journey'));var node=event.target&&event.target.closest?event.target.closest('[data-sentrix-track],[data-sentrix-conversion]'):null;if(node){if(node.hasAttribute('data-sentrix-conversion'))sendInteraction('conversion',node.getAttribute('data-sentrix-conversion'));else sendInteraction('click',node.getAttribute('data-sentrix-track'));}},{capture:true,passive:true});
function send(){
  sendJourney('page:'+location.pathname.slice(0,50));
  var payload={
    siteId:siteId,
    host:location.hostname.toLowerCase(),
    path:location.pathname.slice(0,500),
    referrer:document.referrer.slice(0,500),
    visitorId:visitor()
  };
  sendAttempt(payload,1);
}
if(document.readyState==='complete'||document.readyState==='interactive'){send();setTimeout(capturePerformance,1200);}
else document.addEventListener('DOMContentLoaded',function(){send();window.addEventListener('load',function(){setTimeout(capturePerformance,1200);},{once:true});},{once:true});
})();