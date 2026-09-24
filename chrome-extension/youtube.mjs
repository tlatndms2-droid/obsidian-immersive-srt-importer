let active, stopped=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
chrome.runtime.onMessage.addListener(m=>{if(m.type==='cancel' && m.id===active?.id) stopped=true;});
async function run() {
  for(let i=0;i<30;i++) { active=await chrome.runtime.sendMessage({type:'claim-video'}); if(active) break; await sleep(1000); }
  if(!active) return;
  // Task-owned tabs may be paused by browser autoplay or other video extensions.
  let playbackAttempted=false, activationAttempted=false;
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
    if(stopped)return;
    const toggle=root?.querySelector('.setting-item-enable');
    if(toggle?.getAttribute('aria-checked')==='false' && !activationAttempted) {
      activationAttempted=true;
      toggle.click();
      await sleep(1000);
      continue;
    }
    const captions=document.querySelector('#immersive-translate-caption-window')?.shadowRoot;
    const cue=captions?.querySelector('.target-cue');
    // Enabled menu items do not mean the subtitle track has finished loading.
    if(toggle?.getAttribute('aria-checked')!=='true' || !cue?.textContent?.trim() || !cue.getClientRects().length) {
      await sleep(1000);
      continue;
    }
    if(root && control.getAttribute('data-immersive-translate-has-subtitle')==='true') {
      // Preserve the composition selected in Obsidian.
      const mode=active.mode;
      const download=root.querySelector('.setting-item-download:not(.disabled):not(.download-subtitle-loading)');
      if(!download || download.getAttribute('aria-disabled')==='true') {await sleep(1000);continue;}
      const ready=await chrome.runtime.sendMessage({type:'video-ready',id:active.id,mode});
      if(!ready?.ok || stopped) return;
      document.querySelector('video')?.pause();
      root.querySelector('.imt-quick-subtitle-button-icon')?.click();
      download.click(); return;
    }
    await sleep(1000);
  }
  if(!stopped) await chrome.runtime.sendMessage({type:'failure',id:active.id,reason:'현재 설정에서 다운로드 가능한 자막을 찾지 못했습니다. Chrome에서 자막 다운로드 가능 여부를 확인해 주세요. AI 자막은 자동 요청하지 않습니다.'});
}
void run().catch(()=>{if(active&&!stopped)void chrome.runtime.sendMessage({type:'failure',id:active.id,reason:'자막 준비 중 오류가 발생했습니다. Chrome의 Immersive Translate 안내를 확인해 주세요.'});});
