# Implementation Tasks

## Task 1: Add Similarity Threshold Minimum Value Enforcement
**Estimated Time**: 15 minutes
**Priority**: High

**Implementation**:
- File: `src/ui/settings-tab.ts`
- Location: `renderLinkSettings` method, similarity_threshold setting (around line 489)
- Changes:
  1. Update `textInput.min` from `'0'` to `'0.7'`
  2. Add validation logic for values < 0.7 with warning Notice
  3. Update description to mention minimum recommended value

**Code**:
```typescript
new Setting(containerEl)
  .setName(this.tr.settings.similarityThreshold.name)
  .setDesc(this.tr.settings.similarityThreshold.desc)  // Update desc text
  .addText(text => text
    .setValue(String(this.plugin.settings.similarity_threshold))
    .onChange(async (value) => {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0.7 && num <= 1) {
        this.plugin.settings.similarity_threshold = num;
        await this.plugin.saveSettings();
      } else if (num < 0.7) {
        new Notice(this.tr.notices.similarityTooLow);
      }
    })
  )
  .then(setting => {
    const textInput = setting.controlEl.querySelector('input');
    if (textInput) {
      textInput.type = 'number';
      textInput.min = '0.7';  // Changed from '0'
      textInput.max = '1';
      textInput.step = '0.05';
    }
  });
```

**Acceptance Criteria**:
- [x] Input minimum value set to 0.7
- [x] Warning Notice shown when user enters value < 0.7
- [x] Description text updated to mention minimum
- [x] Build succeeds without errors

---

## Task 2: Add Recalibrate Button to Settings UI
**Estimated Time**: 20 minutes
**Priority**: High

**Implementation**:
- File: `src/ui/settings-tab.ts`
- Location: End of `renderLinkSettings` method (after line 558)
- Add new Setting item with button:
  ```typescript
  // 重新校准链接按钮
  new Setting(containerEl)
    .setName(this.tr.settings.recalibrateLinks?.name || '重新校准链接')
    .setDesc(this.tr.settings.recalibrateLinks?.desc || '修改上述阈值后，点击此按钮应用新配置到所有笔记。不会重新生成 embedding 或重新评分，只会根据新阈值重新插入/删除链接。')
    .addButton(button => button
      .setButtonText(this.tr.buttons?.recalibrate || '立即校准')
      .setCta()
      .onClick(async () => {
        button.setDisabled(true);
        button.setButtonText(this.tr.buttons?.recalibrating || '校准中...');
        try {
          await this.plugin.recalibrateLinksWorkflow(this.plugin.settings.default_scan_path);
        } catch (error) {
          console.error('[Settings] Recalibrate links failed:', error);
          new Notice('❌ 链接校准失败，请查看控制台错误信息');
        } finally {
          button.setDisabled(false);
          button.setButtonText(this.tr.buttons?.recalibrate || '立即校准');
        }
      })
    );
  ```

**Acceptance Criteria**:
- [x] Button added at end of link settings section
- [x] Button uses CTA style (blue, prominent)
- [x] Button disabled during calibration
- [x] Button text changes to "校准中..." during operation
- [x] Error handling with try-catch
- [x] Success/failure Notice shown to user
- [x] Build succeeds without errors

---

## Task 3: Add i18n Translations
**Estimated Time**: 15 minutes
**Priority**: High
**Dependencies**: Task 1, Task 2

**Implementation**:
- File: `src/i18n/translations.ts`
- Add translations for new strings:

```typescript
// English translations
export const en: Translation = {
  // ... existing translations
  settings: {
    // ... existing settings
    similarityThreshold: {
      name: 'Similarity Threshold',
      desc: 'Minimum cosine similarity for note pairs (minimum recommended: 0.7). Lower values significantly increase API costs by generating more candidate pairs for LLM scoring.'
    },
    recalibrateLinks: {
      name: 'Recalibrate Links',
      desc: 'After modifying the thresholds above, click this button to apply the new configuration to all notes. Will not regenerate embeddings or re-score, only re-insert/remove links based on new thresholds.'
    }
  },
  buttons: {
    // ... existing buttons
    recalibrate: 'Recalibrate Now',
    recalibrating: 'Recalibrating...'
  },
  notices: {
    // ... existing notices
    similarityTooLow: '⚠️ Values below 0.7 are not recommended: will significantly increase the number of pairs to score, wasting API tokens',
    recalibrateFailed: '❌ Link recalibration failed. Please check console for error details.'
  }
};

// Chinese translations
export const zh: Translation = {
  // ... existing translations
  settings: {
    // ... existing settings
    similarityThreshold: {
      name: 'Jina 相似度阈值',
      desc: '笔记对的最低余弦相似度（最低建议值：0.7）。更低的值会显著增加需要 LLM 评分的候选配对数量，大幅增加 API 成本。'
    },
    recalibrateLinks: {
      name: '重新校准链接',
      desc: '修改上述阈值后，点击此按钮应用新配置到所有笔记。不会重新生成 embedding 或重新评分，只会根据新阈值重新插入/删除链接。'
    }
  },
  buttons: {
    // ... existing buttons
    recalibrate: '立即校准',
    recalibrating: '校准中...'
  },
  notices: {
    // ... existing notices
    similarityTooLow: '⚠️ 不建议低于 0.7：会大幅增加需要评分的配对数量，浪费 API token',
    recalibrateFailed: '❌ 链接校准失败，请查看控制台错误信息'
  }
};
```

