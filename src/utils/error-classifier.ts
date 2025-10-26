/**
 * Three-tier error classification for API errors
 */

/**
 * Base class for all plugin errors
 */
export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Tier 1: Configuration Errors
 * These indicate user configuration issues that prevent the operation from proceeding.
 * Action: Immediate abort with actionable notification
 * Examples: Invalid API key, wrong endpoint, bad model name
 * HTTP Status: 401 Unauthorized, 404 Not Found, 400 Bad Request
 */
export class ConfigurationError extends PluginError {
  /** HTTP status code that caused this error */
  readonly status?: number;

  /** Actionable guidance for the user */
  readonly guidance: string;

  constructor(message: string, status?: number, guidance?: string) {
    super(message);
    this.status = status;
    this.guidance = guidance || 'Please check your settings and try again.';
  }
}

/**
 * Tier 2: Transient Errors
 * These are temporary issues that may resolve with retry.
 * Action: Auto-retry with exponential backoff (3 attempts: 1s, 2s, 4s)
 * Examples: Network issues, server errors, rate limits
 * HTTP Status: 500 Internal Server Error, 503 Service Unavailable, 504 Gateway Timeout, 429 Too Many Requests
 */
export class TransientError extends PluginError {
  /** HTTP status code that caused this error */
  readonly status?: number;

  /** Number of retry attempts made */
  readonly attempts: number;

  constructor(message: string, status?: number, attempts = 0) {
    super(message);
    this.status = status;
    this.attempts = attempts;
  }
}

/**
 * Tier 3: Content Errors
 * These indicate issues with specific content items that can be skipped.
 * Action: Skip problematic item, continue processing queue, report in summary
 * Examples: Note exceeds API context window, unprocessable characters
 */
export class ContentError extends PluginError {
  /** Identifier of the problematic item (e.g., note_id, file path) */
  readonly item_id?: string;

  /** Specific reason for the error */
  readonly reason: string;

  constructor(message: string, item_id?: string, reason?: string) {
    super(message);
    this.item_id = item_id;
    this.reason = reason || message;
  }
}

/**
 * Classify an HTTP error response into one of the three tiers
 *
 * @param status - HTTP status code
 * @param message - Error message
 * @returns Appropriate error instance
 */
export function classifyAPIError(status: number, message: string): PluginError {
  // Tier 1: Configuration Errors
  if (status === 401) {
    return new ConfigurationError(
      'Invalid API key',
      status,
      'Please check your API key in plugin settings. Make sure it is correct and has not expired.'
    );
  }

  if (status === 404) {
    return new ConfigurationError(
      'API endpoint not found',
      status,
      'Please check the API URL in plugin settings. The endpoint may be incorrect or the service may be unavailable.'
    );
  }

  if (status === 400) {
    return new ConfigurationError(
      'Bad request to API',
      status,
      'Please check your model name and other API configuration settings.'
    );
  }

  // Tier 2: Transient Errors
  if (status === 429) {
    return new TransientError(
      'Rate limit exceeded',
      status
    );
  }

  if (status === 500 || status === 503 || status === 504) {
    return new TransientError(
      `Server error: ${status}`,
      status
    );
  }

  if (status === 0) {
    return new TransientError(
      'Network error: Unable to reach API',
      status
    );
  }

  // Default to transient for unknown errors (can be retried)
  return new TransientError(
    `Unexpected error: ${message}`,
    status
  );
}

/**
 * Classify a content-related error
 *
 * @param message - Error message
 * @param itemId - Identifier of the problematic item
 * @param reason - Specific reason for the error
 * @returns ContentError instance
 */
export function classifyContentError(
  message: string,
  itemId?: string,
  reason?: string
): ContentError {
  return new ContentError(message, itemId, reason);
}

/**
 * Check if an error should be retried
 *
 * @param error - Error to check
 * @returns True if error is transient and should be retried
 */
export function shouldRetry(error: Error): boolean {
  return error instanceof TransientError;
}

/**
 * Check if an error can be skipped (continue processing other items)
 *
 * @param error - Error to check
 * @returns True if error is content-related and item can be skipped
 */
export function canSkip(error: Error): boolean {
  return error instanceof ContentError;
}

/**
 * Calculate delay for exponential backoff
 * Delays: 1s, 2s, 4s for attempts 0, 1, 2
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attempt: number): number {
  return Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
}
