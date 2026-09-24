const status = document.querySelector('#status');
async function refresh() { const r = await chrome.runtime.sendMessage({type:'status'}); status.textContent = r.status; }
document.querySelector('#connect').onclick = async () => {
  const code = document.querySelector('#code').value.trim();
  if (!/^\d{1,5}:[a-f0-9]{64}$/.test(code) || Number(code.split(':')[0]) < 1 || Number(code.split(':')[0]) > 65535) { status.textContent='Obsidian에서 복사한 연결 코드를 확인해 주세요.'; return; }
  status.textContent='연결 중…';
  await chrome.runtime.sendMessage({type:'pair',code}); document.querySelector('#code').value='';
  await refresh();
};
document.querySelector('#disconnect').onclick=async()=>{await chrome.runtime.sendMessage({type:'unpair'}); await refresh();};
chrome.storage.onChanged.addListener(refresh); void refresh();
