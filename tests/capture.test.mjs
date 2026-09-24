import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('실제 Blob 바이트를 보존하고 요청한 SRT만 가로채며 원래 동작을 복원',async()=>{
  let normalDownloads=0;const listeners=new Set();const events=[];
  class Anchor {click(){normalDownloads++;}dispatchEvent(){normalDownloads++;return true;}}
  const window={addEventListener:(_t,fn)=>listeners.add(fn),postMessage:data=>{events.push(data);queueMicrotask(()=>{for(const fn of listeners)fn({source:window,origin:'https://app.immersivetranslate.com',data});});}};
  vm.runInNewContext(await readFile('chrome-extension/capture.mjs','utf8'),{HTMLAnchorElement:Anchor,window,location:{origin:'https://app.immersivetranslate.com'},fetch,TextDecoder,setTimeout,clearTimeout,URL});
  const text='\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\nOriginal\r\n한글\r\n';
  const blob=new Blob([text],{type:'text/plain'});const href=URL.createObjectURL(blob);
  try{
    const a=new Anchor();a.download='제목.srt';a.href=href;a.click();assert.equal(normalDownloads,1);
    window.postMessage({channel:'immersive-srt-arm',nonce:'a'.repeat(32)});
    await new Promise(r=>setImmediate(r));
    a.dispatchEvent({type:'click'});
    for(let i=0;i<20&&!events.some(e=>e.channel==='immersive-srt-captured');i++)await new Promise(r=>setTimeout(r,10));
    const received=events.find(e=>e.channel==='immersive-srt-captured');
    assert.equal(received?.filename,'제목.srt');assert.equal(received?.text,text);assert.equal(normalDownloads,1);
    a.click();assert.equal(normalDownloads,2);
  }finally{URL.revokeObjectURL(href);}
});
