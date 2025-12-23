/**
 * Obsidian API Mock
 * 用于测试不依赖真实 Obsidian 环境的代码
 */

import { vi } from 'vitest';

// ============== TFile Mock ==============
export class TFile {
    path: string;
    basename: string;
    extension: string;
    name: string;

    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.extension = this.name.includes('.') ? this.name.split('.').pop()! : '';
        this.basename = this.name.replace(/\.[^/.]+$/, '');
    }
}

// ============== TFolder Mock ==============
export class TFolder {
    path: string;
    name: string;

    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() || '';
    }
}

// ============== TAbstractFile Mock ==============
export class TAbstractFile {
    path: string;
    name: string;

    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() || '';
    }
}

// ============== Vault Mock ==============
export class Vault {
    private files: Map<string, string> = new Map();

    read = vi.fn(async (file: TFile): Promise<string> => {
        return this.files.get(file.path) || '';
    });

    modify = vi.fn(async (file: TFile, content: string): Promise<void> => {
        this.files.set(file.path, content);
    });

    process = vi.fn(async (file: TFile, fn: (content: string) => string): Promise<void> => {
        const content = this.files.get(file.path) || '';
        const newContent = fn(content);
        this.files.set(file.path, newContent);
    });

    getMarkdownFiles = vi.fn((): TFile[] => {
        return Array.from(this.files.keys())
            .filter(path => path.endsWith('.md'))
            .map(path => new TFile(path));
    });

    getAbstractFileByPath = vi.fn((path: string): TFile | null => {
        if (this.files.has(path)) {
            return new TFile(path);
        }
        return null;
    });

    // 测试辅助方法
    _setFileContent(path: string, content: string): void {
        this.files.set(path, content);
    }

    _getFileContent(path: string): string | undefined {
        return this.files.get(path);
    }

    _clear(): void {
        this.files.clear();
    }
}

// ============== Workspace Mock ==============
export class Workspace {
    private activeFile: TFile | null = null;

    getActiveFile = vi.fn((): TFile | null => {
        return this.activeFile;
    });

    // 测试辅助方法
    _setActiveFile(file: TFile | null): void {
        this.activeFile = file;
    }
}

// ============== App Mock ==============
export class App {
    vault: Vault;
    workspace: Workspace;

    constructor() {
        this.vault = new Vault();
        this.workspace = new Workspace();
    }
}

// ============== Notice Mock ==============
export class Notice {
    message: string;

    constructor(message: string, _duration?: number) {
        this.message = message;
    }
}

// ============== Plugin Mock ==============
export class Plugin {
    app: App;
    manifest: PluginManifest;

    constructor(app: App, manifest: PluginManifest) {
        this.app = app;
        this.manifest = manifest;
    }

    loadData = vi.fn(async () => ({}));
    saveData = vi.fn(async () => { });
}

// ============== PluginManifest Mock ==============
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    description: string;
    author: string;
    authorUrl?: string;
}

// ============== 工厂函数 ==============
export function createMockApp(): App {
    return new App();
}

export function createMockTFile(path: string): TFile {
    return new TFile(path);
}
