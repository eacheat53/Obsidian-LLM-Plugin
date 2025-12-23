/**
 * frontmatter-parser.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
    parseFrontMatter,
    updateFrontMatter,
    ensureNoteId,
    getFrontMatterField,
    extractMainContent,
} from './frontmatter-parser';

describe('parseFrontMatter', () => {
    it('应正确解析标准 YAML front-matter', () => {
        const content = `---
title: 测试笔记
note_id: abc-123
tags:
  - tag1
  - tag2
---
这是正文内容`;

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(true);
        expect(result.data.title).toBe('测试笔记');
        expect(result.data.note_id).toBe('abc-123');
        expect(result.data.tags).toEqual(['tag1', 'tag2']);
        expect(result.body).toBe('这是正文内容');
    });

    it('应处理空 front-matter', () => {
        const content = `---
---
正文内容`;

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(true);
        expect(result.data).toEqual({});
        expect(result.body).toBe('正文内容');
    });

    it('应处理无 front-matter 的内容', () => {
        const content = '这是没有 front-matter 的内容';

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(false);
        expect(result.data).toEqual({});
        expect(result.body).toBe(content);
    });

    it('应容错前置空行', () => {
        const content = `

---
title: 测试
---
正文`;

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(true);
        expect(result.data.title).toBe('测试');
    });

    it('应将数字类型 note_id 转换为字符串', () => {
        const content = `---
note_id: 12345
---
正文`;

        const result = parseFrontMatter(content);

        expect(result.data.note_id).toBe('12345');
        expect(typeof result.data.note_id).toBe('string');
    });

    it('应处理无效 YAML 并返回错误信息', () => {
        const content = `---
invalid: [unclosed bracket
---
正文`;

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(true);
        expect(result.parseError).toBeDefined();
        expect(result.data).toEqual({});
    });

    it('应支持 CRLF 换行符', () => {
        const content = '---\r\ntitle: 测试\r\n---\r\n正文';

        const result = parseFrontMatter(content);

        expect(result.exists).toBe(true);
        expect(result.data.title).toBe('测试');
    });
});

describe('updateFrontMatter', () => {
    it('应更新现有字段', () => {
        const content = `---
title: 旧标题
---
正文`;

        const result = updateFrontMatter(content, { title: '新标题' });

        expect(result).toContain('title: 新标题');
        expect(result).toContain('正文');
    });

    it('应添加新字段', () => {
        const content = `---
title: 标题
---
正文`;

        const result = updateFrontMatter(content, { note_id: 'new-uuid' });

        expect(result).toContain('title: 标题');
        expect(result).toContain('note_id: new-uuid');
    });

    it('应在无 front-matter 时创建新的', () => {
        const content = '纯文本内容';

        const result = updateFrontMatter(content, { title: '新标题' });

        expect(result).toMatch(/^---\n/);
        expect(result).toContain('title: 新标题');
        expect(result).toContain('纯文本内容');
    });
});

describe('ensureNoteId', () => {
    it('应返回已存在的 note_id', () => {
        const content = `---
note_id: existing-uuid
---
正文`;

        const [newContent, noteId, wasAdded] = ensureNoteId(content, () => 'new-uuid');

        expect(noteId).toBe('existing-uuid');
        expect(wasAdded).toBe(false);
        expect(newContent).toBe(content);
    });

    it('应生成并添加缺失的 note_id', () => {
        const content = `---
title: 标题
---
正文`;

        const [newContent, noteId, wasAdded] = ensureNoteId(content, () => 'generated-uuid');

        expect(noteId).toBe('generated-uuid');
        expect(wasAdded).toBe(true);
        expect(newContent).toContain('note_id: generated-uuid');
    });
});

describe('getFrontMatterField', () => {
    it('应返回存在的字段值', () => {
        const content = `---
title: 测试标题
count: 42
---
正文`;

        expect(getFrontMatterField(content, 'title')).toBe('测试标题');
        expect(getFrontMatterField(content, 'count')).toBe(42);
    });

    it('应对不存在的字段返回 undefined', () => {
        const content = `---
title: 标题
---
正文`;

        expect(getFrontMatterField(content, 'nonexistent')).toBeUndefined();
    });
});

describe('extractMainContent', () => {
    it('应提取 front-matter 之后的内容', () => {
        const content = `---
title: 标题
---
这是主要内容`;

        const result = extractMainContent(content);

        expect(result).toBe('这是主要内容');
    });

    it('应提取 HASH_BOUNDARY 之前的内容', () => {
        const content = `---
title: 标题
---
主要内容
<!-- HASH_BOUNDARY -->
- [[链接1]]
- [[链接2]]`;

        const result = extractMainContent(content);

        expect(result).toBe('主要内容');
        expect(result).not.toContain('链接1');
    });

    it('应处理无 front-matter 和无边界的内容', () => {
        const content = '纯文本内容';

        const result = extractMainContent(content);

        expect(result).toBe('纯文本内容');
    });
});
