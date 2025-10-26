/**
 * 用于后台任务编排的任务管理器服务
 * 处理任务锁定、进度跟踪和取消
 */

import { TaskInfo, TaskStatus, UnixTimestamp } from '../types/index';

/**
 * 进度更新回调
 */
export type ProgressCallback = (progress: number, step: string) => void;

/**
 * 用于管理长时间运行的后台任务的服务
 */
export class TaskManagerService {
  private currentTask: TaskInfo | null = null;
  private taskLock: boolean = false;
  private cancellationRequested: boolean = false;
  private progressCallback: ProgressCallback | null = null;

  /**
   * 启动一个新的后台任务
   * 使用锁定机制防止并发任务
   *
   * @param taskName - 任务的显示名称
   * @param callback - 要执行的函数
   * @returns 任务结果，如果另一个任务正在运行，则抛出异常
   */
  async startTask<T>(
    taskName: string,
    callback: (updateProgress: ProgressCallback) => Promise<T>
  ): Promise<T> {
    // 尝试获取锁
    if (!this.acquireLock()) {
      throw new Error('另一个任务已在运行。请等待其完成或取消它。');
    }

    // 创建任务信息
    const taskId = this.generateTaskId();
    this.currentTask = {
      task_id: taskId,
      task_name: taskName,
      status: TaskStatus.RUNNING,
      progress: 0,
      current_step: '启动中...',
      started_at: Date.now(),
    };

    try {
      // 使用进度更新函数执行任务回调
      const result = await callback((progress, step) => {
        this.updateProgress(progress, step);
      });

      // 任务成功完成
      if (this.currentTask) {
        this.currentTask.status = TaskStatus.COMPLETED;
        this.currentTask.completed_at = Date.now();
        this.currentTask.progress = 100;
        this.currentTask.current_step = '已完成';
      }

      return result;
    } catch (error) {
      // 任务失败或被取消
      if (this.currentTask) {
        if (this.cancellationRequested) {
          this.currentTask.status = TaskStatus.CANCELLED;
          this.currentTask.current_step = '已取消';
        } else {
          this.currentTask.status = TaskStatus.FAILED;
          this.currentTask.error_message = (error as Error).message;
          this.currentTask.current_step = '失败';
        }
        this.currentTask.completed_at = Date.now();
      }

      throw error;
    } finally {
      // 释放锁
      this.releaseLock();
    }
  }

  /**
   * 取消当前正在运行的任务
   * 设置取消标志 - 任务必须检查并遵守它
   */
  async cancelTask(): Promise<void> {
    if (!this.taskLock || !this.currentTask) {
      throw new Error('当前没有正在运行的任务');
    }

    this.cancellationRequested = true;

    if (this.currentTask) {
      this.currentTask.status = TaskStatus.CANCELLING;
      this.currentTask.current_step = '取消中...';
    }
  }

  /**
   * 检查是否已请求取消
   * 长时间运行的任务应定期调用此方法
   *
   * @returns 如果应取消任务，则为 True
   */
  isCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  /**
   * 更新任务进度
   * 调用已注册的进度回调
   *
   * @param progress - 进度百分比 (0-100)
   * @param step - 当前步骤描述
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
   * 注册进度更新的回调
   *
   * @param callback - 在进度更新时调用的函数
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * 获取当前任务信息
   *
   * @returns 当前任务信息，如果没有正在运行的任务，则为 null
   */
  getCurrentTask(): TaskInfo | null {
    return this.currentTask;
  }

  /**
   * 检查任务当前是否正在运行
   *
   * @returns 如果任务正在运行，则为 True
   */
  isTaskRunning(): boolean {
    return this.taskLock;
  }

  /**
   * 获取任务锁
   * 防止并发任务执行
   *
   * @returns 如果获取锁成功，则为 True；如果已锁定，则为 false
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
   * 释放任务锁
   */
  private releaseLock(): void {
    this.taskLock = false;
    this.cancellationRequested = false;
    this.currentTask = null;
  }

  /**
   * 生成唯一的任务 ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
