/**
 * Sidebar menu (ribbon icon) for quick access to plugin functions
 * Supports i18n for English and Chinese
 */

import { Menu, Notice } from 'obsidian';
import ObsidianLLMPlugin from '../main';
import { BatchTagModal } from './batch-tag-modal';
import { ProcessNotesModal } from './process-notes-modal';
import { t } from '../i18n/translations';

/**
 * Service for managing the sidebar ribbon icon and menu
 */
export class SidebarMenuService {
  private plugin: ObsidianLLMPlugin;

  constructor(plugin: ObsidianLLMPlugin) {
    this.plugin = plugin;
  }

  /**
   * Register the ribbon icon in Obsidian's left sidebar
   */
  registerRibbonIcon(): void {
    const tr = t(this.plugin.settings.language);

    const ribbonIconEl = this.plugin.addRibbonIcon(
      'link',
      tr.sidebar.ribbonTitle,
      (evt: MouseEvent) => {
        this.showMenu(evt);
      }
    );

    // Add custom class for styling
    ribbonIconEl.addClass('obsidian-llm-plugin-ribbon-icon');
  }

  /**
   * Show the quick action menu
   */
  private showMenu(evt: MouseEvent): void {
    const tr = t(this.plugin.settings.language);
    const menu = new Menu();

    // Menu item 1: Process Notes and Insert Suggested Links
    menu.addItem((item) =>
      item
        .setTitle(tr.sidebar.processNotes)
        .setIcon('link')
        .onClick(() => {
          const modal = new ProcessNotesModal(this.plugin.app, this.plugin);
          modal.open();
        })
    );

    // Menu item 2: Batch Insert AI Tags
    menu.addItem((item) =>
      item
        .setTitle(tr.sidebar.batchTags)
        .setIcon('tag')
        .onClick(() => {
          const modal = new BatchTagModal(this.plugin.app, this.plugin);
          modal.open();
        })
    );

    menu.showAtMouseEvent(evt);
  }
}
