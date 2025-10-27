# Proposal: Fix Link Threshold Filtering

## Overview

修复链接插入服务（LinkInjectorService）在确定需要插入的链接时，未按照当前用户配置的阈值（`min_ai_score` 和 `similarity_threshold`）进行过滤的问题。这导致用户修改阈值后，旧的低分链接仍然保留在笔记中。

## Problem Statement

### 当前行为

`LinkInjectorService._listTargetsFromPairs` 方法的实现：

```typescript
private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
  const seen = new Set<NoteId>();
  const unique: NotePairScore[] = [];
  for (const p of relevant) {
    if (!seen.has(p.note_id_2)) { seen.add(p.note_id_2); unique.push(p); }
  }
  unique.sort((a,b)=> b.ai_score - a.ai_score);  // 只排序
  return unique.slice(0, this.settings.max_links_per_note).map(p=>p.note_id_2);  // 取前 N 个
}
```

**问题**：
- 只按 `ai_score` 降序排序
- 只取前 `max_links_per_note` 个（默认 7）
- **没有过滤 `score < min_ai_score` 的配对**
- **没有过滤 `similarity_score < similarity_threshold` 的配对**

### 具体场景

#### 场景 1：用户修改阈值（从 7 改为 8）

```
笔记 A 有 5 个缓存的链接配对：
- Note B: ai_score=9, similarity=0.85
- Note C: ai_score=8, similarity=0.80
- Note D: ai_score=7, similarity=0.75  ← 旧阈值评分
- Note E: ai_score=7, similarity=0.72  ← 旧阈值评分
- Note F: ai_score=6, similarity=0.70  ← 旧阈值评分

用户将 min_ai_score 从 7 改为 8 后运行工作流（智能模式）：

1. 笔记 A 内容未变 → 不重新评分
2. getDesiredTargetsFromScores 取所有相关配对（5 个）
3. _listTargetsFromPairs：
   - 排序：B(9) > C(8) > D(7) > E(7) > F(6)
   - 取前 7 个（max_links_per_note=7）：全部 5 个
   - ❌ BUG: D、E、F (score=7,6) 不应保留！

结果：应删除的低分链接（score < 8）仍然存在
```

#### 场景 2：用户修改相似度阈值

```
用户将 similarity_threshold 从 0.7 改为 0.75：

笔记 A 有配对：
- Note X: ai_score=8, similarity=0.72  ← 低于新阈值 0.75

智能模式运行：
- 内容未变 → 不重新计算相似度
- _listTargetsFromPairs 不检查 similarity_threshold
- ❌ BUG: Note X 链接保留（应删除）
```

### 影响

1. **用户困惑**：修改阈值后运行工作流，期望低分链接被删除，但实际没有
2. **数据不一致**：配置的阈值与实际显示的链接不匹配
3. **唯一解决方法**：强制模式 + 清理缓存（用户体验差）

## Goals

1. **正确应用阈值**：`_listTargetsFromPairs` 必须过滤 `score < min_ai_score` 和 `similarity < similarity_threshold` 的配对
2. **配置生效即时**：用户修改阈值后，下次运行工作流即生效（智能模式）
3. **向后兼容**：不影响现有 API 签名和调用方

## Proposed Solution

### 修改 `_listTargetsFromPairs` 方法

在排序前添加阈值过滤：

```typescript
private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
  // ✅ 先按阈值过滤（新增）
  const filtered = relevant.filter(p =>
    p.similarity_score >= this.settings.similarity_threshold &&
    p.ai_score >= this.settings.min_ai_score
  );

  // 去重
  const seen = new Set<NoteId>();
  const unique: NotePairScore[] = [];
  for (const p of filtered) {  // 使用 filtered 替代 relevant
    if (!seen.has(p.note_id_2)) { seen.add(p.note_id_2); unique.push(p); }
  }

  // 排序并取前 N 个
  unique.sort((a,b)=> b.ai_score - a.ai_score);
  return unique.slice(0, this.settings.max_links_per_note).map(p=>p.note_id_2);
}
```

### 为什么这样修复？

1. **一致性**：与 `AILogicService.filterByThresholds` 使用相同的过滤逻辑
2. **简单性**：只修改一个方法，影响范围小
3. **正确性**：确保显示的链接始终符合当前配置的阈值
4. **性能**：O(n) 过滤，几乎无性能影响（链接数量通常 < 100）

### 边缘情况处理

#### 情况 1：过滤后没有链接
```typescript
const filtered = relevant.filter(...);  // 结果：[]
// 返回空数组 []
// reconcileUsingLedger 会删除所有旧链接
```

#### 情况 2：过滤后链接数 < max_links_per_note
```typescript
const filtered = [A, B, C];  // 只有 3 个符合阈值
// 返回这 3 个，不会因为"不够 7 个"而降低标准
```

## Success Criteria

1. ✅ 用户修改 `min_ai_score` 从 7 到 8 后，运行工作流，所有 score < 8 的链接被删除
2. ✅ 用户修改 `similarity_threshold` 从 0.7 到 0.75 后，运行工作流，所有相似度 < 0.75 的链接被删除
3. ✅ 新生成的链接始终符合当前配置的阈值
4. ✅ 智能模式和强制模式都正确应用阈值
5. ✅ TypeScript 编译无错误

## Non-Goals

- 不修改阈值过滤的逻辑（仍然是 AND 关系：similarity >= threshold AND score >= min_score）
- 不添加新的配置项
- 不修改 API 签名（保持向后兼容）
- 不修改 `AILogicService.filterByThresholds`（已经正确）

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 修改后过滤过于严格，删除了不该删除的链接 | Medium | 使用与 `filterByThresholds` 完全相同的过滤逻辑，确保一致性 |
| 用户期望保留"接近阈值"的链接 | Low | 文档明确说明阈值是严格边界，score < threshold 一律不显示 |
| 性能影响 | Low | 过滤操作 O(n)，n 通常 < 100，影响可忽略 |

## Timeline Estimate

- **实现**: 15 minutes
- **测试**: 15 minutes
- **文档**: 10 minutes
- **Total**: 40 minutes
