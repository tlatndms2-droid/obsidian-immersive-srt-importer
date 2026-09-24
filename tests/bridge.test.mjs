import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Bridge } from '../src/bridge.mjs';
const token='a'.repeat(64), url='https://www.youtube.com/watch?v=EWX0bbGAd0k';
const origin='chrome-extension://'+'b'.repeat(32);
const text='1\n00:00:00,000 --> 00:00:01,000\nHello\n안녕\n';
async function peer(b,secret=token){const ws=new WebSocket(`ws://127.0.0.1:${b.port}/bridge`,{origin}); await once(ws,'open'); const ready=once(ws,secret===token?'message':'close'); ws.send(JSON.stringify({type:'hello',token:secret}));await ready;return ws;}
test('잘못된 연결 코드 거부, 작업별 결과 연결, 중복 요청 차단',async()=>{
  let result;
  const b=new Bridge({token,onStatus:()=>{},onResult:async(filename,body)=>{result={filename,body};return {status:'saved'};}});
  await b.start();
  try{
    await peer(b,'wrong'); assert.equal(b.peer,null);
    const ws=await peer(b);
    const incoming=once(ws,'message');const done=b.run(url);const [raw]=await incoming;const job=JSON.parse(raw);
    await assert.rejects(b.run(url),/진행 중/);
    ws.send(JSON.stringify({type:'result',id:'wrong',url,filename:'test.srt',text}));
    const complete=once(ws,'message');ws.send(JSON.stringify({type:'result',id:job.id,url,filename:'test.srt',text}));
    assert.equal((await done).status,'saved');assert.equal(JSON.parse((await complete)[0]).type,'complete');
    assert.deepEqual(result,{filename:'test.srt',body:text});
    ws.close();await once(ws,'close');
  }finally{await b.stop();}
});
test('시간 초과 후 재시도 없이 종료',async()=>{
  const b=new Bridge({token,onStatus:()=>{},onResult:()=>assert.fail(),timeoutMs:30});await b.start();
  try{await peer(b);await assert.rejects(b.run(url),/초과/);assert.equal(b.pending,null);}finally{await b.stop();}
});
test('현재 작업의 진행만 순서대로 표시하고 오류 이유를 전달한다',async()=>{
 const states=[];const b=new Bridge({token,onStatus:()=>{},onResult:()=>assert.fail()});await b.start();
 try{
  const ws=await peer(b);const incoming=once(ws,'message');const done=b.run(url,s=>states.push(s));
  const rejected=assert.rejects(done,/탭이 닫혔습니다/);const job=JSON.parse((await incoming)[0]);
  for(const [id,stage] of [['wrong','ai'],[job.id,'invalid'],[job.id,'translation'],[job.id,'preparing'],[job.id,'translation'],[job.id,'exporting']])ws.send(JSON.stringify({type:'progress',id,url,stage}));
  ws.send(JSON.stringify({type:'error',id:job.id,url,reason:'작업 중인 Chrome 탭이 닫혔습니다.'}));await rejected;
  assert.deepEqual(states,['Chrome에서 영상을 여는 중…','자막 번역 완료를 기다리는 중…','번역 완료. SRT 파일을 받는 중…']);
 }finally{await b.stop();}
});
