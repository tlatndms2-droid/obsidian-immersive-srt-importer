import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('일시정지 영상 재생 후 실제 다운로드 클래스 항목을 선택한다',async()=>{
  const actions=[];
  const video={readyState:4,muted:false,async play(){actions.push('play');},pause(){actions.push('pause');}};
  // Observed vendor DOM: download item also has subtitle-type="enable".
  const download={click(){actions.push('download');}};
  const root={querySelector(selector){
    if(selector==='.setting-item-download:not(.disabled):not(.download-subtitle-loading)')return download;
    if(selector==='.imt-quick-subtitle-button-icon')return {click(){actions.push('menu');}};
    return null;
  }};
  const control={shadowRoot:root,getAttribute(){return 'true';}};
  const captions={shadowRoot:{querySelector(selector){return selector==='.target-cue'?{textContent:'번역'}:{};}}};
  const document={querySelector(selector){return {'video':video,'#immersive-translatequick-button':control,'#immersive-translate-caption-window':captions}[selector];}};
  const chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
    if(m.type==='claim-video')return {id:'test'};
    assert.equal(m.type,'video-ready');assert.equal(m.mode,'dual');return {ok:true};
  }}};
  vm.runInNewContext(await readFile('chrome-extension/youtube.mjs','utf8'),{chrome,document,Date,setTimeout});
  await new Promise(r=>setImmediate(r));
  assert.equal(video.muted,true);
  assert.deepEqual(actions,['play','pause','menu','download']);
});

for(const scenario of ['ready','timeout','loading','cancel'])test('AI 자막 처리: '+scenario,async()=>{
 const actions=[],messages=[];let now=0,requested=0,ready=false,cancel;
 const ai={classList:{contains(c){return scenario==='loading'&&c==='ai-subtitle-loading';}},getAttribute(){return 'false';},click(){requested++;if(scenario==='ready')ready=true;}};
 const root={querySelector(s){if(s==='.setting-item-aiSubtitle')return ai;if(s.startsWith('.setting-item-download'))return {click(){actions.push('download');}};return null;}};
 const document={querySelector(s){if(s==='#immersive-translatequick-button')return {shadowRoot:root,getAttribute(){return 'true';}};if(s==='#immersive-translate-caption-window')return {shadowRoot:{querySelector(s){return s==='.target-cue'&&ready?{textContent:'한국어'}:null;}}};return null;}};
 const chrome={runtime:{onMessage:{addListener(fn){cancel=fn;}},async sendMessage(m){messages.push(m);if(m.type==='claim-video')return {id:'test'};if(m.type==='video-progress'&&scenario==='cancel')cancel({type:'cancel',id:'test'});return {ok:true};}}};
 vm.runInNewContext(await readFile('chrome-extension/youtube.mjs','utf8'),{chrome,document,Date:{now:()=>now},setTimeout(fn){now+=180000;queueMicrotask(fn);}});
 await new Promise(r=>setImmediate(r));
 assert.equal(requested,scenario==='loading'||scenario==='cancel'?0:1);
 if(scenario==='ready'){assert.deepEqual(actions,['download']);assert.equal(messages.find(m=>m.type==='video-ready').mode,'translation');}
 if(scenario==='timeout'||scenario==='loading')assert.equal(messages.at(-1).type,'failure');
 if(scenario==='cancel')assert.equal(messages.some(m=>m.type==='failure'||m.type==='video-ready'),false);
});
