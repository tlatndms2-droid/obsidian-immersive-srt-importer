let job, stopped=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
chrome.runtime.onMessage.addListener(m=>{if(m.type==='cancel' && m.id===job?.id) stopped=true;});
async function run() {
  for(let i=0;i<30;i++){job=await chrome.runtime.sendMessage({type:'claim-result'});if(job)break;await sleep(1000);}
  if(!job)return;
  // The vendor auto-exports on completion independently of our export action.
  // Disable that per task tab; never change the user's saved vendor preference.
  const taskUrl=new URL(location.href);
  if(taskUrl.searchParams.get('autoDownload')!=='false') {
    taskUrl.searchParams.set('autoDownload','false');
    location.replace(taskUrl.href);
    return;
  }
  const deadline=Date.now()+540000;
  await chrome.runtime.sendMessage({type:'result-progress',id:job.id,stage:'translation'});
  while(!stopped && Date.now()<deadline) {
    if(job.mode==='original' && document.querySelector('table tbody tr')) break;
    if(/번역 완료|Translation completed|Translation complete|翻译完成|翻譯完成/i.test(document.body?.innerText||'')) break;
    await sleep(1000);
  }
  if(stopped)return;
  if(Date.now()>=deadline) throw Error('Immersive Translate 번역 완료를 확인하지 못했습니다.');
  await chrome.runtime.sendMessage({type:'result-progress',id:job.id,stage:'exporting'});
  // The site's export buttons exist inside its responsive menu even when collapsed.
  const labels=job.mode==='original'?/^(원본 자막 내보내기|Export Original|Export Original Subtitles|导出原文|匯出原文)$/i:job.mode==='dual'?/^(수출 이중|이중.*내보내기|Export Bilingual|Export Dual|导出双语|匯出雙語)$/i:/^(번역만 내보내기|Export Translation Only|Export Translation|导出译文|匯出譯文)$/i;
  const buttons=Array.from(document.querySelectorAll('button')).filter(e=>labels.test(e.textContent.trim()));
  if(buttons.length!==1) throw Error('현재 자막 구성에 맞는 내보내기 버튼을 확인하지 못했습니다.');
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  await new Promise((resolve,reject)=>{
    const clean=()=>{clearTimeout(timer);window.removeEventListener('message',listener);window.postMessage({channel:'immersive-srt-disarm',nonce},location.origin);};
    const timer=setTimeout(()=>{clean();reject(Error('SRT 파일을 받지 못했습니다. 내보내기 방식 확인이 필요합니다.'));},18000);
    const listener=async e=>{
      if(e.source!==window || e.origin!==location.origin || e.data?.nonce!==nonce)return;
      if(e.data.channel==='immersive-srt-armed') {if(stopped){clean();resolve();}else buttons[0].click();}
      if(e.data.channel==='immersive-srt-captured') {
        clean();
        if(e.data.error || stopped){reject(Error('SRT 파일을 읽지 못했습니다.'));return;}
        const response=await chrome.runtime.sendMessage({type:'srt',id:job.id,filename:e.data.filename,text:e.data.text});
        response?.ok?resolve():reject(Error('SRT 파일 전달에 실패했습니다.'));
      }
    };
    window.addEventListener('message',listener);
    window.postMessage({channel:'immersive-srt-arm',nonce},location.origin);
  });
}
void run().catch(e=>{if(job&&!stopped) void chrome.runtime.sendMessage({type:'failure',id:job.id,reason:e.message});});
