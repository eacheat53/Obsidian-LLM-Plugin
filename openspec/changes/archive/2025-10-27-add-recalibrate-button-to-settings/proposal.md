# Proposal: Add Recalibrate Button to Settings

## Overview

在设置界面的链接相关配置部分，添加"重新校准链接"按钮，让用户修改阈值（`similarity_threshold`、`min_ai_score`、`max_links_per_note`）后，可以立即应用新配置而无需手动导航到侧边栏菜单。

## Problem Statement

### 当前用户体验问题

**场景**：用户在设置界面修改了链接阈值

```
1. 用户打开设置 → 链接设置部分
2. 修改 min_ai_score 从 7 到 10
3. 保存设置（自动保存）
4. ❌ 链接没有更新（需要重新校准）
5. 用户需要：
   - 关闭设置界面
   - 点击侧边栏 Ribbon 图标
   - 选择"重新校准链接"菜单项
6. ✅ 链接更新完成
```

**问题**：
1. **操作步骤多**：需要 3 步才能应用新阈值
2. **用户困惑**：修改设置后不知道需要手动触发校准
3. **发现性差**：新用户不知道侧边栏有"重新校准链接"功能

### 当前实现

**Settings Tab** (`src/ui/settings-tab.ts:485-559`)：
- 3 个阈值设置：`similarity_threshold`、`min_ai_score`、`max_links_per_note`
- 修改后自动保存（`await this.plugin.saveSettings()`）
- **没有提示**用户需要重新校准链接

**Sidebar Menu** (`src/ui/sidebar-menu.ts:56-68`)：
- 提供"重新校准链接"菜单项
- 调用 `recalibrateLinksWorkflow`
- **但用户可能不知道**这个功能的存在

## Goals

1. **降低操作复杂度**：在设置界面直接提供"重新校准链接"按钮
2. **提高可发现性**：用户在修改阈值的地方就能看到如何应用新配置
3. **提供清晰提示**：说明修改阈值后需要重新校准链接

## Proposed Solution

### 方案 1：在设置界面添加"重新校准链接"按钮

在链接设置部分（`renderLinkSettings`）的最后，添加一个独立的 Setting 项：

```typescript
// 在 similarity_threshold、min_ai_score、max_links_per_note 设置之后

// 重新校准链接按钮
new Setting(containerEl)
  .setName(this.tr.settings.recalibrateLinks.name)
  .setDesc(this.tr.settings.recalibrateLinks.desc)
  .addButton(button => button
    .setButtonText(this.tr.buttons.recalibrate)
    .setCta()  // Call-to-action 样式（蓝色）
    .onClick(async () => {
      button.setDisabled(true);
      button.setButtonText(this.tr.buttons.recalibrating);
      try {
        await this.plugin.recalibrateLinksWorkflow(this.plugin.settings.default_scan_path);
      } catch (error) {
        console.error('[Settings] Recalibrate links failed:', error);
        const errorMsg = this.tr.notices?.recalibrateFailed || '❌ 链接校准失败，请查看控制台错误信息';
        new Notice(errorMsg);
      } finally {
        button.setDisabled(false);
        button.setButtonText(this.tr.buttons.recalibrate);
      }
    })
  );
```

**注意**: 所有字符串使用 i18n，遵循项目约定（见 `openspec/project.md`）。

### 方案 2：在 similarity_threshold 设置中添加警告说明

更新 `similarity_threshold` 设置的描述，明确说明最低建议值：

```typescript
new Setting(containerEl)
  .setName(this.tr.settings.similarityThreshold.name)
  .setDesc(this.tr.settings.similarityThreshold.desc)  // 更新描述文本
  .addText(text => text
    .setValue(String(this.plugin.settings.similarity_threshold))
    .onChange(async (value) => {
      const num = parseFloat(value);
      // ✅ 添加最低值限制
      if (!isNaN(num) && num >= 0.7 && num <= 1) {
        this.plugin.settings.similarity_threshold = num;
        await this.plugin.saveSettings();
      } else if (num < 0.7) {
        // ⚠️ 显示警告
        const warningMsg = this.tr.notices?.similarityTooLow ||
          '⚠️ 不建议低于 0.7：会大幅增加需要评分的配对数量，浪费 API token';
        new Notice(warningMsg);
      }
    })
  )
  .then(setting => {
    const textInput = setting.controlEl.querySelector('input');
    if (textInput) {
      textInput.type = 'number';
      textInput.min = '0.7';  // ✅ 改为 0.7（之前是 0）
      textInput.max = '1';
      textInput.step = '0.05';
    }
  });
```

**关键变更**：
1. `textInput.min = '0.7'`（之前是 `'0'`）
2. 添加 `num < 0.7` 警告逻辑
3. 更新描述文本说明最低建议值

### 视觉效果

```
┌─────────────────────────────────────────────────┐
│ 链接设置                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ Jina 相似度阈值                                  │
│ 用于过滤语义相似度较低的笔记对                    │
│ [0.7          ]                                 │
│                                                 │
│ 最低 AI 分数                                     │
│ LLM 评分的最低阈值（0-10）                        │
│ [7            ]                                 │
│                                                 │
│ 每个笔记的最大链接数                              │
│ 每个笔记插入的最大建议链接数量                     │
│ [7            ]                                 │
│                                                 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                 │
│ 重新校准链接                                     │
│ 修改上述阈值后，点击此按钮应用新配置到所有笔记。   │
│ 不会重新生成 embedding 或重新评分，只会根据新阈   │
│ 值重新插入/删除链接。                            │
│                                         [立即校准] │ ← 蓝色按钮
│                                                 │
└─────────────────────────────────────────────────┘
```

### 优势

1. **即时反馈**：修改阈值 → 点击按钮 → 立即看到结果
2. **上下文感知**：按钮就在阈值设置旁边，用户自然知道作用
3. **清晰说明**：描述文字解释了不会重新调用 API（打消用户顾虑）
4. **视觉提示**：CTA 样式（蓝色）表明这是重要操作
5. **保留现有功能**：侧边栏菜单项保持不变，提供备选入口

## Success Criteria

1. ✅ 设置界面链接部分显示"重新校准链接"按钮
2. ✅ 按钮说明清楚解释了功能和影响范围
3. ✅ 点击按钮后调用 `recalibrateLinksWorkflow`
4. ✅ 按钮在校准期间显示"校准中..."并禁用
5. ✅ 校准完成后显示成功/失败通知
6. ✅ 按钮文字支持中英文国际化

## Non-Goals

- 不自动校准（避免用户意外触发耗时操作）
- 不移除侧边栏菜单项（保留备选入口）
- 不添加"撤销"功能（链接校准是幂等操作）
- 不监听设置变化自动触发（用户应主动确认）

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 用户点击按钮时插件正在执行其他任务 | Medium | TaskManager 已有互斥锁，会显示错误提示 |
| 按钮文字不够清晰，用户不理解作用 | Low | 提供详细描述，明确说明不会调用 API |
| 校准失败但用户不知道 | Low | 使用 try-catch 捕获错误，显示 Notice |

## Timeline Estimate

- **实现**: 20 minutes
- **测试**: 10 minutes
- **i18n**: 10 minutes
- **Total**: 40 minutes
