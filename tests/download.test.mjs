import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile('chrome-extension/download.mjs','utf8');
test('연결된 작업 탭에서만 공급자 자동 다운로드를 끄고 원본 주소를 유지한다',async()=>{
 const changes=[];
 const href='https://app.immersivetranslate.com/download-subtitle/?source_url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DckG9X_sShjM';
 const chrome={runtime:{onMessage:{addListener(){}},async sendMessage(){return {id:'job',mode:'dual'};}}};
 vm.runInNewContext(code,{chrome,URL,location:{href,replace:u=>changes.push(u)},document:{},setTimeout});
 await new Promise(r=>setImmediate(r));
 assert.equal(changes.length,1);
 const u=new URL(changes[0]);assert.equal(u.searchParams.get('autoDownload'),'false');
 assert.equal(u.searchParams.get('source_url'),new URL(href).searchParams.get('source_url'));
});
test('사용자가 직접 연 다운로드 페이지는 변경하지 않는다',async()=>{
 let changes=0;
 const chrome={runtime:{onMessage:{addListener(){}},async sendMessage(){return null;}}};
 vm.runInNewContext(code,{chrome,location:{replace(){changes++;}},setTimeout:fn=>queueMicrotask(fn)});
 await new Promise(r=>setImmediate(r));assert.equal(changes,0);
});
