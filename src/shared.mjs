export const MAX_BYTES = 5 * 1024 * 1024;
export function videoUrl(input) {
  try {
    const u = new URL(input);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    let id;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice(8).replace(/\/$/, '');
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}
export function safeFilename(input) {
  if (typeof input !== 'string' || !/\.srt$/i.test(input)) throw Error('SRT 파일명이 아닙니다.');
  let name = input.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  if (name === '.srt' || name.length > 200) throw Error('이 파일명은 안전하게 저장할 수 없습니다.');
  return name;
}
export function validateSrt(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES || text.includes('\0')) throw Error('SRT 크기 또는 내용이 올바르지 않습니다.');
  const blocks = text.replace(/^\uFEFF/, '').trim().split(/\r?\n(?:[ \t]*\r?\n)+/);
  const stamp = '(\\d{2,}):([0-5]\\d):([0-5]\\d),(\\d{3})';
  const timing = new RegExp(`^${stamp} --> ${stamp}(?:[ \\t]+.*)?$`);
  let hasContent = false;
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const m = lines[1]?.match(timing);
    if (!/^\d+$/.test(lines[0]) || !m) throw Error('정상적인 SRT 자막이 아닙니다.');
    if (lines.slice(2).join('').trim()) hasContent = true;
    const ms = i => Number(m[i]) * 3600000 + Number(m[i + 1]) * 60000 + Number(m[i + 2]) * 1000 + Number(m[i + 3]);
    if (ms(5) < ms(1)) throw Error('SRT 자막 시간이 올바르지 않습니다.');
  }
  if (!hasContent) throw Error('자막 내용이 비어 있습니다.');
  return text;
}
