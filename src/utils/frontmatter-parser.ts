/**
 * YAML front-matter 解析和操作实用程序
 */

import * as yaml from 'js-yaml';
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

  /** 解析错误信息（如果有） */
  parseError?: string;
}

/**
 * 从 markdown 内容中解析 YAML front-matter
 * 支持 LF (\n) 和 CRLF (\r\n) 换行符
 * 容错：前置空行、note_id 类型转换
 *
 * @param content - 完整的 markdown 文件内容
 * @returns 解析后的 front-matter 数据
 */
export function parseFrontMatter(content: string): FrontMatterData {
  // 修复问题2: 支持前置空行
  const trimmedContent = content.replace(/^\s*/, '');

  // 支持 LF 和 CRLF 换行符：\r? 表示可选的 \r
  // 修复问题5: 支持空 front-matter，中间部分可以完全为空
  // Pattern breakdown: ---\n (content can be empty) optionally\n ---\n
  const frontMatterRegex = /^---\r?\n([\s\S]*?)(\r?\n)?---\r?\n/;
  const match = trimmedContent.match(frontMatterRegex);

  if (!match) {
    return {
      data: {},
      raw_yaml: '',
      body: content,
      exists: false,
    };
  }

  const raw_yaml = match[1];
  const body = trimmedContent.slice(match[0].length);

  try {
    let data = (yaml.load(raw_yaml) as Record<string, unknown>) || {};

    // 修复问题5: 空 front-matter 返回空对象
    if (!data) {
      data = {};
    }

    // 修复问题1: note_id 类型容错（数字 → 字符串）
    if (data.note_id !== undefined && data.note_id !== null) {
      data.note_id = String(data.note_id).trim();
      // 如果转换后为空字符串，则删除该字段
      if (data.note_id === '') {
        delete data.note_id;
      }
    }

    return {
      data,
      raw_yaml,
      body,
      exists: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('无法解析 front-matter YAML:', errorMessage);
    return {
      data: {},
      raw_yaml,
      body,
      exists: true, // It exists, but it's invalid
      parseError: errorMessage, // 修复问题4: 返回错误信息
    };
  }
}

/**
 * 使用新数据更新 front-matter
 *
 * @param content - 原始 markdown 内容
 * @param updates - 要更新/添加到 front-matter 的数据
 * @returns 更新后的 markdown 内容
 */
export function updateFrontMatter(
  content: string,
  updates: Record<string, unknown>
): string {
  const fm = parseFrontMatter(content);

  // 将更新合并到现有数据中
  const newData = { ...fm.data, ...updates };

  // 生成新的 YAML
  // `skipInvalid: true` 可以在数据包含 undefined 等无法序列化的值时避免抛出错误
  const newYaml = yaml.dump(newData, { skipInvalid: true });
  const newFrontMatter = `---\n${newYaml}---\n`; // js-yaml already adds a newline at the end

  if (fm.exists) {
    // 替换现有的 front-matter，支持 LF 和 CRLF
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, newFrontMatter);
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
 */
export function ensureNoteId(
  content: string,
  generateId: () => NoteId
): [string, NoteId, boolean] {
  const fm = parseFrontMatter(content);

  // 检查 note_id 是否已存在且为字符串
  if (fm.data && fm.data.note_id && typeof fm.data.note_id === 'string') {
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
  return fm.data ? fm.data[field] : undefined;
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
