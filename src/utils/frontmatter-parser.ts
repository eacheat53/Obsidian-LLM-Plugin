/**
 * YAML front-matter parsing and manipulation utilities
 */

import { NoteId } from '../types/index';

/**
 * Parsed front-matter data structure
 */
export interface FrontMatterData {
  /** The parsed YAML data as key-value pairs */
  data: Record<string, unknown>;

  /** Raw YAML content (between --- delimiters) */
  raw_yaml: string;

  /** Content after the front-matter */
  body: string;

  /** Whether front-matter exists */
  exists: boolean;
}

/**
 * Parse YAML front-matter from markdown content
 *
 * @param content - Full markdown file content
 * @returns Parsed front-matter data
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
    // Simple YAML parsing for key-value pairs
    // Note: This is a basic implementation. For complex YAML, consider using a library
    const data = parseSimpleYAML(raw_yaml);

    return {
      data,
      raw_yaml,
      body,
      exists: true,
    };
  } catch (error) {
    console.warn('Failed to parse front-matter YAML:', error);
    return {
      data: {},
      raw_yaml,
      body,
      exists: true,
    };
  }
}

/**
 * Simple YAML parser for basic key-value pairs
 * Supports: strings, numbers, booleans, arrays
 *
 * @param yaml - YAML string to parse
 * @returns Parsed object
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

    // Parse array format: [item1, item2]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim());
    }
    // Parse boolean
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // Parse number
    else if (typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Update front-matter with new data
 *
 * @param content - Original markdown content
 * @param updates - Data to update/add to front-matter
 * @returns Updated markdown content
 *
 * @example
 * const updated = updateFrontMatter(content, { note_id: "abc-123", tags: ["new-tag"] });
 */
export function updateFrontMatter(
  content: string,
  updates: Record<string, unknown>
): string {
  const fm = parseFrontMatter(content);

  // Merge updates into existing data
  const newData = { ...fm.data, ...updates };

  // Generate new YAML
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
    // Replace existing front-matter
    return content.replace(/^---\n[\s\S]*?\n---\n/, newFrontMatter);
  } else {
    // Add new front-matter at the beginning
    return newFrontMatter + content;
  }
}

/**
 * Ensure a note has a unique note_id in its front-matter
 * If missing, generates and adds one
 *
 * @param content - Original markdown content
 * @param generateId - Function to generate a new note ID
 * @returns Tuple of [updated content, note_id, was_added]
 *
 * @example
 * const [newContent, noteId, added] = ensureNoteId(content, () => crypto.randomUUID());
 */
export function ensureNoteId(
  content: string,
  generateId: () => NoteId
): [string, NoteId, boolean] {
  const fm = parseFrontMatter(content);

  // Check if note_id already exists
  if (fm.data.note_id && typeof fm.data.note_id === 'string') {
    return [content, fm.data.note_id as NoteId, false];
  }

  // Generate new note_id
  const noteId = generateId();
  const updatedContent = updateFrontMatter(content, { note_id: noteId });

  return [updatedContent, noteId, true];
}

/**
 * Get the value of a specific front-matter field
 *
 * @param content - Markdown content
 * @param field - Field name to retrieve
 * @returns Field value or undefined if not found
 */
export function getFrontMatterField(content: string, field: string): unknown {
  const fm = parseFrontMatter(content);
  return fm.data[field];
}

/**
 * Extract main content (after front-matter, before HASH_BOUNDARY)
 * This is the content that should be hashed for change detection
 *
 * @param content - Full markdown content
 * @returns Main content for hashing
 */
export function extractMainContent(content: string): string {
  const fm = parseFrontMatter(content);
  let mainContent = fm.body;

  // If HASH_BOUNDARY marker exists, extract content before it
  const boundaryIndex = mainContent.indexOf('<!-- HASH_BOUNDARY -->');
  if (boundaryIndex !== -1) {
    mainContent = mainContent.slice(0, boundaryIndex);
  }

  return mainContent.trim();
}
