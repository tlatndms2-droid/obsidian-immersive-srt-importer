import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_BYTES, videoUrl, safeFilename, validateSrt } from './shared.mjs';
import { PROGRESS } from './progress.mjs';

export class Bridge {
  constructor({ token, onResult, onStatus, timeoutMs = 600000 }) {
    Object.assign(this, { token, onResult, onStatus, timeoutMs });
    this.peer = null; this.pending = null; this.closed = false;
  }
  async start(port = 0) {
    this.http = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES * 2 });
    this.http.on('upgrade', (req, socket, head) => {
      if (req.url !== '/bridge' || !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || '') || req.headers.host !== `127.0.0.1:${this.port}`) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, ws => this.accept(ws));
    });
    await new Promise((resolve, reject) => { this.http.once('error', reject); this.http.listen(port, '127.0.0.1', resolve); });
    this.port = this.http.address().port;
    this.http.on('error', () => this.onStatus('연결 서버 오류'));
    return this.port;
  }
  accept(ws) {
    let authenticated = false;
    const timer = setTimeout(() => ws.close(1008), 3000);
    ws.on('error', () => {});
    ws.on('message', async raw => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { ws.close(1008); return; }
      if (!m || typeof m !== 'object' || Array.isArray(m)) { ws.close(1008); return; }
      if (!authenticated) {
        const got = Buffer.from(typeof m.token === 'string' ? m.token : '');
        const wanted = Buffer.from(this.token);
        if (m.type !== 'hello' || got.length !== wanted.length || !timingSafeEqual(got, wanted) || this.peer || this.closed) { ws.close(1008); return; }
        clearTimeout(timer); authenticated = true; this.peer = ws;
        ws.send(JSON.stringify({ type: 'ready' })); this.onStatus('연결됨'); return;
      }
      if (m.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
      const p = this.pending;
      if (!p || m.id !== p.id || p.finishing || videoUrl(m.url) !== p.url) return;
      if (m.type === 'progress') {
        if(Object.hasOwn(PROGRESS,m.stage)) {
          const rank=Object.keys(PROGRESS).indexOf(m.stage);
          if(rank>p.progressRank){p.progressRank=rank;p.onProgress?.(PROGRESS[m.stage]);}
        }
        return;
      }
      if (m.type === 'error') { this.finish(Error(typeof m.reason==='string' && m.reason.trim() ? m.reason.slice(0,160) : '자막을 가져오지 못했습니다. Chrome 확장의 진행 상태를 확인해 주세요.')); return; }
      if (m.type !== 'result') return;
      p.finishing = true;
      clearTimeout(p.timer);
      try {
        safeFilename(m.filename); validateSrt(m.text);
        p.onProgress?.(PROGRESS.saving);
        const result = await this.onResult(m.filename, m.text);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'complete', id: p.id, status: result.status }));
        this.finish(null, result);
      } catch (e) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'complete', id: p.id, status: 'error' }));
        this.finish(e);
      }
    });
    ws.on('close', () => { clearTimeout(timer); if (this.peer === ws) { this.peer = null; this.onStatus('연결 안 됨'); if (!this.pending?.finishing) this.finish(Error('Chrome 연결이 끊겼습니다.')); } });
  }
  run(input, onProgress, mode='dual') {
    if(!['original','translation','dual'].includes(mode))return Promise.reject(Error('자막 구성을 선택해 주세요.'));
    const url = videoUrl(input);
    if (!url) return Promise.reject(Error('지원하는 YouTube 영상이 아닙니다.'));
    if (this.pending) return Promise.reject(Error('진행 중인 자막 가져오기가 있습니다.'));
    if (!this.peer || this.peer.readyState !== WebSocket.OPEN) return Promise.reject(Error('설정에서 Chrome 확장을 먼저 연결해 주세요.'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.peer?.send(JSON.stringify({type:'cancel', id})); this.finish(Error('자막 처리 시간이 초과되었습니다. 자동 재시도하지 않습니다.')); }, this.timeoutMs);
      this.pending = { id, url, timer, resolve, reject, finishing: false, onProgress, progressRank:0 };
      onProgress?.(PROGRESS.opening);
      this.peer.send(JSON.stringify({ type: 'job', id, url, mode }));
    });
  }
  finish(error, result) {
    const p = this.pending; if (!p) return;
    clearTimeout(p.timer); this.pending = null;
    error ? p.reject(error) : p.resolve(result);
  }
  async stop() {
    this.closed = true;
    this.finish(Error('플러그인 연결이 종료되었습니다.'));
    for (const client of this.wss?.clients || []) client.terminate();
    await new Promise(resolve => this.wss ? this.wss.close(resolve) : resolve());
    await new Promise(resolve => this.http ? this.http.close(resolve) : resolve());
  }
}
