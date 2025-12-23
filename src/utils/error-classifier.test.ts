/**
 * error-classifier.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
    PluginError,
    ConfigurationError,
    TransientError,
    ContentError,
    classifyAPIError,
    classifyContentError,
    shouldRetry,
    canSkip,
    getRetryDelay,
} from './error-classifier';

describe('classifyAPIError', () => {
    describe('配置错误 (Configuration Errors)', () => {
        it('401 应返回 ConfigurationError', () => {
            const error = classifyAPIError(401, '未授权');
            expect(error).toBeInstanceOf(ConfigurationError);
            expect((error as ConfigurationError).status).toBe(401);
        });

        it('404 应返回 ConfigurationError', () => {
            const error = classifyAPIError(404, '未找到');
            expect(error).toBeInstanceOf(ConfigurationError);
        });

        it('400 应返回 ConfigurationError', () => {
            const error = classifyAPIError(400, '错误请求');
            expect(error).toBeInstanceOf(ConfigurationError);
        });
    });

    describe('瞬时错误 (Transient Errors)', () => {
        it('429 应返回 TransientError', () => {
            const error = classifyAPIError(429, '速率限制');
            expect(error).toBeInstanceOf(TransientError);
        });

        it('500 应返回 TransientError', () => {
            const error = classifyAPIError(500, '服务器错误');
            expect(error).toBeInstanceOf(TransientError);
        });

        it('503 应返回 TransientError', () => {
            const error = classifyAPIError(503, '服务不可用');
            expect(error).toBeInstanceOf(TransientError);
        });

        it('504 应返回 TransientError', () => {
            const error = classifyAPIError(504, '网关超时');
            expect(error).toBeInstanceOf(TransientError);
        });

        it('0 (网络错误) 应返回 TransientError', () => {
            const error = classifyAPIError(0, '网络错误');
            expect(error).toBeInstanceOf(TransientError);
        });
    });

    describe('未知错误', () => {
        it('未知状态码应默认返回 TransientError', () => {
            const error = classifyAPIError(418, "I'm a teapot");
            expect(error).toBeInstanceOf(TransientError);
        });
    });
});

describe('classifyContentError', () => {
    it('应创建 ContentError 实例', () => {
        const error = classifyContentError('内容过长', 'note-123', '超出上下文窗口');
        expect(error).toBeInstanceOf(ContentError);
        expect(error.item_id).toBe('note-123');
        expect(error.reason).toBe('超出上下文窗口');
    });

    it('item_id 可选', () => {
        const error = classifyContentError('解析失败');
        expect(error).toBeInstanceOf(ContentError);
        expect(error.item_id).toBeUndefined();
        expect(error.reason).toBe('解析失败');
    });
});

describe('shouldRetry', () => {
    it('TransientError 应返回 true', () => {
        const error = new TransientError('临时错误', 500);
        expect(shouldRetry(error)).toBe(true);
    });

    it('ConfigurationError 应返回 false', () => {
        const error = new ConfigurationError('配置错误');
        expect(shouldRetry(error)).toBe(false);
    });

    it('ContentError 应返回 false', () => {
        const error = new ContentError('内容错误');
        expect(shouldRetry(error)).toBe(false);
    });

    it('普通 Error 应返回 false', () => {
        const error = new Error('普通错误');
        expect(shouldRetry(error)).toBe(false);
    });
});

describe('canSkip', () => {
    it('ContentError 应返回 true', () => {
        const error = new ContentError('内容错误', 'note-123');
        expect(canSkip(error)).toBe(true);
    });

    it('TransientError 应返回 false', () => {
        const error = new TransientError('临时错误');
        expect(canSkip(error)).toBe(false);
    });

    it('ConfigurationError 应返回 false', () => {
        const error = new ConfigurationError('配置错误');
        expect(canSkip(error)).toBe(false);
    });
});

describe('getRetryDelay', () => {
    it('应返回指数退避延迟', () => {
        expect(getRetryDelay(0)).toBe(1000);  // 1 秒
        expect(getRetryDelay(1)).toBe(2000);  // 2 秒
        expect(getRetryDelay(2)).toBe(4000);  // 4 秒
        expect(getRetryDelay(3)).toBe(8000);  // 8 秒
    });
});

describe('错误类继承', () => {
    it('ConfigurationError 应继承 PluginError', () => {
        const error = new ConfigurationError('测试');
        expect(error).toBeInstanceOf(PluginError);
        expect(error).toBeInstanceOf(Error);
    });

    it('TransientError 应继承 PluginError', () => {
        const error = new TransientError('测试');
        expect(error).toBeInstanceOf(PluginError);
        expect(error).toBeInstanceOf(Error);
    });

    it('ContentError 应继承 PluginError', () => {
        const error = new ContentError('测试');
        expect(error).toBeInstanceOf(PluginError);
        expect(error).toBeInstanceOf(Error);
    });
});
