/**
 * Progress modal for displaying task progress with cancellation
 */

import { Modal, App } from 'obsidian';
import { TaskManagerService } from '../services/task-manager';

/**
 * Modal for showing progress of long-running tasks
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

    // Title
    contentEl.createEl('h2', { text: 'Processing...' });

    // Progress bar container
    this.progressBar = contentEl.createDiv({ cls: 'jina-ai-linker-progress-bar' });
    this.progressFill = this.progressBar.createDiv({ cls: 'jina-ai-linker-progress-fill' });
    this.progressFill.style.width = '0%';

    // Progress percentage text
    this.progressText = contentEl.createDiv({
      cls: 'jina-ai-linker-progress-text',
      text: '0%',
    });

    // Current step description
    this.stepText = contentEl.createDiv({
      cls: 'jina-ai-linker-step-text',
      text: 'Initializing...',
    });

    // Cancel button
    this.cancelButton = contentEl.createEl('button', {
      text: 'Cancel',
      cls: 'jina-ai-linker-button mod-warning',
    });
    this.cancelButton.onclick = async () => {
      await this.taskManager.cancelTask();
      this.cancelButton.disabled = true;
      this.cancelButton.textContent = 'Cancelling...';
    };

    // Register progress callback
    this.taskManager.setProgressCallback((progress, step) => {
      this.updateProgress(progress, step);
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // Unregister progress callback
    this.taskManager.setProgressCallback(null);
  }

  /**
   * Update progress display
   */
  updateProgress(progress: number, step: string): void {
    const percentage = Math.round(progress);

    // Update progress bar
    this.progressFill.style.width = `${percentage}%`;

    // Update percentage text
    this.progressText.textContent = `${percentage}%`;

    // Update step description
    this.stepText.textContent = step;

    // If completed, close modal after a short delay
    if (progress >= 100) {
      setTimeout(() => {
        this.close();
      }, 1000);
    }
  }
}
