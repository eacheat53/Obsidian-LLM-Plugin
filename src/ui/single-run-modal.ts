import { Modal, App, Setting, Notice, TFolder, FuzzySuggestModal } from 'obsidian';
import { GenerationMode } from '../types/api-types';
import ObsidianLLMPlugin from '../main';

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private onChoose: (folder: TFolder) => void;
  constructor(app: App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
  }
  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.app.vault.getRoot();
    folders.push(rootFolder);
    const collect = (f: TFolder) => {
      for (const c of f.children) if (c instanceof TFolder) { folders.push(c); collect(c); }
    };
    collect(rootFolder);
    return folders;
  }
  getItemText(folder: TFolder): string { return folder.path || '/'; }
  onChooseItem(folder: TFolder): void { this.onChoose(folder); }
}

export class SingleRunModal extends Modal {
  private plugin: ObsidianLLMPlugin;
  private generationMode: GenerationMode = 'smart';
  private targetPath: string = '/';
  private targetPathSetting?: Setting;

  constructor(app: App, plugin: ObsidianLLMPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '一键执行（检测→嵌入→打分→插链→打标签）' });

    new Setting(contentEl)
      .setName('模式')
      .setDesc('智能：仅处理新建或内容（HASH_BOUNDARY 上方）变化的笔记；强制：全量处理')
      .addDropdown((dd) => dd
        .addOption('smart', '智能')
        .addOption('force', '强制')
        .setValue(this.generationMode)
        .onChange(v => this.generationMode = v as GenerationMode)
      );

    this.targetPathSetting = new Setting(contentEl)
      .setName('目标路径')
      .setDesc('文件或文件夹路径，"/" 表示整个库')
      .addText(t => t.setPlaceholder('/').setValue(this.targetPath).onChange(v => this.targetPath = v))
      .addButton(b => b.setButtonText('浏览').onClick(() => {
        new FolderSuggestModal(this.app, (folder) => {
          this.targetPath = folder.path || '/';
          const input = this.targetPathSetting?.controlEl.querySelector('input');
          if (input) input.value = this.targetPath;
          new Notice(`📁 已选择：${this.targetPath}`);
        }).open();
      }));

    new Setting(contentEl)
      .addButton(b => b.setCta().setButtonText('执行')
        .onClick(async () => {
          if (!this.targetPath) { new Notice('请输入目标路径'); return; }
          this.close();
          const forceMode = this.generationMode === 'force';
          // 直接调用统一工作流
          await this.plugin.runSinglePipelineWorkflow(this.targetPath, forceMode);
        })
      );
  }

  onClose() { this.contentEl.empty(); }
}
