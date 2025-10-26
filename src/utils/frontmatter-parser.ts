/**
 * YAML front-matter 解析和操作实用程序
 */

import { NoteId } from '../types/index';

/**
 * 解析后的 front-matter 数据结构
 */
export interface FrontMatterData {
  /** 解析后的 YAML 数据，以键值对形式存在 */
  data: Record<string, unknown>;

  /** 原始 YAML 内容（在 --- 分隔符之间） */
  raw_yaml: string;

  /** front-matter 之后的内容 */
  body: string;

  /** front-matter 是否存在 */
  exists: boolean;
}

/**
 * 从 markdown 内容中解析 YAML front-matter
 *
 * @param content - 完整的 markdown 文件内容
 * @returns 解析后的 front-matter 数据
 *
 * @example
 * const content = "---\ntitle: My Note\ntags: [ai, knowledge]\n---\n\nContent here";
 * const fm = parseFrontMatter(content);
 * // fm.data = { title: "My Note", tags: ["ai", "knowledge"] }
 * // fm.body = "\nContent here"
 */
export function parseFrontMatter(content: string): FrontMatterData {
  const frontMatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontMatterRegex);

  if (!match) {
    return {
      data: {},
      raw_yaml: '',
      body: content,
      exists: false,
    };
  }

  const raw_yaml = match[1];
  const body = content.slice(match[0].length);

  try {
    // 针对键值对的简单 YAML 解析
    // 注意：这是一个基本的实现。对于复杂的 YAML，请考虑使用库
    const data = parseSimpleYAML(raw_yaml);

    return {
      data,
      raw_yaml,
      body,
      exists: true,
    };
  } catch (error) {
    console.warn('无法解析 front-matter YAML:', error);
    return {
      data: {},
      raw_yaml,
      body,
      exists: true,
    };
  }
}

/**
 * 用于基本键值对的简单 YAML 解析器
 * 支持：字符串、数字、布尔值、数组
 *
 * @param yaml - 要解析的 YAML 字符串
 * @returns 解析后的对象
 */
function parseSimpleYAML(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // 解析数组格式：[item1, item2]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim());
    }
    // 解析布尔值
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // 解析数字
    else if (typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value);
    }

    result[key] = value;
  }

  return result;
}

/**
 * 使用新数据更新 front-matter
 *
 * @param content - 原始 markdown 内容
 * @param updates - 要更新/添加到 front-matter 的数据
 * @returns 更新后的 markdown 内容
 *
 * @example
 * const updated = updateFrontMatter(content, { note_id: "abc-123", tags: ["new-tag"] });
 */
export function updateFrontMatter(
  content: string,
  updates: Record<string, unknown>
): string {
  const fm = parseFrontMatter(content);

  // 将更新合并到现有数据中
  const newData = { ...fm.data, ...updates };

  // 生成新的 YAML
  const yamlLines: string[] = [];
  for (const [key, value] of Object.entries(newData)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}: [${value.join(', ')}]`);
    } else {
      yamlLines.push(`${key}: ${value}`);
    }
  }

  const newYaml = yamlLines.join('\n');
  const newFrontMatter = `---\n${newYaml}\n---\n`;

  if (fm.exists) {
    // 替换现有的 front-matter
    return content.replace(/^---\n[\s\S]*?\n---\n/, newFrontMatter);
  } else {
    // 在开头添加新的 front-matter
    return newFrontMatter + content;
  }
}

/**
 * 确保笔记在其 front-matter 中具有唯一的 note_id
 * 如果缺少，则生成并添加一个
 *
 * @param content - 原始 markdown 内容
 * @param generateId - 用于生成新笔记 ID 的函数
 * @returns [更新后的内容, note_id, was_added] 的元组
 *
 * @example
 * const [newContent, noteId, added] = ensureNoteId(content, () => crypto.randomUUID());
 */
export function ensureNoteId(
  content: string,
  generateId: () => NoteId
): [string, NoteId, boolean] {
  const fm = parseFrontMatter(content);

  // 检查 note_id 是否已存在
  if (fm.data.note_id && typeof fm.data.note_id === 'string') {
    return [content, fm.data.note_id as NoteId, false];
  }

  // 生成新的 note_id
  const noteId = generateId();
  const updatedContent = updateFrontMatter(content, { note_id: noteId });

  return [updatedContent, noteId, true];
}

/**
 * 获取特定 front-matter 字段的值
 *
 * @param content - Markdown 内容
 * @param field - 要检索的字段名称
 * @returns 字段值，如果未找到则为 undefined
 */
export function getFrontMatterField(content: string, field: string): unknown {
  const fm = parseFrontMatter(content);
  return fm.data[field];
}

/**
 * 提取主要内容（在 front-matter 之后，HASH_BOUNDARY 之前）
 * 这是应该为变更检测进行 hash 的内容
 *
 * @param content - 完整的 markdown 内容
 * @returns 用于 hash 的主要内容
 */
export function extractMainContent(content: string): string {
  const fm = parseFrontMatter(content);
  let mainContent = fm.body;

  // 如果存在 HASH_BOUNDARY 标记，则提取其前的内容
  const boundaryIndex = mainContent.indexOf('<!-- HASH_BOUNDARY -->');
  if (boundaryIndex !== -1) {
    mainContent = mainContent.slice(0, boundaryIndex);
  }

  return mainContent.trim();
}
