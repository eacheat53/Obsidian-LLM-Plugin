/**
 * Batch tag modal for AI tag generation with mode selection
 * Includes file/folder preview using Obsidian's built-in APIs
 */

import { Modal, App, Setting, Notice, TFolder, FuzzySuggestModal } from 'obsidian';
import { GenerationMode } from '../types/api-types';
import ObsidianLLMPlugin from '../main';

/**
 * Folder suggest modal for selecting target folder
 */
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private onChoose: (folder: TFolder) => void;

  constructor(app: App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.app.vault.getRoot();

    // Add root folder
    folders.push(rootFolder);

    // Recursively collect all folders
    const collectFolders = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          folders.push(child);
          collectFolders(child);
        }
      }
    };

    collectFolders(rootFolder);
    return folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path || '/';
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

/**
 * Modal for batch AI tag generation
 */
export class BatchTagModal extends Modal {
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

    contentEl.addClass('obsidian-llm-plugin-batch-modal');

    // Title
    contentEl.createEl('h2', { text: 'Batch Insert AI Tags' });

    // Generation Mode dropdown
    new Setting(contentEl)
      .setName('Generation Mode')
      .setDesc('Smart mode skips notes with existing tags, Force mode regenerates all tags')
      .addDropdown(dropdown => dropdown
        .addOption('smart', 'Smart (New Notes Only)')
        .addOption('force', 'Force (Always Regenerate)')
        .setValue(this.generationMode)
        .onChange((value) => {
          this.generationMode = value as GenerationMode;
        })
      );

    // Target File/Folder input with Browse button
    this.targetPathSetting = new Setting(contentEl)
      .setName('Target File/Folder')
      .setDesc('Path to file or folder for tag generation (e.g., "/" for entire vault)')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.targetPath)
        .onChange((value) => {
          this.targetPath = value;
        })
      )
      .addButton(button => button
        .setButtonText('Browse')
        .setTooltip('Browse and preview folders')
        .onClick(() => {
          const folderModal = new FolderSuggestModal(this.app, (folder) => {
            this.targetPath = folder.path || '/';
            // Update the text input value
            const textInput = this.targetPathSetting?.controlEl.querySelector('input');
            if (textInput) {
              textInput.value = this.targetPath;
            }
            new Notice(`📁 Selected: ${this.targetPath}`);
          });
          folderModal.open();
        })
      );

    // Insert Tags button
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('Insert Tags')
        .setCta()
        .onClick(async () => {
          await this.handleInsertTags();
        })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Handle Insert Tags button click
   */
  private async handleInsertTags(): Promise<void> {
    try {
      // Validate target path
      if (!this.targetPath || this.targetPath.trim().length === 0) {
        new Notice('⚠️ Please enter a target path');
        return;
      }

      // Close modal
      this.close();

      // Execute workflow
      const forceMode = this.generationMode === 'force';
      await this.plugin.batchInsertTagsWorkflow(this.targetPath, forceMode);

    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Obsidian LLM Plugin] Batch tag insertion failed:', error);
    }
  }
}
