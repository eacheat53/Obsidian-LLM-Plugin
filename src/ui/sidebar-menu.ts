/**
 * 侧边栏菜单（Ribbon图标），用于快速访问插件功能
 * 支持中英文国际化
 */

import { Menu } from 'obsidian';
import ObsidianLLMPlugin from '../main';
import { t } from '../i18n/translations';

/**
 * 用于管理侧边栏Ribbon图标和菜单的服务
 */
export class SidebarMenuService {
  private plugin: ObsidianLLMPlugin;

  constructor(plugin: ObsidianLLMPlugin) {
    this.plugin = plugin;
  }

  /**
   * 在Obsidian的左侧边栏注册Ribbon图标
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

    // 添加自定义类以进行样式设置
    ribbonIconEl.addClass('obsidian-llm-plugin-ribbon-icon');
  }

  /**
   * 显示快速操作菜单
   */
  private showMenu(evt: MouseEvent): void {
    const tr = t(this.plugin.settings.language);
    const menu = new Menu();

    // 单次运行流程：检测 → 嵌入 → 评分 → 插入链接 → 添加标签
    menu.addItem((item) =>
      item
        .setTitle('一键执行（嵌入→打分→插链→打标签）')
        .setIcon('bolt')
        .onClick(() => {
          const modal = new (require('./single-run-modal').SingleRunModal)(this.plugin.app, this.plugin);
          modal.open();
        })
    );

    // 重新校准链接：基于当前阈值重新插入/删除链接（不重新评分）
    menu.addItem((item) =>
      item
        .setTitle('重新校准链接（应用新阈值）')
        .setIcon('refresh-cw')
        .onClick(async () => {
          try {
            await this.plugin.recalibrateLinksWorkflow(this.plugin.settings.default_scan_path);
          } catch (error) {
            console.error('[Sidebar Menu] Recalibrate links failed:', error);
          }
        })
    );


    menu.showAtMouseEvent(evt);
  }
}
