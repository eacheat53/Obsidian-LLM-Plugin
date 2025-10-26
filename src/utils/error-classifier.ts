/**
 * API 错误的三层分类
 */

/**
 * 所有插件错误的基类
 */
export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 第 1 层：配置错误
 * 这些错误表示用户配置问题，导致操作无法继续。
 * 操作：立即中止并显示可操作的通知
 * 示例：无效的 API 密钥、错误的端点、错误的模型名称
 * HTTP 状态：401 Unauthorized、404 Not Found、400 Bad Request
 */
export class ConfigurationError extends PluginError {
  /** 导致此错误的 HTTP 状态代码 */
  readonly status?: number;

  /** 给用户的可操作指南 */
  readonly guidance: string;

  constructor(message: string, status?: number, guidance?: string) {
    super(message);
    this.status = status;
    this.guidance = guidance || '请检查您的设置并重试。';
  }
}

/**
 * 第 2 层：瞬时错误
 * 这些是临时问题，可以通过重试解决。
 * 操作：使用指数退避算法自动重试（3 次尝试：1 秒、2 秒、4 秒）
 * 示例：网络问题、服务器错误、速率限制
 * HTTP 状态：500 Internal Server Error、503 Service Unavailable、504 Gateway Timeout、429 Too Many Requests
 */
export class TransientError extends PluginError {
  /** 导致此错误的 HTTP 状态代码 */
  readonly status?: number;

  /** 已进行的重试次数 */
  readonly attempts: number;

  constructor(message: string, status?: number, attempts = 0) {
    super(message);
    this.status = status;
    this.attempts = attempts;
  }
}

/**
 * 第 3 层：内容错误
 * 这些错误表示特定内容项存在问题，可以跳过。
 * 操作：跳过有问题的项目，继续处理队列，并在摘要中报告
 * 示例：笔记超出 API 上下文窗口、无法处理的字符
 */
export class ContentError extends PluginError {
  /** 有问题的项目的标识符（例如，note_id、文件路径） */
  readonly item_id?: string;

  /** 错误的具体原因 */
  readonly reason: string;

  constructor(message: string, item_id?: string, reason?: string) {
    super(message);
    this.item_id = item_id;
    this.reason = reason || message;
  }
}

/**
 * 将 HTTP 错误响应分类为三层之一
 *
 * @param status - HTTP 状态代码
 * @param message - 错误消息
 * @returns 适当的错误实例
 */
export function classifyAPIError(status: number, message: string): PluginError {
  // 第 1 层：配置错误
  if (status === 401) {
    return new ConfigurationError(
      '无效的 API 密钥',
      status,
      '请检查插件设置中的 API 密钥。确保它是正确的并且没有过期。'
    );
  }

  if (status === 404) {
    return new ConfigurationError(
      '未找到 API 端点',
      status,
      '请检查插件设置中的 API URL。端点可能不正确或服务可能不可用。'
    );
  }

  if (status === 400) {
    return new ConfigurationError(
      '对 API 的错误请求',
      status,
      '请检查您的模型名称和其他 API 配置设置。'
    );
  }

  // 第 2 层：瞬时错误
  if (status === 429) {
    return new TransientError(
      '超出速率限制',
      status
    );
  }

  if (status === 500 || status === 503 || status === 504) {
    return new TransientError(
      `服务器错误: ${status}`,
      status
    );
  }

  if (status === 0) {
    return new TransientError(
      '网络错误：无法访问 API',
      status
    );
  }

  // 对于未知错误，默认为瞬时错误（可以重试）
  return new TransientError(
    `意外错误: ${message}`,
    status
  );
}

/**
 * 对与内容相关的错误进行分类
 *
 * @param message - 错误消息
 * @param itemId - 有问题的项目的标识符
 * @param reason - 错误的具体原因
 * @returns ContentError 实例
 */
export function classifyContentError(
  message: string,
  itemId?: string,
  reason?: string
): ContentError {
  return new ContentError(message, itemId, reason);
}

/**
 * 检查是否应重试错误
 *
 * @param error - 要检查的错误
 * @returns 如果错误是瞬时错误并且应该重试，则为 True
 */
export function shouldRetry(error: Error): boolean {
  return error instanceof TransientError;
}

/**
 * 检查是否可以跳过错误（继续处理其他项目）
 *
 * @param error - 要检查的错误
 * @returns 如果错误与内容相关并且可以跳过项目，则为 True
 */
export function canSkip(error: Error): boolean {
  return error instanceof ContentError;
}

/**
 * 计算指数退避的延迟
 * 延迟：对于尝试 0、1、2，分别为 1 秒、2 秒、4 秒
 *
 * @param attempt - 当前尝试次数（从 0 开始）
 * @returns 延迟（毫秒）
 */
export function getRetryDelay(attempt: number): number {
  return Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
}
