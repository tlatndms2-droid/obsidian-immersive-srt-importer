import { videoUrl, safeFilename, validateSrt } from '../src/shared.mjs';
let socket, heartbeat, job, isConnecting = false;
let status = '연결 안 됨';
async function setStatus(s) { status=s; await chrome.storage.session.set({status:s}); }
function send(m) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); }
function progress(stage){if(job)send({type:'progress',id:job.id,url:job.url,stage});}
async function cleanup(success) {
  if (!job) return;
  const old=job; job=null; clearTimeout(old.timer);
  for(const id of [old.videoTab,old.resultTab]) if(id) {
    await chrome.tabs.sendMessage(id,{type:'cancel',id:old.id}).catch(()=>{});
    if(success) {
      const tab=await chrome.tabs.get(id).catch(()=>null);
      if(tab && (videoUrl(tab.url)===old.url || resultSource(tab.url)===old.url)) await chrome.tabs.remove(id).catch(()=>{});
    }
  }
}
async function fail(reason) {
  if (!job) return;
  send({type:'error',id:job.id,url:job.url,reason}); await cleanup(false); await setStatus(reason);
}
function resultSource(raw) {
  try {const u=new URL(raw); return u.origin==='https://app.immersivetranslate.com' && u.pathname==='/download-subtitle/' ? videoUrl(u.searchParams.get('source_url')) : null;} catch{return null;}
}
async function connect() {
  if (isConnecting || socket?.readyState===WebSocket.OPEN || socket?.readyState===WebSocket.CONNECTING) return;
  isConnecting=true;
  const {pair}=await chrome.storage.local.get('pair');
  if(!pair) {isConnecting=false; return;}
  const [port,token]=pair.split(':');
  const ws=new WebSocket(`ws://127.0.0.1:${port}/bridge`); socket=ws;
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token}));
  ws.onerror=()=>{};
  ws.onclose=async()=>{if(socket!==ws)return; clearInterval(heartbeat); isConnecting=false; socket=null; if(job) await cleanup(false); await setStatus('연결할 수 없습니다. Obsidian을 열고 연결 코드를 확인해 주세요.');};
  ws.onmessage=async e=>{
    let m; try{m=JSON.parse(e.data);}catch{return;}
    if(m.type==='ready'){isConnecting=false; await setStatus('Obsidian에 연결됨'); clearInterval(heartbeat); heartbeat=setInterval(()=>send({type:'ping'}),20000);}
    if(m.type==='job') {
      if(job || videoUrl(m.url)!==m.url || typeof m.id!=='string' || !['original','translation','dual'].includes(m.mode)) { send({type:'error',id:m.id,url:m.url}); return; }
      job={id:m.id,url:m.url,phase:'video',mode:m.mode};
      const current=job;
      current.timer=setTimeout(()=>void fail('자막 처리 시간이 초과되었습니다. 자동 재시도하지 않습니다.'),590000);
      await setStatus('YouTube에서 Immersive Translate 자막을 준비하고 있습니다.');
      try {
        // Chrome can defer playback in a never-visible tab even when muted.
        const tab=await chrome.tabs.create({url:m.url,active:true});
        if(job!==current) return;
        current.videoTab=tab.id; current.windowId=tab.windowId; current.newTabs=new Set(); await chrome.tabs.update(tab.id,{muted:true});
      } catch {await fail('YouTube 시험 탭을 열지 못했습니다.');}
    }
    if(m.type==='complete' && job?.id===m.id) {await cleanup(m.status==='saved'||m.status==='cancelled'); await setStatus(m.status==='saved'?'SRT 저장 완료':m.status==='cancelled'?'저장을 취소했습니다.':'Obsidian에서 SRT를 저장하지 못했습니다.');}
    if(m.type==='cancel' && job?.id===m.id) {await cleanup(false); await setStatus('작업이 취소되었습니다.');}
  };
}
chrome.alarms.create('connection',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='connection') void connect();});
chrome.runtime.onStartup.addListener(()=>void connect());
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  const popup=!sender.tab && sender.url===chrome.runtime.getURL('popup.html');
  if(popup && m.type==='status') {reply({status}); return;}
  if(popup && m.type==='pair') {
    if(!/^\d{1,5}:[a-f0-9]{64}$/.test(m.code||'') || +m.code.split(':')[0]<1 || +m.code.split(':')[0]>65535) {reply({ok:false}); return;}
    (async()=>{await cleanup(false); socket?.close(); socket=null; isConnecting=false; await chrome.storage.local.set({pair:m.code}); await connect(); reply({ok:true});})(); return true;
  }
  if(popup && m.type==='unpair') {(async()=>{await chrome.storage.local.remove('pair'); await cleanup(false); socket?.close(); await setStatus('연결 안 됨'); reply({ok:true});})();return true;}
  if(!sender.tab || sender.frameId!==0 || !job) {reply(null);return;}
  if(m.type==='claim-video' && sender.tab.id===job.videoTab && videoUrl(sender.url)===job.url && job.phase==='video') {progress('preparing');reply({id:job.id,url:job.url,mode:job.mode});return;}
  if(m.type==='video-ready' && m.id===job.id && sender.tab.id===job.videoTab && videoUrl(sender.url)===job.url && job.phase==='video' && m.mode===job.mode) {
    job.mode=m.mode; job.phase='result'; progress('result');reply({ok:true}); void setStatus('공식 자막 다운로드 페이지를 준비하고 있습니다.'); return;
  }
  if(m.type==='claim-result' && job.phase==='result' && resultSource(sender.url)===job.url && (!job.resultTab || job.resultTab===sender.tab.id) && job.newTabs?.has(sender.tab.id) && sender.tab.windowId===job.windowId) {
    job.resultTab=sender.tab.id; reply({id:job.id,url:job.url,mode:job.mode}); return;
  }
  if(m.type==='result-progress' && m.id===job.id && sender.tab.id===job.resultTab && resultSource(sender.url)===job.url && job.phase==='result' && ['translation','exporting'].includes(m.stage)) {progress(m.stage);reply({ok:true});return;}
  if(m.type==='srt' && sender.tab.id===job.resultTab && resultSource(sender.url)===job.url && job.phase==='result' && m.id===job.id) {
    try {safeFilename(m.filename); validateSrt(m.text); job.phase='saving'; send({type:'result',id:job.id,url:job.url,filename:m.filename,text:m.text}); void setStatus('Obsidian에 자막을 저장하고 있습니다.'); reply({ok:true});} catch {void fail('정상적인 SRT 파일을 받지 못했습니다.');reply({ok:false});} return;
  }
  if(m.type==='failure' && m.id===job.id && [job.videoTab,job.resultTab].includes(sender.tab.id)) {void fail(typeof m.reason==='string'?m.reason.slice(0,160):'자막 처리 실패');reply({ok:true});return;}
  reply(null);
});
chrome.tabs.onRemoved.addListener(id=>{if(job && [job.videoTab,job.resultTab].includes(id)) void fail('작업 중인 Chrome 탭이 닫혔습니다.');});
// Immersive Translate 1.33.1 opens the result with tabs.create({url}) and no openerTabId.
// Only accept a newly created tab in this job's window with the exact source URL.
chrome.tabs.onCreated.addListener(tab=>{if(job?.phase==='result' && tab.windowId===job.windowId) job.newTabs?.add(tab.id);});
void connect();
