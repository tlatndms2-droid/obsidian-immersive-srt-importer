import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const scenario of ['ready','off','delayed','hidden','unavailable','loading','cancel','activation-failed'])test('일반 자막 활성화와 준비 대기: '+scenario,async()=>{
 const actions=[],messages=[];let now=0,cancel,enabled=!['off','activation-failed'].includes(scenario),tick=0;
 const toggle={getAttribute(){return String(enabled);},click(){actions.push('enable');if(scenario!=='activation-failed')enabled=true;}};
 const download={getAttribute(){return 'false';},click(){actions.push('download');}};
 const root={querySelector(s){if(s==='.setting-item-aiSubtitle')return {click(){assert.fail('AI 요청 금지');}};if(s==='.setting-item-enable')return toggle;if(s.startsWith('.setting-item-download'))return scenario==='loading'?null:download;return null;}};
 const cue={textContent:'번역',getClientRects(){return scenario==='hidden'?[]:[{}];}};
 const video={readyState:4,play:async()=>{},pause(){},muted:false};
 const document={querySelector(s){if(s==='video')return video;if(s==='#immersive-translatequick-button')return {shadowRoot:root,getAttribute(){return scenario==='unavailable'?'false':'true';}};if(s==='#immersive-translate-caption-window')return {shadowRoot:{querySelector(){return scenario==='delayed'&&tick<2?null:cue;}}};return null;}};
 const chrome={runtime:{onMessage:{addListener(fn){cancel=fn;}},async sendMessage(m){messages.push(m);if(m.type==='claim-video')return {id:'test',mode:'dual'};if(m.type==='video-ready'&&scenario==='cancel')cancel({type:'cancel',id:'test'});return {ok:true};}}};
 vm.runInNewContext(await readFile('chrome-extension/youtube.mjs','utf8'),{chrome,document,Date:{now:()=>now},setTimeout(fn){now+=100000;tick++;queueMicrotask(fn);}});
 await new Promise(r=>setImmediate(r));
 if(['ready','delayed','off'].includes(scenario)){assert.deepEqual(actions,scenario==='off'?['enable','download']:['download']);assert.equal(messages.find(m=>m.type==='video-ready').mode,'dual');}
 if(['unavailable','loading','hidden','activation-failed'].includes(scenario)){assert.equal(actions.includes('download'),false);assert.equal(messages.at(-1).type,'failure');}
 if(scenario==='activation-failed')assert.deepEqual(actions,['enable']);
 if(scenario==='cancel'){assert.deepEqual(actions,[]);assert.equal(messages.some(m=>m.type==='failure'),false);}
 if(scenario==='delayed')assert.ok(tick>=2);
});
