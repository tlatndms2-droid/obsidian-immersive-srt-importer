import { Plugin, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import { randomBytes } from 'node:crypto';
import { Bridge } from './bridge.mjs';
import { saveSrt, storageFolder } from './storage.mjs';
import { videoUrl } from './shared.mjs';

class SubtitleModeModal extends Modal {
  constructor(app, resolve) { super(app); this.resolve=resolve; this.value=null; }
  onOpen() {
    this.titleEl.setText('가져올 자막 선택');
    for(const [value,name,desc] of [['original','원문만','영상의 원래 언어 자막'],['translation','번역만','현재 설정된 번역 언어의 자막'],['dual','원문+번역','원문과 번역을 함께 저장']]) {
      new Setting(this.contentEl).setName(name).setDesc(desc).addButton(b=>b.setButtonText(name).onClick(()=>{this.value=value;this.close();}));
    }
    new Setting(this.contentEl).addButton(b=>b.setButtonText('취소').onClick(()=>this.close()));
  }
  onClose() { this.resolve(this.value); this.contentEl.empty(); }
}
class OverwriteModal extends Modal {
  constructor(app, name, resolve) { super(app); this.name = name; this.resolve = resolve; this.accepted = false; }
  onOpen() {
    this.titleEl.setText('같은 SRT 파일이 있습니다');
    this.contentEl.createEl('p', { text: this.name });
    this.contentEl.createEl('p', { text: '기존 파일을 새 자막으로 바꿀까요?' });
    new Setting(this.contentEl).addButton(b => b.setButtonText('취소').onClick(() => this.close()))
      .addButton(b => b.setButtonText('덮어쓰기').setWarning().onClick(() => { this.accepted = true; this.close(); }));
    this.contentEl.querySelector('button')?.focus();
  }
  onClose() { this.resolve(this.accepted); this.contentEl.empty(); }
}
class Settings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const p = this.plugin; this.containerEl.empty();
    this.containerEl.createEl('h2', { text: 'Immersive Translate' });
    let folder=p.data.outputFolder||'SRT',field;
    new Setting(this.containerEl).setName('자막 저장 폴더').setDesc('Vault 안의 폴더입니다. 기본값: SRT. 예: 자료/자막. 저장 후 다음 가져오기부터 적용되며 기존 파일은 이동하지 않습니다.')
      .addText(t=>{field=t;t.setPlaceholder('SRT').setValue(folder).onChange(v=>{folder=v;});})
      .addButton(b=>b.setButtonText('저장').onClick(async()=>{
        const before=p.data.outputFolder;
        try{const value=storageFolder(folder);p.data.outputFolder=value;await p.saveData(p.data);field.setValue(value);new Notice(`자막 저장 폴더: ${value}`);}
        catch(e){p.data.outputFolder=before;new Notice(e.message||'설정을 저장하지 못했습니다.');}
      }));
    this.status = this.containerEl.createEl('p', { text: `Chrome: ${p.status}`, cls: 'immersive-srt-status' });
    this.containerEl.createEl('p', { text: '현재 Chrome의 Immersive Translate 로그인·번역 설정을 그대로 사용합니다. 연결 코드는 다른 사람에게 공유하지 마세요.' });
    new Setting(this.containerEl).setName('Chrome 연결 코드').setDesc('연결용 Chrome 확장을 열고 코드를 붙여넣은 뒤 연결을 누르세요.')
      .addButton(b => b.setButtonText('연결 코드 복사').onClick(async () => {
        if (!p.bridge?.port) return new Notice('연결 서버가 준비되지 않았습니다.');
        await navigator.clipboard.writeText(`${p.bridge.port}:${p.data.token}`); new Notice('연결 코드를 복사했습니다.');
      }));
    new Setting(this.containerEl).setName('연결 해제').setDesc('기존 Chrome 연결 코드를 폐기합니다. 저장된 SRT는 유지됩니다.')
      .addButton(b => b.setButtonText('연결 해제').onClick(async () => { await p.restartBridge(true); this.display(); }));
  }
}
export default class ImmersiveSrt extends Plugin {
  async onload() {
    this.status = '연결 안 됨'; this.activeModals = new Set();
    this.data = await this.loadData() || {};
    if (!/^[a-f0-9]{64}$/.test(this.data.token || '')) this.data.token = randomBytes(32).toString('hex');
    this.settings = new Settings(this.app, this); this.addSettingTab(this.settings);
    await this.restartBridge(false);
    this.registerEvent(this.app.workspace.on('canvas:node-menu', (menu, node) => {
      const data = node?.getData?.();
      const url = data?.type === 'link' ? videoUrl(data.url) : null;
      if (url) menu.addItem(item => item.setTitle('Immersive Translate 자막 가져오기').onClick(() => this.importUrl(url)));
    }));
  }
  async restartBridge(rotate) {
    await this.bridge?.stop();
    if (rotate) this.data.token = randomBytes(32).toString('hex');
    this.status = '연결 안 됨';
    this.bridge = new Bridge({ token: this.data.token,
      onStatus: status => { this.status = status; if (this.settings?.status) this.settings.status.setText(`Chrome: ${status}`); },
      onResult: (name, text) => saveSrt(this.app.vault.adapter.getBasePath(), name, text, filename => new Promise(resolve => {
        this.progressNotice?.setMessage('같은 SRT 파일이 있습니다. 덮어쓰기 여부를 선택해 주세요.');
        const modal = new OverwriteModal(this.app, filename, value => { this.activeModals.delete(modal); if(value)this.progressNotice?.setMessage(`${this.importFolder} 폴더에 저장하는 중…`); resolve(value); });
        this.activeModals.add(modal); modal.open();
      }),this.importFolder||this.data.outputFolder||'SRT')
    });
    try {
      try { await this.bridge.start(this.data.port || 0); }
      catch (e) { if (e.code !== 'EADDRINUSE') throw e; await this.bridge.stop(); this.bridge.closed = false; await this.bridge.start(0); new Notice('연결 포트가 변경되었습니다. Chrome의 연결 코드를 갱신해 주세요.'); }
      this.data.port = this.bridge.port; await this.saveData(this.data);
    } catch { this.status = '연결 서버 시작 실패'; new Notice('Chrome 연결 서버를 시작하지 못했습니다.'); }
  }
  async importUrl(url) {
    if(this.importing){new Notice('진행 중인 자막 가져오기가 있습니다.');return;}
    this.importing=true;
    const mode=await new Promise(resolve=>{
      const modal=new SubtitleModeModal(this.app,value=>{this.activeModals.delete(modal);resolve(value);});
      this.activeModals.add(modal);modal.open();
    });
    if(!mode || this.unloaded){this.importing=false;return;}
    clearTimeout(this.noticeTimer);this.progressNotice?.hide();
    const notice=this.progressNotice=new Notice('자막 가져오기를 시작하는 중…',0);
    try {
      this.importFolder=storageFolder(this.data.outputFolder);
      const result=await this.bridge.run(url,message=>notice.setMessage(message==='SRT 폴더에 저장하는 중…'?`${this.importFolder} 폴더에 저장하는 중…`:message),mode);
      notice.setMessage(result.status==='saved'?`${this.importFolder} 폴더에 저장 완료`:'저장을 취소했습니다. 기존 파일은 유지됩니다.');
    } catch(e){notice.setMessage(e.message || '자막을 가져오지 못했습니다.');}
    finally{this.importing=false;if(!this.unloaded)this.noticeTimer=setTimeout(()=>notice.hide(),8000);}
  }
  onunload() { this.unloaded=true;clearTimeout(this.noticeTimer);this.progressNotice?.hide();for (const modal of this.activeModals) modal.close(); void this.bridge?.stop(); }
}
