/**
 * link-injector.ts 单元测试
 * 使用 mock Obsidian API 和 mock CacheService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkInjectorService } from './link-injector';
import { App, TFile, createMockApp, createMockTFile } from '../__mocks__/obsidian';
import { DEFAULT_SETTINGS } from '../plugin-settings';
import { NotePairScore, NoteMetadata } from '../types/index';

// Mock CacheService
const createMockCacheService = () => {
    const masterIndex = {
        notes: {} as Record<string, NoteMetadata>,
        scores: {} as Record<string, NotePairScore>,
        link_ledger: {} as Record<string, string[]>,
        version: '1.0.0',
        last_updated: Date.now(),
    };

    return {
        getMasterIndex: vi.fn(() => masterIndex),
        setMasterIndex: vi.fn(),
        _masterIndex: masterIndex,
        _addNote: (id: string, path: string) => {
            masterIndex.notes[id] = {
                note_id: id,
                file_path: path,
                content_hash: 'hash',
                last_processed: Date.now(),
                tags: [],
                has_frontmatter: true,
                has_hash_boundary: true,
                has_links_section: false,
            };
        },
    };
};

describe('LinkInjectorService', () => {
    let app: App;
    let settings: typeof DEFAULT_SETTINGS;
    let cacheService: ReturnType<typeof createMockCacheService>;
    let service: LinkInjectorService;

    beforeEach(() => {
        app = createMockApp();
        settings = { ...DEFAULT_SETTINGS };
        cacheService = createMockCacheService();
        // 使用 as any 绕过 mock 类型与真实 Obsidian 类型的差异
        service = new LinkInjectorService(app as any, settings, cacheService as any);
    });

    describe('insertLinks', () => {
        it('应在 HASH_BOUNDARY 后插入链接', async () => {
            const file = createMockTFile('source.md');
            app.vault._setFileContent('source.md', '内容\n<!-- HASH_BOUNDARY -->\n');

            cacheService._addNote('target-id', 'target.md');
            app.vault._setFileContent('target.md', '');

            const count = await service.insertLinks(file as any, ['target-id']);

            expect(count).toBe(1);
            const content = app.vault._getFileContent('source.md');
            expect(content).toContain('[[target]]');
        });

        it('无 HASH_BOUNDARY 时应返回 0', async () => {
            const file = createMockTFile('source.md');
            app.vault._setFileContent('source.md', '没有边界的内容');

            const count = await service.insertLinks(file as any, ['target-id']);

            expect(count).toBe(0);
        });

        it('空链接列表应返回 0', async () => {
            const file = createMockTFile('source.md');
            app.vault._setFileContent('source.md', '内容\n<!-- HASH_BOUNDARY -->\n');

            const count = await service.insertLinks(file as any, []);

            expect(count).toBe(0);
        });
    });

    describe('formatWikiLink', () => {
        it('应正确格式化 WikiLink', () => {
            app.vault._setFileContent('folder/note.md', '');

            const link = service.formatWikiLink('folder/note.md');

            expect(link).toBe('[[note]]');
        });

        it('文件不存在时应使用回退逻辑', () => {
            // 不设置文件内容，模拟文件不存在
            const link = service.formatWikiLink('nonexistent/note.md');

            expect(link).toBe('[[note]]');
        });
    });

    describe('findBestLinks', () => {
        it('应按 AI 分数排序并限制数量', () => {
            settings.max_links_per_note = 2;

            const scoredPairs: NotePairScore[] = [
                { note_id_1: 'source', note_id_2: 'target1', similarity_score: 0.8, ai_score: 7, last_scored: Date.now() },
                { note_id_1: 'source', note_id_2: 'target2', similarity_score: 0.9, ai_score: 9, last_scored: Date.now() },
                { note_id_1: 'source', note_id_2: 'target3', similarity_score: 0.7, ai_score: 8, last_scored: Date.now() },
            ];

            const links = service.findBestLinks('source', scoredPairs);

            expect(links.length).toBe(2);
            expect(links[0]).toBe('target2'); // 最高分 9
            expect(links[1]).toBe('target3'); // 次高分 8
        });

        it('应只包含作为 note_id_1 的配对', () => {
            const scoredPairs: NotePairScore[] = [
                { note_id_1: 'source', note_id_2: 'target1', similarity_score: 0.8, ai_score: 7, last_scored: Date.now() },
                { note_id_1: 'other', note_id_2: 'source', similarity_score: 0.9, ai_score: 9, last_scored: Date.now() },
            ];

            const links = service.findBestLinks('source', scoredPairs);

            expect(links.length).toBe(1);
            expect(links[0]).toBe('target1');
        });
    });

    describe('getDesiredTargetsFor', () => {
        it('应正确过滤和排序目标', () => {
            settings.similarity_threshold = 0.5;
            settings.min_ai_score = 6;
            settings.max_links_per_note = 10;

            const scoredPairs: NotePairScore[] = [
                { note_id_1: 'source', note_id_2: 'good1', similarity_score: 0.8, ai_score: 8, last_scored: Date.now() },
                { note_id_1: 'source', note_id_2: 'good2', similarity_score: 0.7, ai_score: 7, last_scored: Date.now() },
                { note_id_1: 'source', note_id_2: 'low_sim', similarity_score: 0.3, ai_score: 9, last_scored: Date.now() },
                { note_id_1: 'source', note_id_2: 'low_score', similarity_score: 0.9, ai_score: 3, last_scored: Date.now() },
            ];

            const targets = service.getDesiredTargetsFor('source', scoredPairs);

            expect(targets).toContain('good1');
            expect(targets).toContain('good2');
            expect(targets).not.toContain('low_sim');
            expect(targets).not.toContain('low_score');
        });
    });

    describe('reconcileUsingLedger', () => {
        it('应正确执行增删对账', async () => {
            const file = createMockTFile('source.md');
            app.vault._setFileContent('source.md', '内容\n<!-- HASH_BOUNDARY -->\n- [[old]]\n');

            cacheService._addNote('new-id', 'new.md');
            app.vault._setFileContent('new.md', '');

            // 设置旧的 ledger 状态
            cacheService._masterIndex.link_ledger['source-id'] = ['old-id'];

            const result = await service.reconcileUsingLedger(file as any, 'source-id', ['new-id']);

            expect(result.added).toBe(1);
            expect(result.removed).toBe(1);

            const content = app.vault._getFileContent('source.md');
            expect(content).toContain('[[new]]');
        });

        it('无变化时应返回 0', async () => {
            const file = createMockTFile('source.md');
            app.vault._setFileContent('source.md', '内容\n<!-- HASH_BOUNDARY -->\n- [[target]]\n');

            cacheService._addNote('target-id', 'target.md');
            app.vault._setFileContent('target.md', '');
            cacheService._masterIndex.link_ledger['source-id'] = ['target-id'];

            const result = await service.reconcileUsingLedger(file as any, 'source-id', ['target-id']);

            expect(result.added).toBe(0);
            expect(result.removed).toBe(0);
        });
    });
});
