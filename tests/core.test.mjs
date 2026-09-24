import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { videoUrl, safeFilename, validateSrt } from '../src/shared.mjs';
import { saveSrt, storageFolder } from '../src/storage.mjs';
const srt='\uFEFF1\r\n00:00:00,000 --> 00:00:02,100\r\nHello\r\n안녕하세요\r\n';
test('기본 저장 폴더, 중첩 한글 폴더, Vault 외부 경로 차단',async()=>{
  assert.equal(storageFolder(''),'SRT');
  for(const bad of ['../밖','/밖','C:\\temp','자료/../밖','.obsidian','a//b','CON','a\\b'])assert.throws(()=>storageFolder(bad));
  const dir=await mkdtemp(path.join(tmpdir(),'srt-folder-'));
  try{await saveSrt(dir,'시험.srt',srt,()=>true,'자료/자막');assert.equal(await readFile(path.join(dir,'자료/자막/시험.srt'),'utf8'),srt);assert.deepEqual(await readdir(dir),['자료']);}
  finally{await rm(dir,{recursive:true,force:true});}
});
test('YouTube 영상만 허용하고 재생목록만 있는 주소와 위장 호스트 거부',()=>{
  for(const u of ['https://youtu.be/EWX0bbGAd0k','https://youtube.com/shorts/EWX0bbGAd0k','https://www.youtube.com/watch?v=EWX0bbGAd0k&list=PL1']) assert.equal(videoUrl(u),'https://www.youtube.com/watch?v=EWX0bbGAd0k');
  for(const u of ['https://www.youtube.com/playlist?list=PL1','https://youtube.com.evil.test/watch?v=EWX0bbGAd0k','file:///watch?v=EWX0bbGAd0k','https://youtu.be/user/video','https://youtube.com/@channel','https://user@youtube.com/watch?v=EWX0bbGAd0k','https://youtube.com:444/watch?v=EWX0bbGAd0k']) assert.equal(videoUrl(u),null);
});
test('SRT 원문은 BOM·CRLF·한글까지 보존하고 HTML 및 잘못된 시간 거부',()=>{
  assert.equal(validateSrt(srt),srt);
  assert.throws(()=>validateSrt('<html>login</html>'));
  assert.throws(()=>validateSrt('1\n00:00:03,000 --> 00:00:02,000\nwrong'));
  assert.throws(()=>validateSrt('1\n00:00:01,000 --> 00:00:02,000\n'));
});
test('파일명 호환 처리 및 경로 탈출 차단',()=>{
  assert.equal(safeFilename('제목 | 영상.srt'),'제목 _ 영상.srt');
  assert.equal(safeFilename('../../x.srt'),'.._.._x.srt');
  assert.equal(safeFilename('CON.srt'),'_CON.srt');
  assert.throws(()=>safeFilename('subtitle.exe'));
});
test('새 파일·취소·승인·동시 변경 시 기존 데이터 보호',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'srt-test-'));
  try {
    assert.equal((await saveSrt(dir,'한글.srt',srt,()=>assert.fail())).status,'saved');
    const dest=path.join(dir,'SRT','한글.srt');
    assert.equal(await readFile(dest,'utf8'),srt);
    const changed=srt.replace('Hello','Updated');
    assert.equal((await saveSrt(dir,'한글.srt',changed,()=>false)).status,'cancelled');
    assert.equal(await readFile(dest,'utf8'),srt);
    await saveSrt(dir,'한글.srt',changed,()=>true);
    assert.equal(await readFile(dest,'utf8'),changed);
    await assert.rejects(saveSrt(dir,'한글.srt',srt,async()=>{await writeFile(dest,'user edit');return true;}),/변경/);
    assert.equal(await readFile(dest,'utf8'),'user edit');
    await assert.rejects(saveSrt(dir,'bad.srt','not subtitles',()=>true));
    assert.deepEqual(await readdir(path.join(dir,'SRT')),['한글.srt']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
