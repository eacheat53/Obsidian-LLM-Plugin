# Design Document: Add Recalibrate Button to Settings

## Architecture Overview

This is a **UI enhancement** with minimal architectural impact. The change adds a user interface entry point to an existing workflow.

### Current Architecture

```
Settings UI (settings-tab.ts)
  ↓
[User modifies thresholds]
  ↓
Settings auto-saved
  ↓
❌ No indication that links need recalibration
  ↓
User must manually:
  1. Close settings
  2. Click ribbon icon
  3. Select "重新校准链接" from menu
  ↓
recalibrateLinksWorkflow() executed
```

### Enhanced Architecture

```
Settings UI (settings-tab.ts)
  ↓
[User modifies thresholds]
  ↓
Settings auto-saved
  ↓
✅ "Recalibrate Links" button visible below
  ↓
[User clicks button]
  ↓
recalibrateLinksWorkflow() executed
  ↓
Success/failure Notice shown
```

## Component Interaction

### Settings Tab Enhancement

**Before**:
```
renderLinkSettings() {
  - similarity_threshold input
  - min_ai_score input
  - max_links_per_note input
  // END
}
```

**After**:
```
renderLinkSettings() {
  - similarity_threshold input
  - min_ai_score input
  - max_links_per_note input
  - <hr> separator
  - [Recalibrate Links button]  ← NEW
}
```

### Button State Machine

```
[Idle State]
├─ Text: "立即校准" / "Recalibrate Now"
├─ Enabled: true
└─ Style: CTA (blue)

[Click Event]
├─→ Text: "校准中..." / "Recalibrating..."
├─→ Enabled: false
└─→ Execute: recalibrateLinksWorkflow()

[Success]
├─→ Notice: "✅ Recalibrated N notes..."
└─→ Return to [Idle State]

[Error]
├─→ Notice: "❌ 链接校准失败..."
├─→ Console.error
└─→ Return to [Idle State]
```

## Data Flow

### User Journey

```
Step 1: User opens Settings
  ↓
Step 2: Navigate to Link Settings section
  ↓
Step 3: Modify threshold (e.g., min_ai_score: 7 → 10)
  ↓
Step 4: See "Recalibrate Links" button
  ↓
Step 5: Click button
  ↓
Step 6: Button disabled, text changes to "校准中..."
  ↓
Step 7: recalibrateLinksWorkflow() executes
  ├─ Load masterIndex
  ├─ Scan vault
  ├─ For each note:
  │   ├─ getDesiredTargetsFromScores() → filters by NEW thresholds
  │   └─ reconcileUsingLedger() → add/remove links
  └─ Save masterIndex
  ↓
Step 8: Notice shown: "✅ Recalibrated 8 notes: +0 links, -12 links"
  ↓
Step 9: Button re-enabled, text back to "立即校准"
```

### API Calls

**None**. This workflow does not call external APIs:
- ✅ Uses cached embeddings
- ✅ Uses cached scores
- ✅ Only modifies local files based on new thresholds

## UI Layout

### Settings Panel Structure

```
┌────────────────────────────────────────────────┐
│ Link Settings                                  │
├────────────────────────────────────────────────┤
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ Jina Similarity Threshold                │  │
│ │ Filter note pairs with low semantic sim. │  │
│ │ [ 0.7                              ▼▲ ]  │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ Minimum AI Score                         │  │
│ │ LLM score threshold (0-10)               │  │
│ │ [ 7                                ▼▲ ]  │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ Max Links Per Note                       │  │
│ │ Maximum suggested links per note         │  │
│ │ [ 7                                ▼▲ ]  │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ────────────────────────────────────────────  │ ← Separator
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ Recalibrate Links                        │  │
│ │ After modifying thresholds above, click  │  │
│ │ to apply new configuration. Will not     │  │
│ │ regenerate embeddings or re-score.       │  │
│ │                                           │  │
│ │                    [ Recalibrate Now ]   │  │ ← CTA button
│ └──────────────────────────────────────────┘  │
│                                                │
└────────────────────────────────────────────────┘
```

## Internationalization

### Translation Structure

