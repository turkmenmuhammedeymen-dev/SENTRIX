(function(){
'use strict';
var script=document.currentScript;if(!script)return;
var siteId=script.getAttribute('data-site-id');if(!siteId)return;
var endpoint='https://parseapi.back4app.com/functions/sentrixTrackPageView';
var appId='33iVkF8qI8RLYO55iSJ7EUkkj4VwTVBOWznZU8tn';
var jsKey='5GITBYvsaM77CaqQWRGpqo8Bwe6OTdKcD0IzohgF';
function visitor(){try{var k='sentrix_session_id',v=sessionStorage.getItem(k);if(!v){v=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));sessionStorage.setItem(k,v);}return v;}catch(e){return 'ephemeral-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}}
function send(){var payload={siteId:siteId,host:location.hostname.toLowerCase(),path:location.pathname.slice(0,500),referrer:document.referrer.slice(0,500),visitorId:visitor()};try{fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Parse-Application-Id':appId,'X-Parse-Javascript-Key':jsKey},body:JSON.stringify({siteId:payload.siteId,host:payload.host,path:payload.path,referrer:payload.referrer,visitorId:payload.visitorId}),keepalive:true,credentials:'omit'}).catch(function(){});}catch(e){}}
if(document.readyState==='complete'||document.readyState==='interactive')send();else document.addEventListener('DOMContentLoaded',send,{once:true});
})();