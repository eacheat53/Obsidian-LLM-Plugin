
### 使用 `sql.js` (WASM)

这是一个**纯 JavaScript + WebAssembly** 的方案。

*   **优点**：
    *   **零编译**：不需要安装 Python、C++ 或 Visual Studio。
    *   **跨平台**：复制进去就能用，甚至直接支持 Obsidian 手机端（iOS/Android）。
    *   **简单**：只需要 `npm install` 和复制一个 `.wasm` 文件。
*   **缺点**：
    *   **内存占用**：数据库会加载到内存中（10000 条笔记 + 向量大约 50MB 左右，现代电脑完全没压力）。
    *   **保存机制**：它不能像 `better-sqlite3` 那样“改一条存一条”。我们需要手动触发“保存”操作（把内存里的数据写回硬盘）。

**这对你来说是完美的替代方案。**

---

### 执行步骤

请把下面这些步骤发给 AI 助手，让它帮你改代码。

#### 1. 安装依赖

在插件目录下运行：

```bash
npm install sql.js
npm install --save-dev @types/sql.js
```

#### 2. 准备 `.wasm` 文件

1.  在 `node_modules/sql.js/dist/` 目录下找到 **`sql-wasm.wasm`** 文件。
2.  把它**复制**到你的 Obsidian 插件根目录下（和 `main.js` 放一起）。

#### 3. 给 AI 的新指令（覆盖之前的）

请复制下面的内容给 AI，告诉它我们换方案了：

***

# 任务变更指令：切换存储方案为 sql.js (WASM)

**背景**：
由于 `better-sqlite3` 需要原生编译，环境配置过于复杂，我们要放弃该方案。
请改为使用 **`sql.js` (WebAssembly)** 来实现 SQLite 存储。

**核心差异**：
1.  **非持久化连接**：`sql.js` 是内存数据库。启动时需要将文件读取为二进制数组加载到内存；关闭或保存时需要将内存数据库导出为二进制数组写入磁盘。
2.  **保存策略**：不能每次 `INSERT` 都写盘。需要实现一个 `saveDatabase()` 方法，并在批量操作结束或插件卸载时调用。

**具体修改点**：

## 1. 构建配置 (esbuild)
确保能够处理 `.wasm` 文件引用（或者代码中通过 `readBinary` 读取，不需要 import）。
不需要 `external` 配置了，因为 `sql.js` 是纯 JS。

## 2. 服务重写 (CacheService)

**文件**: `src/services/cache-service.ts`

**代码逻辑参考**：