**Acceptance Criteria**:
- [x] English translations added
- [x] Chinese translations added
- [x] All new strings covered (settings, buttons, notices)
- [x] TypeScript types updated if needed
- [x] No hardcoded strings remain in UI code

---

## Task 4: Manual Testing
**Estimated Time**: 15 minutes
**Priority**: High
**Dependencies**: Task 1, Task 2, Task 3

**Test Scenarios**:
1. **Baseline**: Open settings, navigate to link settings
   - Verify: Recalibrate button visible at bottom
   - Verify: Similarity threshold input shows min="0.7"
2. **Similarity threshold minimum enforcement**:
   - Try to enter 0.5 in similarity_threshold input
   - Verify: Warning Notice shown: "⚠️ Values below 0.7 are not recommended..."
   - Verify: Value NOT saved to settings
   - Try to enter 0.7
   - Verify: Value accepted and saved
3. **Button click**: Click "Recalibrate Now" button
   - Verify: Button text changes to "Recalibrating..." / "校准中..."
   - Verify: Button disabled during operation
   - Verify: Success Notice shown after completion
4. **Threshold change**: Change min_ai_score from 7 to 10
   - Click recalibrate button
   - Verify: Links with score < 10 removed
5. **Error handling**: Trigger error (e.g., no scores available)
   - Verify: Error Notice shown
   - Verify: Button re-enabled after error
6. **Language switch**: Change language to English
   - Verify: Button text and description in English
   - Verify: Similarity threshold description mentions "minimum recommended: 0.7"
   - Change language to Chinese
   - Verify: All text properly localized

**Acceptance Criteria**:
- [ ] All test scenarios pass (requires manual testing)
- [ ] Similarity threshold minimum enforcement works (requires manual testing)
- [ ] Button behavior correct in all cases (requires manual testing)
- [x] No console errors (build succeeded)
- [ ] User feedback clear and timely (requires manual testing)
- [ ] i18n working for both English and Chinese (requires manual testing)

---

## Task 5: Update Documentation
**Estimated Time**: 10 minutes
**Priority**: Low

**Updates**:
- File: `CLAUDE.md`
- Section: "Common Gotchas" → "Link Threshold Filtering"
- Update example to mention settings button AND similarity threshold minimum:
  ```markdown
  ### 6. Link Threshold Filtering

  ...existing content...

  **How to apply new thresholds**:
  1. **Settings UI** (Recommended): Go to Settings → Link Settings → Click "Recalibrate Now"
  2. **Sidebar Menu**: Click ribbon icon → "重新校准链接（应用新阈值）"

  Both methods use the same underlying workflow and are instant (no API calls).

  **Similarity Threshold Behavior**:
  - **Minimum recommended**: 0.7 (enforced in Settings UI)
  - **Increasing threshold** (0.7 → 0.8): Only requires recalibration (fast)
  - **Decreasing threshold** (0.8 → 0.7): Requires force mode to re-compute similarities
  - **Warning**: Values below 0.7 significantly increase candidate pairs sent to LLM, wasting tokens
  ```

**Acceptance Criteria**:
- [x] Documentation updated
- [x] Both recalibration methods mentioned
- [x] Similarity threshold behavior explained
- [x] Clear guidance for users

---

## Dependencies Graph

```
Task 1 (Add button to settings)
  ├─→ Task 2 (Add i18n)
  ├─→ Task 3 (Add separator)
  └─→ Task 4 (Manual testing)

Task 5 (Documentation) [Independent, can run in parallel]
```

## Success Metrics

1. **Discoverability**: New users find recalibrate button immediately when modifying thresholds
2. **Ease of Use**: One click to apply new thresholds (no need to navigate to sidebar)
3. **Clarity**: Button description clearly explains what will happen
4. **Reliability**: Error handling prevents confusion when operation fails
