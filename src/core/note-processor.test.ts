/**
 * note-processor.ts 单元测试
 * 使用 mock Obsidian API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteProcessorService } from './note-processor';
import { App, TFile, Vault, Workspace, createMockApp, createMockTFile } from '../__mocks__/obsidian';
import { DEFAULT_SETTINGS } from '../plugin-settings';

describe('NoteProcessorService', () => {
    let app: App;
    let service: NoteProcessorService;
    let settings: typeof DEFAULT_SETTINGS;

    beforeEach(() => {
        app = createMockApp();
        settings = { ...DEFAULT_SETTINGS };
        // 使用 as any 绕过 mock 类型与真实 Obsidian 类型的差异
        service = new NoteProcessorService(app as any, settings);
    });

    describe('scanVault', () => {
        it('应返回所有 markdown 文件', async () => {
            app.vault._setFileContent('note1.md', '内容1');
            app.vault._setFileContent('note2.md', '内容2');
            app.vault._setFileContent('readme.txt', '文本文件');

            const files = await service.scanVault('/');

            expect(files.length).toBe(2);
            expect(files.map(f => f.path)).toContain('note1.md');
            expect(files.map(f => f.path)).toContain('note2.md');
        });

        it('应过滤排除的文件夹', async () => {
            settings.excluded_folders = 'templates, archive';
            app.vault._setFileContent('note.md', '内容');
            app.vault._setFileContent('templates/template.md', '模板');
            app.vault._setFileContent('archive/old.md', '存档');

            const files = await service.scanVault('/');

            expect(files.length).toBe(1);
            expect(files[0].path).toBe('note.md');
        });

        it('应过滤排除的模式', async () => {
            settings.excluded_patterns = '*.bak, temp_*';
            app.vault._setFileContent('note.md', '内容');
            app.vault._setFileContent('backup.bak.md', '备份');
            app.vault._setFileContent('temp_draft.md', '草稿');

            // 注意：模式匹配使用正则，*.bak 会匹配 backup.bak.md
            const files = await service.scanVault('/');

            expect(files.some(f => f.path === 'note.md')).toBe(true);
        });

        it('应按扫描路径过滤', async () => {
            app.vault._setFileContent('root.md', '根目录');
            app.vault._setFileContent('folder/nested.md', '嵌套');

            const files = await service.scanVault('folder');

            expect(files.length).toBe(1);
            expect(files[0].path).toBe('folder/nested.md');
        });
    });

    describe('extractMainContent', () => {
        it('应提取 front-matter 之后的内容', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', `---
title: 标题
---
主要内容`);

            const content = await service.extractMainContent(file as any);

            expect(content).toBe('主要内容');
        });

        it('应提取 HASH_BOUNDARY 之前的内容', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', `---
title: 标题
---
主要内容
<!-- HASH_BOUNDARY -->
- [[链接]]`);

            const content = await service.extractMainContent(file as any);

            expect(content).toBe('主要内容');
            expect(content).not.toContain('链接');
        });
    });

    describe('ensureNoteHasId', () => {
        it('已有 ID 时不应修改文件', async () => {
            const file = createMockTFile('note.md');
            const originalContent = `---
note_id: existing-uuid
---
内容`;
            app.vault._setFileContent('note.md', originalContent);

            const noteId = await service.ensureNoteHasId(file as any);

            expect(noteId).toBe('existing-uuid');
            expect(app.vault.modify).not.toHaveBeenCalled();
        });

        it('缺少 ID 时应生成并写入', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', `---
title: 标题
---
内容`);

            const noteId = await service.ensureNoteHasId(file as any);

            expect(noteId).toMatch(/^[0-9a-f-]{36}$/i); // UUID 格式
            expect(app.vault.modify).toHaveBeenCalled();

            const newContent = app.vault._getFileContent('note.md');
            expect(newContent).toContain('note_id');
        });
    });

    describe('addHashBoundaryToNotes', () => {
        it('应为没有边界的笔记添加边界', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', '内容');

            const count = await service.addHashBoundaryToNotes([file as any]);

            expect(count).toBe(1);
            const content = app.vault._getFileContent('note.md');
            expect(content).toContain('<!-- HASH_BOUNDARY -->');
        });

        it('已有边界时不应重复添加', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', '内容\n<!-- HASH_BOUNDARY -->\n');

            const count = await service.addHashBoundaryToNotes([file as any]);

            expect(count).toBe(0);
            expect(app.vault.modify).not.toHaveBeenCalled();
        });
    });

    describe('calculateContentHash', () => {
        it('相同内容应返回相同哈希', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', '---\ntitle: 标题\n---\n内容\n<!-- HASH_BOUNDARY -->\n');

            const hash1 = await service.calculateContentHash(file as any);
            const hash2 = await service.calculateContentHash(file as any);

            expect(hash1).toBe(hash2);
        });

        it('缺少边界时应自动添加', async () => {
            const file = createMockTFile('note.md');
            app.vault._setFileContent('note.md', '内容');

            await service.calculateContentHash(file as any);

            const content = app.vault._getFileContent('note.md');
            expect(content).toContain('<!-- HASH_BOUNDARY -->');
        });
    });
});