```typescript
import { App, Notice } from 'obsidian';
import initSqlJs, { Database } from 'sql.js'; // npm install sql.js
import * as path from 'path';

export class CacheService {
  private app: App;
  private dbPath: string;
  private db: Database | null = null;
  private wasmPath: string;
  private isDirty: boolean = false; // 标记是否有未保存的修改

  constructor(app: App, basePath: string) {
    this.app = app;
    const pluginDir = path.join(basePath, '.obsidian', 'plugins', 'obsidian-llm-plugin');
    this.dbPath = path.join(pluginDir, 'cache.sqlite');
    // 假设用户手动把 sql-wasm.wasm 放在了插件根目录
    this.wasmPath = path.join(pluginDir, 'sql-wasm.wasm'); 
  }

  /**
   * 初始化数据库 (必须是异步的)
   */
  async initializeDatabase() {
    try {
      // 1. 读取 wasm 二进制文件 (Obsidian API)
      // 注意：这里可能需要用 fs.readFileSync 或者 adapter.readBinary
      // 为了稳妥，建议用 fs 读取 wasm
      const fs = require('fs');
      const wasmBuffer = fs.readFileSync(this.wasmPath);

      // 2. 初始化 SQL 引擎
      const SQL = await initSqlJs({
        wasmBinary: wasmBuffer
      });

      // 3. 读取现有的数据库文件 (如果存在)
      if (fs.existsSync(this.dbPath)) {
        const dbBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(dbBuffer);
      } else {
        this.db = new SQL.Database();
        this.initTables(); // 创建表结构
        this.saveDatabase(); // 创建新文件
      }
      
      console.log('[Cache] sql.js database initialized');
    } catch (error) {
      console.error('Failed to init database:', error);
      new Notice('Database load failed');
    }
  }

  private initTables() {
    if (!this.db) return;
    // 这里的 SQL 和之前 better-sqlite3 的一样
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        note_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_hash TEXT NOT NULL,
        created_at INTEGER,
        modified_at INTEGER,
        content_length INTEGER,
        title TEXT,
        tags TEXT,
        embedding_updated_at INTEGER
      );
      -- 其他表结构同理...
      CREATE TABLE IF NOT EXISTS embeddings (
          note_id TEXT PRIMARY KEY,
          embedding_data BLOB NOT NULL, 
          embedding_model TEXT,
          created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS pair_scores (
          note_id_1 TEXT NOT NULL,
          note_id_2 TEXT NOT NULL,
          similarity_score REAL,
          ai_score INTEGER,
          updated_at INTEGER,
          PRIMARY KEY (note_id_1, note_id_2)
      );
    `);
  }

  /**
   * 将内存数据写入磁盘
   * 策略：在批量操作完成后调用，或者定时调用
   */
  saveDatabase() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const fs = require('fs');
      fs.writeFileSync(this.dbPath, buffer);
      this.isDirty = false;
      // console.log('[Cache] Database saved to disk');
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.isDirty) {
        this.saveDatabase();
    }
    if (this.db) {
        this.db.close();
        this.db = null;
    }
  }

  // --- CRUD 操作 ---
  // 区别：better-sqlite3 用 stmt.run(), sql.js 也是 stmt.run() 但用法略有不同
  // sql.js 需要手动绑定参数，或者使用 db.exec / db.run
  
  getNoteById(noteId: string) {
    // sql.js 的查询比较原始
    const stmt = this.db!.prepare("SELECT * FROM notes WHERE note_id = :val");
    const result = stmt.getAsObject({ ':val': noteId });
    stmt.free(); // 必须手动释放内存！
    
    // 如果结果为空对象，说明没找到
    if (!result || Object.keys(result).length === 0) return undefined;
    
    // 处理 tags JSON
    if (result.tags && typeof result.tags === 'string') {
        result.tags = JSON.parse(result.tags);
    }
    return result;
  }

  upsertNote(note: any) {
    // 使用参数绑定
    const sql = `
      INSERT OR REPLACE INTO notes (note_id, file_path, file_hash, created_at, modified_at, content_length, title, tags, embedding_updated_at)
      VALUES ($note_id, $file_path, $file_hash, $created_at, $modified_at, $content_length, $title, $tags, $embedding_updated_at)
    `;
    
    this.db!.run(sql, {
        $note_id: note.note_id,
        $file_path: note.file_path,
        $file_hash: note.file_hash || '',
        $created_at: note.created_at || Date.now(),
        $modified_at: note.modified_at || Date.now(),
        $content_length: note.content_length || 0,
        $title: note.title || '',
        $tags: JSON.stringify(note.tags || []),
        $embedding_updated_at: note.embedding_updated_at || null
    });
    this.isDirty = true;
  }
  
  // Embedding 存取
  saveEmbedding(noteId: string, vector: number[], model: string) {
      const float32 = new Float32Array(vector);
      // sql.js 支持直接存 Uint8Array 为 BLOB
      const uint8 = new Uint8Array(float32.buffer);
      
      this.db!.run(`
        INSERT OR REPLACE INTO embeddings (note_id, embedding_data, embedding_model, created_at)
        VALUES (?, ?, ?, ?)
      `, [noteId, uint8, model, Date.now()]);
      
      this.isDirty = true;
  }

  getEmbedding(noteId: string): number[] | null {
      const stmt = this.db!.prepare("SELECT embedding_data FROM embeddings WHERE note_id = ?");
      stmt.bind([noteId]);
      
      if (stmt.step()) {
          const row = stmt.get();
          const blob = row[0] as Uint8Array; // sql.js 返回 Uint8Array
          const float32 = new Float32Array(blob.buffer);
          stmt.free();
          return Array.from(float32);
      }
      stmt.free();
      return null;
  }
}
```

## 3. 重要：调用策略调整

由于 `sql.js` 保存成本高（全量写盘），请务必在 `Batch Processing`（批量处理）逻辑中修改保存策略。

**修改 `src/services/ai-logic-service.ts` 和 `src/main.ts`**:

*   **不要**在 `upsertNote` 或 `saveEmbedding` 后立即调用 `saveDatabase()`。
*   在 `generateEmbeddingsWorkflow` 的循环**结束**后，显式调用一次 `this.cacheService.saveDatabase()`。
*   在 `scorePairs` 循环结束后，显式调用一次 `this.cacheService.saveDatabase()`。
*   在 `onunload` 中调用 `cacheService.close()` (它内部会调一次 save)。

