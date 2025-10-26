/**
 * Task manager service for background task orchestration
 * Handles task locking, progress tracking, and cancellation
 */

import { TaskInfo, TaskStatus, UnixTimestamp } from '../types/index';

/**
 * Callback for progress updates
 */
export type ProgressCallback = (progress: number, step: string) => void;

/**
 * Service for managing long-running background tasks
 */
export class TaskManagerService {
  private currentTask: TaskInfo | null = null;
  private taskLock: boolean = false;
  private cancellationRequested: boolean = false;
  private progressCallback: ProgressCallback | null = null;

  /**
   * Start a new background task
   * Prevents concurrent tasks with locking mechanism
   *
   * @param taskName - Display name for the task
   * @param callback - Function to execute
   * @returns Task result or throws if another task is running
   */
  async startTask<T>(
    taskName: string,
    callback: (updateProgress: ProgressCallback) => Promise<T>
  ): Promise<T> {
    // Try to acquire lock
    if (!this.acquireLock()) {
      throw new Error('Another task is already running. Please wait for it to complete or cancel it.');
    }

    // Create task info
    const taskId = this.generateTaskId();
    this.currentTask = {
      task_id: taskId,
      task_name: taskName,
      status: TaskStatus.RUNNING,
      progress: 0,
      current_step: 'Starting...',
      started_at: Date.now(),
    };

    try {
      // Execute task callback with progress update function
      const result = await callback((progress, step) => {
        this.updateProgress(progress, step);
      });

      // Task completed successfully
      if (this.currentTask) {
        this.currentTask.status = TaskStatus.COMPLETED;
        this.currentTask.completed_at = Date.now();
        this.currentTask.progress = 100;
        this.currentTask.current_step = 'Completed';
      }

      return result;
    } catch (error) {
      // Task failed or was cancelled
      if (this.currentTask) {
        if (this.cancellationRequested) {
          this.currentTask.status = TaskStatus.CANCELLED;
          this.currentTask.current_step = 'Cancelled';
        } else {
          this.currentTask.status = TaskStatus.FAILED;
          this.currentTask.error_message = (error as Error).message;
          this.currentTask.current_step = 'Failed';
        }
        this.currentTask.completed_at = Date.now();
      }

      throw error;
    } finally {
      // Release lock
      this.releaseLock();
    }
  }

  /**
   * Cancel the currently running task
   * Sets cancellation flag - task must check and respect it
   */
  async cancelTask(): Promise<void> {
    if (!this.taskLock || !this.currentTask) {
      throw new Error('No task is currently running');
    }

    this.cancellationRequested = true;

    if (this.currentTask) {
      this.currentTask.status = TaskStatus.CANCELLING;
      this.currentTask.current_step = 'Cancelling...';
    }
  }

  /**
   * Check if cancellation has been requested
   * Long-running tasks should call this periodically
   *
   * @returns True if task should be cancelled
   */
  isCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  /**
   * Update task progress
   * Calls registered progress callback
   *
   * @param progress - Progress percentage (0-100)
   * @param step - Current step description
   */
  updateProgress(progress: number, step: string): void {
    if (this.currentTask) {
      this.currentTask.progress = progress;
      this.currentTask.current_step = step;

      if (this.progressCallback) {
        this.progressCallback(progress, step);
      }
    }
  }

  /**
   * Register a callback for progress updates
   *
   * @param callback - Function to call on progress updates
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Get current task information
   *
   * @returns Current task info or null if no task running
   */
  getCurrentTask(): TaskInfo | null {
    return this.currentTask;
  }

  /**
   * Check if a task is currently running
   *
   * @returns True if task is running
   */
  isTaskRunning(): boolean {
    return this.taskLock;
  }

  /**
   * Acquire task lock
   * Prevents concurrent task execution
   *
   * @returns True if lock acquired, false if already locked
   */
  private acquireLock(): boolean {
    if (this.taskLock) {
      return false;
    }
    this.taskLock = true;
    this.cancellationRequested = false;
    return true;
  }

  /**
   * Release task lock
   */
  private releaseLock(): void {
    this.taskLock = false;
    this.cancellationRequested = false;
    this.currentTask = null;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
