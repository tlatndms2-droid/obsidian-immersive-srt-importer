let active, stopped=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
chrome.runtime.onMessage.addListener(m=>{if(m.type==='cancel' && m.id===active?.id) stopped=true;});
async function run() {
  for(let i=0;i<30;i++) { active=await chrome.runtime.sendMessage({type:'claim-video'}); if(active) break; await sleep(1000); }
  if(!active) return;
  // Task-owned tabs may be paused by browser autoplay or other video extensions.
  let playbackAttempted=false, aiRequested=false;
  const deadline=Date.now()+540000;
  while(!stopped && Date.now()<deadline) {
    const video=document.querySelector('video');
    if(!playbackAttempted && video?.readyState>=2) {
      playbackAttempted=true;
      video.muted=true;
      // A play promise can remain pending while Chrome defers playback.
      void video.play().catch(()=>{});
    }
    const control=document.querySelector('#immersive-translatequick-button');
    const root=control?.shadowRoot;
    const captions=document.querySelector('#immersive-translate-caption-window')?.shadowRoot;
    const target=captions?.querySelector('.target-cue');
    const source=captions?.querySelector('.source-cue');
    if(stopped)return;
    const ai=root?.querySelector('.setting-item-aiSubtitle');
    if(!target?.textContent?.trim() && !aiRequested && ai &&
      !ai.classList.contains('ai-subtitle-used') &&
      !ai.classList.contains('ai-subtitle-loading') &&
      !ai.classList.contains('disabled') && ai.getAttribute('aria-disabled')!=='true') {
      // One request per job. Never automatically retry or accept vendor dialogs.
      aiRequested=true;
      await chrome.runtime.sendMessage({type:'video-progress',id:active.id,stage:'requesting-ai'});
      if(stopped)return;
      ai.click();
    }
    if(root && control.getAttribute('data-immersive-translate-has-subtitle')==='true' && target?.textContent?.trim()) {
      const mode=source ? 'dual' : 'translation';
      const download=root.querySelector('.setting-item-download:not(.disabled):not(.download-subtitle-loading)');
      if(!download) {await sleep(1000);continue;}
      const ready=await chrome.runtime.sendMessage({type:'video-ready',id:active.id,mode});
      if(!ready?.ok || stopped) return;
      document.querySelector('video')?.pause();
      root.querySelector('.imt-quick-subtitle-button-icon')?.click();
      download.click(); return;
    }
    await sleep(1000);
  }
  if(!stopped) await chrome.runtime.sendMessage({type:'failure',id:active.id,reason:aiRequested?'AI 자막 준비를 시간 안에 완료하지 못했습니다. Chrome의 생성 상태와 확인 안내를 살펴봐 주세요. 자동으로 다시 요청하지 않습니다.':'현재 설정에서 자막을 준비하지 못했습니다. Chrome에서 해당 영상의 Immersive Translate 자막을 확인해 주세요.'});
}
void run().catch(()=>{if(active&&!stopped)void chrome.runtime.sendMessage({type:'failure',id:active.id,reason:'자막 준비 중 오류가 발생했습니다. Chrome의 Immersive Translate 안내를 확인해 주세요.'});});
