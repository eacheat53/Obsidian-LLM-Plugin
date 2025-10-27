# Proposal: Refine Workflow Logic

## Overview

优化 `generateEmbeddingsWorkflow` 的处理逻辑，修复 `changedNoteIds` 管理、失败重试、以及状态一致性问题，确保在各种边缘情况下（内容修改、API 失败、用户取消）都能正确处理。

## Problem Statement

当前实现存在以下问题：

### 1. **changedNoteIds 包含失败的笔记**
**问题**：
- 笔记内容变更后，即使 embedding 生成失败，也会被添加到 `changedNoteIds`
- 这些笔记参与相似度计算时会因缺少 embedding 而被跳过
- 导致 scoring/linking 逻辑基于不完整的数据

**影响**：
- 失败的笔记不会与其他笔记建立链接关系
- 但 `changedNoteIds` 仍包含它们，逻辑混乱

### 2. **失败笔记重试逻辑冗余**
**问题**：
- Lines 208-226 手动遍历失败操作提取 embedding 失败的 noteIds
- 实际上 `failureLogService.getFailedNoteIds()` 已经提供了此功能

**影响**：
- 代码冗余，维护成本高
- 逻辑重复，容易出错

### 3. **标签生成前未验证 embedding 存在**
**问题**：
- 标签生成逻辑现在独立于 `changedNoteIds`，这是正确的
- 但没有验证笔记是否有 embedding 就尝试生成标签

**影响**：
- 如果笔记没有 embedding，生成的标签基于不完整的语义理解
- 应该只为有 embedding 的笔记生成标签

### 4. **状态一致性问题**
**场景**：
1. 笔记内容修改，`needsUpdate = true`
2. Embedding API 调用失败
3. `changedNoteIds.add(noteId)` 已执行（line 269，在 try 块外）
4. 结果：笔记在 `changedNoteIds` 中，但没有 embedding

**影响**：
- 相似度计算时跳过该笔记（因为没有 embedding）
- 但逻辑上认为它"已更改"

## Goals

1. **精确的 changedNoteIds 管理**：只包含成功生成 embedding 的笔记
2. **简化失败重试逻辑**：使用 `failureLogService` 提供的 API
3. **增强标签生成验证**：只为有 embedding 的笔记生成标签
4. **确保状态一致性**：无论成功、失败、取消，都保持数据一致

## Proposed Solution

### 1. 移动 `changedNoteIds.add()` 到成功路径

**当前代码**（有问题）：
```typescript
if (needsUpdate || !existingNote) {
  changedNoteIds.add(noteId);  // ❌ 在 try 外，失败也会添加

  try {
    // Generate embedding
    await saveEmbedding(...);
    await saveMasterIndex(...);
  } catch (error) {
    // Record failure
  }
}
```

**优化后**：
```typescript
if (needsUpdate || !existingNote) {
  try {
    // Generate embedding
    await saveEmbedding(...);
    await saveMasterIndex(...);

    changedNoteIds.add(noteId);  // ✅ 只在成功后添加
  } catch (error) {
    // Record failure
  }
}
```

### 2. 简化失败重试逻辑

**当前代码**（冗余）：
```typescript
let failedNoteIds = await this.failureLogService.getFailedNoteIds(true);
const embeddingFailures = await this.failureLogService.getUnresolvedFailures();
const embeddingFailedIds = new Set<NoteId>();
for (const op of embeddingFailures) {
  if (op.operation_type === 'embedding') {
    for (const item of op.batch_info.items) {
      embeddingFailedIds.add(item as NoteId);
    }
  }
}
failedNoteIds = embeddingFailedIds;
```

**优化后**：
```typescript
// 在 FailureLogService 中添加方法
async getFailedNoteIdsByType(operationType: FailedOperationType): Promise<Set<NoteId>>

// 调用
const failedNoteIds = await this.failureLogService.getFailedNoteIdsByType('embedding');
```

### 3. 标签生成前验证 embedding

**优化后**：
```typescript
const notesNeedingTags = new Set<NoteId>();

for (const [noteId, metadata] of Object.entries(masterIndex.notes)) {
  // ✅ 只为有 embedding 且需要标签的笔记生成
  if (!metadata.tags_generated_at) {
    const hasEmbedding = await this.cacheService.loadEmbedding(noteId);
    if (hasEmbedding.success) {
      notesNeedingTags.add(noteId as NoteId);
    }
  }
}
```

### 4. 增强日志和调试信息

**添加详细日志**：
```typescript
console.log(`[Main] 处理统计:
  - 总笔记: ${files.length}
  - 跳过（hash 未变）: ${skippedCount}
  - 成功生成 embedding: ${newEmbeddingsCount}
  - 失败: ${failedCount}
  - changedNoteIds: ${changedNoteIds.size}
`);
```

## Success Criteria

1. ✅ `changedNoteIds` 只包含成功生成 embedding 的笔记
2. ✅ 失败重试逻辑简化为单个 API 调用
3. ✅ 标签只为有 embedding 的笔记生成
4. ✅ 所有状态变更都在成功路径中
5. ✅ 增强的调试日志

## Non-Goals

- 不修改 failure log 的核心架构
- 不改变 embedding/scoring/tagging 的 API 接口
- 不优化性能（这是逻辑正确性修复）

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 修改 `changedNoteIds` 添加位置可能影响现有逻辑 | Medium | 仔细审查所有使用 `changedNoteIds` 的地方 |
| 新增 embedding 验证可能影响性能 | Low | 只在标签生成时验证，频率低 |
| 日志过多可能影响可读性 | Low | 使用 debug_logging 开关控制 |

## Timeline Estimate

- **实现**: 2-3 hours
- **测试**: 1 hour
- **Total**: 3-4 hours
