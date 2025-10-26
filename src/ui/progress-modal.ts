/**
 * 用于显示带取消功能任务进度的进度模态框
 */

import { Modal, App } from 'obsidian';
import { TaskManagerService } from '../services/task-manager';

/**
 * 用于显示长时间运行任务进度的模态框
 */
export class ProgressModal extends Modal {
  private taskManager: TaskManagerService;
  private progressBar!: HTMLElement;
  private progressFill!: HTMLElement;
  private progressText!: HTMLElement;
  private stepText!: HTMLElement;
  private cancelButton!: HTMLButtonElement;

  constructor(app: App, taskManager: TaskManagerService) {
    super(app);
    this.taskManager = taskManager;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.addClass('jina-ai-linker-progress-modal');

    // 标题
    contentEl.createEl('h2', { text: '处理中...' });

    // 进度条容器
    this.progressBar = contentEl.createDiv({ cls: 'jina-ai-linker-progress-bar' });
    this.progressFill = this.progressBar.createDiv({ cls: 'jina-ai-linker-progress-fill' });
    this.progressFill.style.width = '0%';

    // 进度百分比文本
    this.progressText = contentEl.createDiv({
      cls: 'jina-ai-linker-progress-text',
      text: '0%',
    });

    // 当前步骤描述
    this.stepText = contentEl.createDiv({
      cls: 'jina-ai-linker-step-text',
      text: '初始化中...',
    });

    // 取消按钮
    this.cancelButton = contentEl.createEl('button', {
      text: '取消',
      cls: 'jina-ai-linker-button mod-warning',
    });
    this.cancelButton.onclick = async () => {
      await this.taskManager.cancelTask();
      this.cancelButton.disabled = true;
      this.cancelButton.textContent = '取消中...';
    };

    // 注册进度回调
    this.taskManager.setProgressCallback((progress, step) => {
      this.updateProgress(progress, step);
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // 注销进度回调
    this.taskManager.setProgressCallback(null);
  }

  /**
   * 更新进度显示
   */
  updateProgress(progress: number, step: string): void {
    const percentage = Math.round(progress);

    // 更新进度条
    this.progressFill.style.width = `${percentage}%`;

    // 更新百分比文本
    this.progressText.textContent = `${percentage}%`;

    // 更新步骤描述
    this.stepText.textContent = step;

    // 如果完成，则在短暂延迟后关闭模态框
    if (progress >= 100) {
      setTimeout(() => {
        this.close();
      }, 1000);
    }
  }
}
