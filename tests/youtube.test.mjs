import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const scenario of ['ready','no-cues','unavailable','loading','cancel'])test('기본 자막 다운로드, AI 요청 금지: '+scenario,async()=>{
 const actions=[],messages=[];let now=0,cancel;
 const ai={click(){assert.fail('AI 요청 금지');}};
 const download={getAttribute(){return 'false';},click(){actions.push('download');}};
 const root={querySelector(s){if(s==='.setting-item-aiSubtitle')return ai;if(s.startsWith('.setting-item-download'))return scenario==='loading'?null:download;return null;}};
 const video={readyState:4,play:async()=>{},pause(){},muted:false};
 const document={querySelector(s){if(s==='video')return video;if(s==='#immersive-translatequick-button')return {shadowRoot:root,getAttribute(){return scenario==='unavailable'?'false':'true';}};return null;}};
 const chrome={runtime:{onMessage:{addListener(fn){cancel=fn;}},async sendMessage(m){messages.push(m);if(m.type==='claim-video')return {id:'test',mode:'dual'};if(m.type==='video-ready'&&scenario==='cancel')cancel({type:'cancel',id:'test'});return {ok:true};}}};
 vm.runInNewContext(await readFile('chrome-extension/youtube.mjs','utf8'),{chrome,document,Date:{now:()=>now},setTimeout(fn){now+=180000;queueMicrotask(fn);}});
 await new Promise(r=>setImmediate(r));
 assert.equal(messages.some(m=>m.type==='video-progress'),false);
 if(['ready','no-cues'].includes(scenario)){assert.deepEqual(actions,['download']);assert.equal(messages.find(m=>m.type==='video-ready').mode,'dual');}
 if(['unavailable','loading'].includes(scenario)){assert.deepEqual(actions,[]);assert.equal(messages.at(-1).type,'failure');}
 if(scenario==='cancel'){assert.deepEqual(actions,[]);assert.equal(messages.some(m=>m.type==='failure'),false);}
});
