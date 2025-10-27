# Capability: Settings UI Enhancement for Link Recalibration

## Overview

在设置界面的链接配置部分添加"重新校准链接"按钮，让用户修改阈值后能够立即应用新配置，无需导航到侧边栏菜单。

## ADDED Requirements

### Requirement: Settings UI MUST Provide Recalibrate Button

The Link Settings section in the Settings Tab MUST include a "Recalibrate Links" button that allows users to immediately apply threshold changes to all notes without regenerating embeddings or re-scoring.

#### Scenario: User modifies threshold and clicks recalibrate button

**Given**:
- User is in Settings → Link Settings section
- Current thresholds: min_ai_score=7, similarity_threshold=0.7
- Vault has 14 notes with existing links

**When**:
- User changes min_ai_score from 7 to 10
- User clicks "Recalibrate Now" button at bottom of Link Settings

**Then**:
- Button text changes to "Recalibrating..." / "校准中..."
- Button is disabled during operation
- `recalibrateLinksWorkflow()` is called with default_scan_path
- Links with score < 10 are removed from notes
- Links with score >= 10 are retained
- Success Notice shown: "✅ Recalibrated N notes: +X links, -Y links"
- Button re-enabled with text "Recalibrate Now" / "立即校准"

**Validation**:
- Button appears at end of Link Settings section
- Button uses CTA style (prominent blue)
- Operation completes without errors
- Console shows debug log (if enabled)

---

#### Scenario: Recalibrate with no scores available

**Given**:
- User is in Settings
- masterIndex.scores is empty (no scores generated yet)

**When**:
- User clicks "Recalibrate Now" button

**Then**:
- Error Notice shown: Contains "No scores found"
- Button re-enabled after error
- Console shows error message

**Validation**:
- User understands they need to run main workflow first
- Button does not hang or stay disabled

---

#### Scenario: Recalibrate while another task is running

**Given**:
- User started embedding generation workflow
- Task is in progress

**When**:
- User opens Settings
- User clicks "Recalibrate Now" button

**Then**:
- TaskManager detects lock
- Error Notice shown: "Another operation is in progress"
- Button re-enabled immediately

**Validation**:
- Operations are mutually exclusive
- No race conditions or data corruption

---

#### Scenario: Button text respects language setting

**Given**:
- Plugin language setting can be "en" or "zh"

**When**:
- Language is "en"

**Then**:
- Button text (idle): "Recalibrate Now"
- Button text (active): "Recalibrating..."
- Setting name: "Recalibrate Links"
- Description in English

**When**:
- Language is "zh"

**Then**:
- Button text (idle): "立即校准"
- Button text (active): "校准中..."
- Setting name: "重新校准链接"
- Description in Chinese

**Validation**:
- All text properly internationalized
- No hardcoded strings in UI code

---

### Requirement: Button Description MUST Clearly Explain Operation

The button's description text MUST explicitly state that the operation will not regenerate embeddings or re-score, only re-insert/remove links based on new thresholds.

#### Scenario: User reads button description before clicking

**Given**:
- User is viewing Link Settings section

**When**:
- User reads the description below "Recalibrate Links" setting

**Then**:
- Description states: "After modifying the thresholds above, click this button to apply the new configuration to all notes."
- Description states: "Will not regenerate embeddings or re-score, only re-insert/remove links based on new thresholds."
- User understands no API calls will be made
- User understands operation is fast and safe

**Validation**:
- Description is clear and accurate
- Matches actual behavior of recalibrateLinksWorkflow()
- Reduces user anxiety about API costs

---

### Requirement: Button State MUST Reflect Operation Progress

The button MUST show visual feedback during operation by changing text and disabled state.

#### Scenario: Button state transitions during operation

**Given**:
- Button is in idle state

**When**:
- User clicks button

**Then**:
- Immediately:
  - button.setDisabled(true)
  - button.setButtonText("Recalibrating..." or "校准中...")
- During operation:
  - Button remains disabled
  - Button text remains "Recalibrating..."
- After completion (success or error):
  - button.setDisabled(false)
  - button.setButtonText("Recalibrate Now" or "立即校准")

**Validation**:
- State transitions are immediate and visible
- User cannot double-click button
- Clear feedback that operation is in progress

---

### Requirement: Visual Separation MUST Distinguish Button from Settings

A visual separator (horizontal rule) MUST be added before the recalibrate button to distinguish it from the threshold settings above.

#### Scenario: User sees clear visual separation

**Given**:
- User is viewing Link Settings section

**When**:
- User scrolls to bottom of section

**Then**:
- Horizontal rule (separator) visible before "Recalibrate Links" button
- Clear visual distinction between:
  - Settings inputs (threshold sliders)
  - Action button (recalibrate)

**Validation**:
- Separator present in DOM
- Consistent with Obsidian's design patterns
- Improves visual hierarchy

---

## Modified Requirements

### Requirement: Settings Tab Link Section MUST Include Recalibrate Action

The `renderLinkSettings()` method MUST be extended to include a recalibrate button after all threshold settings.

#### Scenario: Settings tab renders with all components

**Given**:
- User opens plugin settings

**When**:
- Settings tab loads
- Link settings section rendered

**Then**:
- Section contains (in order):
  1. similarity_threshold input
  2. min_ai_score input
  3. max_links_per_note input
  4. Horizontal separator
  5. Recalibrate Links button

**Validation**:
- All 5 components present
- Order is correct
- No layout issues or overlaps