```typescript
interface Translation {
  settings: {
    recalibrateLinks: {
      name: string;    // "重新校准链接" / "Recalibrate Links"
      desc: string;    // Full description
    }
  },
  buttons: {
    recalibrate: string;      // "立即校准" / "Recalibrate Now"
    recalibrating: string;    // "校准中..." / "Recalibrating..."
  }
}
```

### Language Support

| Element | English | 中文 |
|---------|---------|------|
| Setting Name | Recalibrate Links | 重新校准链接 |
| Description | After modifying the thresholds above... | 修改上述阈值后... |
| Button (Idle) | Recalibrate Now | 立即校准 |
| Button (Active) | Recalibrating... | 校准中... |

## Error Handling

### Error Scenarios

#### 1. No Scores Available
```typescript
// In recalibrateLinksWorkflow()
const scoreCount = Object.keys(masterIndex.scores || {}).length;
if (scoreCount === 0) {
  throw new Error('No scores found. Please run the main workflow first...');
}

// Caught by button onClick handler
catch (error) {
  new Notice('❌ 链接校准失败，请查看控制台错误信息');
}
```

#### 2. TaskManager Busy
```typescript
// In TaskManagerService
if (this.taskLock) {
  throw new Error('Another operation is in progress');
}

// User sees Notice from TaskManager
```

#### 3. File System Error
```typescript
// In reconcileUsingLedger()
try {
  await this.app.vault.modify(file, newContent);
} catch (error) {
  console.error('Failed to modify file:', error);
  // Continues to next file (partial success)
}
```

## Performance Considerations

### Execution Time

For a vault with 100 notes:
- **Load masterIndex**: ~50ms
- **Scan vault**: ~100ms
- **Process each note**: ~10ms × 100 = 1000ms
- **Save masterIndex**: ~50ms
- **Total**: ~1.2 seconds

### Memory Usage

- **Baseline**: ~5MB (masterIndex)
- **During execution**: +2MB (file list, temporary data)
- **Peak**: ~7MB

### UI Responsiveness

- ✅ Button disabled during operation (prevents double-click)
- ✅ Text feedback ("校准中...") shows progress
- ✅ Non-blocking (runs in background task)
- ✅ Notice shown on completion

## Comparison with Alternatives

### Alternative 1: Auto-calibrate on Settings Change

**Pros**:
- Fully automatic, zero user action

**Cons**:
- ❌ User might not want immediate calibration
- ❌ Could trigger unexpectedly while adjusting values
- ❌ No user control over timing

**Decision**: Rejected - Users should explicitly confirm

### Alternative 2: Only Sidebar Menu

**Pros**:
- Single source of truth
- No UI duplication

**Cons**:
- ❌ Poor discoverability
- ❌ Extra steps required
- ❌ No context when modifying settings

**Decision**: Rejected - Settings button provides better UX

### Alternative 3: Both Sidebar + Settings Button (Chosen)

**Pros**:
- ✅ Best of both worlds
- ✅ Discoverability in settings
- ✅ Quick access from sidebar
- ✅ User chooses preferred workflow

**Cons**:
- Minor code duplication (acceptable)

**Decision**: Accepted

## Testing Strategy

### Manual Test Cases

1. **Happy Path**
   - Modify threshold
   - Click button
   - Verify links updated

2. **Error Handling**
   - Delete masterIndex
   - Click button
   - Verify error Notice

3. **Concurrent Operations**
   - Start embedding generation
   - Try to click recalibrate button
   - Verify blocked with error message

4. **Language Switch**
   - Set language to English
   - Verify button text correct
   - Set language to Chinese
   - Verify button text correct

5. **Large Vault**
   - 500+ notes
   - Click button
   - Verify completes without hanging

### Debug Logging

When `enable_debug_logging=true`:
```
[Settings] Recalibrate button clicked
[Main] 链接校准完成:
  - 处理笔记: 14
  - 修改笔记: 8
  - 添加链接: 0
  - 删除链接: 12
  - 当前阈值: similarity>=0.7, score>=10
```

## Rollback Plan

If issues arise:
1. Remove button from settings-tab.ts (lines added in Task 1)
2. Remove i18n entries (Task 2)
3. Sidebar menu remains functional
4. **Rollback time**: < 2 minutes

No database migrations or breaking changes involved.
