import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeFilename, validateSrt } from './shared.mjs';

export function storageFolder(value='SRT') {
  if(typeof value!=='string')throw Error('저장 폴더 이름을 확인해 주세요.');
  const folder=value.trim()||'SRT';
  if(folder.length>240 || folder.split('/').some(p=>!p || p.startsWith('.') || /[<>:"\\|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Vault 안의 폴더를 입력해 주세요. 예: SRT 또는 자료/자막');
  return folder;
}
export async function saveSrt(root, rawName, text, confirmOverwrite, folder='SRT') {
  const name = safeFilename(rawName);
  validateSrt(text);
  const vault = await fs.realpath(root);
  let dir=vault;
  for(const part of storageFolder(folder).split('/')) {
    dir=path.join(dir,part);
    try{await fs.mkdir(dir);}catch(e){if(e.code!=='EEXIST')throw e;}
    const stat=await fs.lstat(dir);
    if(!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(await fs.realpath(dir))!==path.resolve(dir))throw Error('저장 폴더가 일반 폴더가 아니거나 다른 위치로 연결되어 있습니다.');
  }
  const target = path.join(dir, name);
  let before = null;
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('저장 대상이 일반 파일이 아닙니다.');
    before = await fs.readFile(target);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (before !== null && !await confirmOverwrite(name)) return { status: 'cancelled' };
  const tmp = path.join(dir, `.immersive-srt-${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(tmp, 'wx');
    try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    if (before !== null) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || !before.equals(await fs.readFile(target))) throw Error('확인 중 기존 파일이 변경되었습니다. 다시 실행해 주세요.');
      // Same-directory rename replaces atomically; a failed replacement preserves the old file.
      await fs.rename(tmp, target);
    } else {
      // Exclusive copy also works on virtual drives without hard-link support.
      // Never replace a file that appeared after the existence check.
      await fs.copyFile(tmp, target, fs.constants.COPYFILE_EXCL);
    }
    return { status: 'saved', name };
  } finally { await fs.unlink(tmp).catch(e => { if (e.code !== 'ENOENT') console.warn('SRT 임시 파일 정리가 필요합니다.'); }); }
}
