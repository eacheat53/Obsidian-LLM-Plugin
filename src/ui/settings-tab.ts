/**
 * 插件配置的设置选项卡 UI
 * 实现包含所有可配置参数的综合设置面板
 * 支持中英文
 */

import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import ObsidianLLMPlugin from '../main';
import { DEFAULT_SCORING_PROMPT, DEFAULT_TAGGING_PROMPT, DEFAULT_SETTINGS } from '../plugin-settings';
import { LLMProvider } from '../types/api-types';
import { t, Translation } from '../i18n/translations';

/**
 * 确认对话框模态框
 */
class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private confirmText: string;
  private placeholder: string;
  private onConfirm: () => void;

  constructor(
    app: App,
    title: string,
    message: string,
    confirmText: string,
    placeholder: string,
    onConfirm: () => void
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmText = confirmText;
    this.placeholder = placeholder;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: this.title });

    // 显示消息
    const messageEl = contentEl.createDiv({ cls: 'modal-content' });
    messageEl.style.whiteSpace = 'pre-wrap';
    messageEl.style.marginBottom = '20px';
    messageEl.textContent = this.message;

    // 输入框
    let inputValue = '';
    const inputContainer = contentEl.createDiv({ cls: 'modal-input-container' });
    const input = inputContainer.createEl('input', {
      type: 'text',
      placeholder: this.placeholder,
    });
    input.style.width = '100%';
    input.style.marginBottom = '20px';

    input.addEventListener('input', (e) => {
      inputValue = (e.target as HTMLInputElement).value;
    });

    // 按钮容器
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';

    // 取消按钮
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    // 确认按钮
    const confirmButton = buttonContainer.createEl('button', {
      text: this.confirmText,
      cls: 'mod-warning',
    });
    confirmButton.addEventListener('click', () => {
      if (inputValue === this.confirmText) {
        this.close();
        this.onConfirm();
      } else {
        new Notice(`Please type "${this.confirmText}" to confirm`);
      }
    });

    // 回车确认
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmButton.click();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // 聚焦到输入框
    input.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 自定义提供商编辑模态框
 */
class CustomProviderModal extends Modal {
  private language: 'en' | 'zh';
  private existingProvider: import('../plugin-settings').CustomProviderConfig | null;
  private onSave: (provider: import('../plugin-settings').CustomProviderConfig) => Promise<void>;

  private nameInput: HTMLInputElement | null = null;
  private urlInput: HTMLInputElement | null = null;
  private keyInput: HTMLInputElement | null = null;
  private modelInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    language: 'en' | 'zh',
    existingProvider: import('../plugin-settings').CustomProviderConfig | null,
    onSave: (provider: import('../plugin-settings').CustomProviderConfig) => Promise<void>
  ) {
    super(app);
    this.language = language;
    this.existingProvider = existingProvider;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const isEdit = !!this.existingProvider;
    const title = this.language === 'zh'
      ? (isEdit ? '编辑自定义提供商' : '添加自定义提供商')
      : (isEdit ? 'Edit Custom Provider' : 'Add Custom Provider');

    contentEl.createEl('h2', { text: title });

    // 名称
    const nameLabel = contentEl.createDiv({ cls: 'setting-item' });
    nameLabel.createEl('div', {
      text: this.language === 'zh' ? '名称' : 'Name',
      cls: 'setting-item-name'
    });
    this.nameInput = nameLabel.createEl('input', {
      type: 'text',
      placeholder: this.language === 'zh' ? '如: 我的 OpenRouter' : 'e.g., My OpenRouter',
      value: this.existingProvider?.name || ''
    });
    this.nameInput.style.width = '100%';
    this.nameInput.style.marginTop = '5px';

    // API URL
    const urlLabel = contentEl.createDiv({ cls: 'setting-item', attr: { style: 'margin-top: 15px;' } });
    urlLabel.createEl('div', {
      text: 'API URL',
      cls: 'setting-item-name'
    });
    urlLabel.createEl('div', {
      text: this.language === 'zh' ? 'OpenAI 兼容的 API 端点' : 'OpenAI-compatible API endpoint',
      cls: 'setting-item-description',
      attr: { style: 'font-size: 0.85em; opacity: 0.7;' }
    });
    this.urlInput = urlLabel.createEl('input', {
      type: 'text',
      placeholder: 'https://api.example.com/v1',
      value: this.existingProvider?.api_url || ''
    });
    this.urlInput.style.width = '100%';
    this.urlInput.style.marginTop = '5px';

    // API Key
    const keyLabel = contentEl.createDiv({ cls: 'setting-item', attr: { style: 'margin-top: 15px;' } });
    keyLabel.createEl('div', {
      text: 'API Key',
      cls: 'setting-item-name'
    });
    keyLabel.createEl('div', {
      text: this.language === 'zh' ? '留空如果不需要' : 'Leave empty if not required',
      cls: 'setting-item-description',
      attr: { style: 'font-size: 0.85em; opacity: 0.7;' }
    });
    this.keyInput = keyLabel.createEl('input', {
      type: 'password',
      placeholder: 'sk-...',
      value: this.existingProvider?.api_key || ''
    });
    this.keyInput.style.width = '100%';
    this.keyInput.style.marginTop = '5px';

    // Model Name
    const modelLabel = contentEl.createDiv({ cls: 'setting-item', attr: { style: 'margin-top: 15px;' } });
    modelLabel.createEl('div', {
      text: this.language === 'zh' ? '模型名称' : 'Model Name',
      cls: 'setting-item-name'
    });
    this.modelInput = modelLabel.createEl('input', {
      type: 'text',
      placeholder: 'gpt-4o-mini',
      value: this.existingProvider?.model_name || ''
    });
    this.modelInput.style.width = '100%';
    this.modelInput.style.marginTop = '5px';

    // 按钮
    const buttonContainer = contentEl.createDiv({ attr: { style: 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;' } });

    const cancelBtn = buttonContainer.createEl('button', {
      text: this.language === 'zh' ? '取消' : 'Cancel'
    });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', {
      text: this.language === 'zh' ? '保存' : 'Save',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', async () => {
      const name = this.nameInput?.value.trim() || '';
      const url = this.urlInput?.value.trim() || '';
      const key = this.keyInput?.value || '';
      const model = this.modelInput?.value.trim() || '';

      if (!name || !url || !model) {
        new Notice(this.language === 'zh'
          ? '请填写名称、API URL 和模型名称'
          : 'Please fill in Name, API URL, and Model Name');
        return;
      }

      await this.onSave({
        id: this.existingProvider?.id || '',
        name,
        api_url: url,
        api_key: key,
        model_name: model
      });
      this.close();
    });

    // 聚焦到名称输入框
    this.nameInput?.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 设置选项卡类
 */
export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianLLMPlugin;

  constructor(app: App, plugin: ObsidianLLMPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * 根据语言设置获取当前的翻译对象
   */
  private get tr(): Translation {
    return t(this.plugin.settings.language);
  }

  /**
   * 显示设置面板
   */
  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    // 主标题
    containerEl.createEl('h1', { text: this.tr.sections.main });

    // 语言选择（在顶部）
    this.renderLanguageSelection(containerEl);

    // Jina AI Linker 设置部分
    this.renderJinaSettings(containerEl);

    // AI 智能评分配置部分
    this.renderAIScoringSettings(containerEl);

    // 处理参数部分
    this.renderProcessingSettings(containerEl);

    // 链接插入设置部分
    this.renderLinkSettings(containerEl);

    // AI 评分提示设置部分
    this.renderScoringPromptSettings(containerEl);

    // AI 标签生成设置部分
    this.renderTaggingPromptSettings(containerEl);

    // AI 批量处理参数部分
    this.renderBatchProcessingSettings(containerEl);

    // 性能和调试部分
    this.renderPerformanceSettings(containerEl);
  }

  /**
   * 验证 API 密钥（非空检查）
   */
  private validateAPIKey(key: string, fieldName: string): boolean {
    if (!key || key.trim().length === 0) {
      new Notice(`⚠️ ${fieldName} 不能为空。请输入有效的 API 密钥。`);
      return false;
    }
    return true;
  }

  /**
   * 验证路径格式
   */
  private validatePath(path: string): boolean {
    if (!path.startsWith('/')) {
      new Notice('⚠️ 路径必须以“/”开头');
      return false;
    }
    return true;
  }

  /**
   * 验证数值范围
   */
  private validateRange(value: number, min: number, max: number, fieldName: string): boolean {
    if (value < min || value > max) {
      new Notice(`⚠️ ${fieldName} 必须在 ${min} 和 ${max} 之间`);
      return false;
    }
    return true;
  }

  /**
   * 渲染语言选择部分
   */
  private renderLanguageSelection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(this.tr.settings.language.name)
      .setDesc(this.tr.settings.language.desc)
      .addDropdown(dropdown => dropdown
        .addOption('en', this.tr.languages.en)
        .addOption('zh', this.tr.languages.zh)
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value as 'en' | 'zh';
          await this.plugin.saveSettings();
          this.display(); // 刷新显示以显示新语言
        })
      );
  }

  /**
   * 渲染 Jina AI Linker 设置部分
   */
  private renderJinaSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.jina });

    // Jina API 密钥（密码字段）
    new Setting(containerEl)
      .setName(this.tr.settings.jinaApiKey.name)
      .setDesc(this.tr.settings.jinaApiKey.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.jinaApiKey)
        .setValue(this.plugin.settings.jina_api_key)
        .onChange(async (value) => {
          this.plugin.settings.jina_api_key = value;
          await this.plugin.saveSettings();
        })
      )
      .then(setting => {
        // 使其成为密码字段
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'password';
        }
      });

    // Jina 模型名称
    new Setting(containerEl)
      .setName(this.tr.settings.jinaModelName.name)
      .setDesc(this.tr.settings.jinaModelName.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.jinaModelName)
        .setValue(this.plugin.settings.jina_model_name)
        .onChange(async (value) => {
          this.plugin.settings.jina_model_name = value;
          await this.plugin.saveSettings();
        })
      );

    // Jina 嵌入最大字符数
    new Setting(containerEl)
      .setName(this.tr.settings.jinaMaxChars.name)
      .setDesc(this.tr.settings.jinaMaxChars.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.jina_max_chars))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1000 && num <= 20000) {
            this.plugin.settings.jina_max_chars = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1000';
          textInput.max = '20000';
          textInput.step = '1000';
        }
      });

    // Jina 最大输入令牌数
    new Setting(containerEl)
      .setName(this.tr.settings.jinaMaxInputTokens.name)
      .setDesc(this.tr.settings.jinaMaxInputTokens.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.jina_max_input_tokens))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1000) {
            this.plugin.settings.jina_max_input_tokens = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1000';
          textInput.step = '1000';
        }
      });
  }

  /**
   * 渲染 AI 智能评分配置部分
   */
  private renderAIScoringSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.ai });

    // AI 提供商下拉列表
    new Setting(containerEl)
      .setName(this.tr.settings.aiProvider.name)
      .setDesc(this.tr.settings.aiProvider.desc)
      .addDropdown(dropdown => {
        // 添加内置提供商
        dropdown
          .addOption('gemini', this.tr.providers.gemini)
          .addOption('openai', this.tr.providers.openai)
          .addOption('anthropic', this.tr.providers.anthropic)
          .addOption('ollama', this.tr.providers.ollama);

        // 添加自定义提供商选项
        if (this.plugin.settings.custom_providers.length > 0) {
          // 添加分隔线效果（使用特殊选项）
          dropdown.addOption('custom', `── ${this.tr.providers.custom} ──`);
          // 添加每个自定义提供商
          this.plugin.settings.custom_providers.forEach(p => {
            dropdown.addOption(`custom:${p.id}`, `  ${p.name}`);
          });
        } else {
          dropdown.addOption('custom', this.tr.providers.custom);
        }

        // 设置当前值
        let currentValue = this.plugin.settings.ai_provider;
        if (currentValue === 'custom' && this.plugin.settings.selected_custom_provider) {
          currentValue = `custom:${this.plugin.settings.selected_custom_provider}` as LLMProvider;
        }
        dropdown.setValue(currentValue);

        dropdown.onChange(async (value) => {
          // 解析选择的值
          let newProvider: LLMProvider;
          let customProviderId = '';

          if (value.startsWith('custom:')) {
            newProvider = 'custom';
            customProviderId = value.replace('custom:', '');
          } else {
            newProvider = value as LLMProvider;
          }

          // 保存当前提供商的配置
          if (this.plugin.settings.ai_provider !== 'custom') {
            this.plugin.settings.provider_configs[this.plugin.settings.ai_provider] = {
              api_url: this.plugin.settings.ai_api_url,
              api_key: this.plugin.settings.ai_api_key,
              model_name: this.plugin.settings.ai_model_name,
            };
          }

          // 切换提供商
          this.plugin.settings.ai_provider = newProvider;
          this.plugin.settings.selected_custom_provider = customProviderId;

          // 加载新提供商的配置
          if (newProvider === 'custom' && customProviderId) {
            const customProvider = this.plugin.settings.custom_providers.find(p => p.id === customProviderId);
            if (customProvider) {
              this.plugin.settings.ai_api_url = customProvider.api_url;
              this.plugin.settings.ai_api_key = customProvider.api_key;
              this.plugin.settings.ai_model_name = customProvider.model_name;
            }
          } else if (newProvider !== 'custom') {
            const newConfig = this.plugin.settings.provider_configs[newProvider];
            this.plugin.settings.ai_api_url = newConfig.api_url;
            this.plugin.settings.ai_api_key = newConfig.api_key;
            this.plugin.settings.ai_model_name = newConfig.model_name;
          }

          await this.plugin.saveSettings();
          this.display(); // 刷新显示
        });
      });

    // 当选择内置提供商时，显示配置字段
    if (this.plugin.settings.ai_provider !== 'custom') {
      this.renderProviderConfigFields(containerEl);
    } else if (this.plugin.settings.selected_custom_provider) {
      // 选择了自定义提供商，显示只读信息
      this.renderSelectedCustomProviderInfo(containerEl);
    }

    // 自定义提供商管理区域
    this.renderCustomProvidersManager(containerEl);

    // LLM 最大输入令牌数
    new Setting(containerEl)
      .setName(this.tr.settings.llmMaxInputTokens.name)
      .setDesc(this.tr.settings.llmMaxInputTokens.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.llm_max_input_tokens))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1000) {
            this.plugin.settings.llm_max_input_tokens = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1000';
          textInput.step = '1000';
        }
      });
  }

  /**
   * 渲染提供商配置字段（API URL、密钥、模型）
   */
  private renderProviderConfigFields(containerEl: HTMLElement): void {
    // API URL
    new Setting(containerEl)
      .setName(this.tr.settings.aiApiUrl.name)
      .setDesc(this.tr.settings.aiApiUrl.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiApiUrl)
        .setValue(this.plugin.settings.ai_api_url)
        .onChange(async (value) => {
          this.plugin.settings.ai_api_url = value;
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].api_url = value;
          await this.plugin.saveSettings();
        })
      );

    // API 密钥（密码字段）
    new Setting(containerEl)
      .setName(this.tr.settings.aiApiKey.name)
      .setDesc(this.tr.settings.aiApiKey.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiApiKey)
        .setValue(this.plugin.settings.ai_api_key)
        .onChange(async (value) => {
          this.plugin.settings.ai_api_key = value;
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].api_key = value;
          await this.plugin.saveSettings();
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'password';
        }
      });

    // 模型名称
    new Setting(containerEl)
      .setName(this.tr.settings.aiModelName.name)
      .setDesc(this.tr.settings.aiModelName.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiModelName)
        .setValue(this.plugin.settings.ai_model_name)
        .onChange(async (value) => {
          this.plugin.settings.ai_model_name = value;
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].model_name = value;
          await this.plugin.saveSettings();
        })
      );
  }

  /**
   * 渲染选中的自定义提供商信息
   */
  private renderSelectedCustomProviderInfo(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.custom_providers.find(
      p => p.id === this.plugin.settings.selected_custom_provider
    );
    if (!provider) return;

    const infoContainer = containerEl.createDiv({ cls: 'custom-provider-info' });
    infoContainer.style.padding = '10px';
    infoContainer.style.marginBottom = '10px';
    infoContainer.style.backgroundColor = 'var(--background-secondary)';
    infoContainer.style.borderRadius = '5px';

    infoContainer.createEl('div', {
      text: `📍 ${provider.name}`,
      attr: { style: 'font-weight: bold; margin-bottom: 5px;' }
    });
    infoContainer.createEl('div', {
      text: `URL: ${provider.api_url}`,
      attr: { style: 'font-size: 0.9em; opacity: 0.8;' }
    });
    infoContainer.createEl('div', {
      text: `Model: ${provider.model_name}`,
      attr: { style: 'font-size: 0.9em; opacity: 0.8;' }
    });
  }

  /**
   * 渲染自定义提供商管理区域
   */
  private renderCustomProvidersManager(containerEl: HTMLElement): void {
    // 可折叠区域
    const detailsEl = containerEl.createEl('details', { cls: 'custom-providers-section' });
    detailsEl.style.marginTop = '20px';
    detailsEl.style.marginBottom = '20px';

    const summaryEl = detailsEl.createEl('summary');
    summaryEl.style.cursor = 'pointer';
    summaryEl.style.fontWeight = 'bold';
    summaryEl.style.padding = '10px';
    summaryEl.style.backgroundColor = 'var(--background-secondary)';
    summaryEl.style.borderRadius = '5px';
    summaryEl.textContent = this.plugin.settings.language === 'zh'
      ? `🔧 管理自定义提供商 (${this.plugin.settings.custom_providers.length})`
      : `🔧 Manage Custom Providers (${this.plugin.settings.custom_providers.length})`;

    const contentEl = detailsEl.createDiv({ cls: 'custom-providers-content' });
    contentEl.style.padding = '15px';
    contentEl.style.paddingTop = '10px';

    // 现有的自定义提供商列表
    if (this.plugin.settings.custom_providers.length > 0) {
      this.plugin.settings.custom_providers.forEach((provider, index) => {
        this.renderCustomProviderItem(contentEl, provider, index);
      });
    } else {
      const emptyMsg = contentEl.createDiv();
      emptyMsg.style.opacity = '0.6';
      emptyMsg.style.fontStyle = 'italic';
      emptyMsg.style.marginBottom = '10px';
      emptyMsg.textContent = this.plugin.settings.language === 'zh'
        ? '暂无自定义提供商'
        : 'No custom providers yet';
    }

    // 添加新提供商按钮
    new Setting(contentEl)
      .setName(this.plugin.settings.language === 'zh' ? '添加自定义提供商' : 'Add Custom Provider')
      .setDesc(this.plugin.settings.language === 'zh'
        ? '添加一个 OpenAI 兼容的 API 端点'
        : 'Add an OpenAI-compatible API endpoint')
      .addButton(button => button
        .setButtonText(this.plugin.settings.language === 'zh' ? '+ 添加' : '+ Add')
        .setCta()
        .onClick(() => {
          this.showAddCustomProviderModal();
        })
      );
  }

  /**
   * 渲染单个自定义提供商项
   */
  private renderCustomProviderItem(containerEl: HTMLElement, provider: import('../plugin-settings').CustomProviderConfig, index: number): void {
    const itemEl = containerEl.createDiv({ cls: 'custom-provider-item' });
    itemEl.style.display = 'flex';
    itemEl.style.alignItems = 'center';
    itemEl.style.padding = '8px 10px';
    itemEl.style.marginBottom = '8px';
    itemEl.style.backgroundColor = 'var(--background-primary)';
    itemEl.style.borderRadius = '5px';
    itemEl.style.border = '1px solid var(--background-modifier-border)';

    // 提供商信息
    const infoEl = itemEl.createDiv();
    infoEl.style.flex = '1';
    infoEl.createEl('div', { text: provider.name, attr: { style: 'font-weight: 500;' } });
    infoEl.createEl('div', {
      text: `${provider.model_name} @ ${new URL(provider.api_url).host}`,
      attr: { style: 'font-size: 0.85em; opacity: 0.7;' }
    });

    // 按钮容器
    const buttonsEl = itemEl.createDiv();
    buttonsEl.style.display = 'flex';
    buttonsEl.style.gap = '5px';

    // 编辑按钮
    const editBtn = buttonsEl.createEl('button', { text: '✏️' });
    editBtn.style.padding = '4px 8px';
    editBtn.addEventListener('click', () => {
      this.showEditCustomProviderModal(provider);
    });

    // 删除按钮
    const deleteBtn = buttonsEl.createEl('button', { text: '🗑️' });
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.addEventListener('click', async () => {
      this.plugin.settings.custom_providers.splice(index, 1);
      // 如果删除的是当前选中的提供商，清除选择
      if (this.plugin.settings.selected_custom_provider === provider.id) {
        this.plugin.settings.selected_custom_provider = '';
        if (this.plugin.settings.ai_provider === 'custom') {
          this.plugin.settings.ai_provider = 'gemini';
          const config = this.plugin.settings.provider_configs.gemini;
          this.plugin.settings.ai_api_url = config.api_url;
          this.plugin.settings.ai_api_key = config.api_key;
          this.plugin.settings.ai_model_name = config.model_name;
        }
      }
      await this.plugin.saveSettings();
      this.display();
    });
  }

  /**
   * 显示添加自定义提供商模态框
   */
  private showAddCustomProviderModal(): void {
    const modal = new CustomProviderModal(
      this.app,
      this.plugin.settings.language,
      null,
      async (provider) => {
        provider.id = `custom-${Date.now()}`;
        this.plugin.settings.custom_providers.push(provider);
        await this.plugin.saveSettings();
        this.display();
      }
    );
    modal.open();
  }

  /**
   * 显示编辑自定义提供商模态框
   */
  private showEditCustomProviderModal(provider: import('../plugin-settings').CustomProviderConfig): void {
    const modal = new CustomProviderModal(
      this.app,
      this.plugin.settings.language,
      provider,
      async (updated) => {
        const index = this.plugin.settings.custom_providers.findIndex(p => p.id === provider.id);
        if (index !== -1) {
          updated.id = provider.id; // 保持原 ID
          this.plugin.settings.custom_providers[index] = updated;
          // 如果是当前选中的提供商，更新当前配置
          if (this.plugin.settings.selected_custom_provider === provider.id) {
            this.plugin.settings.ai_api_url = updated.api_url;
            this.plugin.settings.ai_api_key = updated.api_key;
            this.plugin.settings.ai_model_name = updated.model_name;
          }
          await this.plugin.saveSettings();
          this.display();
        }
      }
    );
    modal.open();
  }


  /**
   * 渲染处理参数部分
   */
  private renderProcessingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.processing });

    // 默认扫描路径
    new Setting(containerEl)
      .setName(this.tr.settings.defaultScanPath.name)
      .setDesc(this.tr.settings.defaultScanPath.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.defaultScanPath)
        .setValue(this.plugin.settings.default_scan_path)
        .onChange(async (value) => {
          this.plugin.settings.default_scan_path = value;
          await this.plugin.saveSettings();
        })
      );

    // 排除的文件夹（文本区域）
    new Setting(containerEl)
      .setName(this.tr.settings.excludedFolders.name)
      .setDesc(this.tr.settings.excludedFolders.desc)
      .addTextArea(text => text
        .setPlaceholder(this.tr.placeholders.excludedFolders)
        .setValue(this.plugin.settings.excluded_folders)
        .onChange(async (value) => {
          this.plugin.settings.excluded_folders = value;
          await this.plugin.saveSettings();
        })
      )
      .then(setting => {
        // 使文本区域更小
        const textArea = setting.controlEl.querySelector('textarea');
        if (textArea) {
          textArea.rows = 2;
        }
      });

    // 排除的文件模式（文本区域）
    new Setting(containerEl)
      .setName(this.tr.settings.excludedPatterns.name)
      .setDesc(this.tr.settings.excludedPatterns.desc)
      .addTextArea(text => text
        .setPlaceholder(this.tr.placeholders.excludedPatterns)
        .setValue(this.plugin.settings.excluded_patterns)
        .onChange(async (value) => {
          this.plugin.settings.excluded_patterns = value;
          await this.plugin.saveSettings();
        })
      )
      .then(setting => {
        // 使文本区域更小
        const textArea = setting.controlEl.querySelector('textarea');
        if (textArea) {
          textArea.rows = 2;
        }
      });
  }

  /**
   * 渲染链接插入设置部分
   */
  private renderLinkSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.link });

    // Jina 相似度阈值
    new Setting(containerEl)
      .setName(this.tr.settings.similarityThreshold.name)
      .setDesc(this.tr.settings.similarityThreshold.desc)
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
          textInput.min = '0.7';
          textInput.max = '1';
          textInput.step = '0.05';
        }
      });

    // 最低 AI 分数
    new Setting(containerEl)
      .setName(this.tr.settings.minAiScore.name)
      .setDesc(this.tr.settings.minAiScore.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.min_ai_score))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 0 && num <= 10) {
            this.plugin.settings.min_ai_score = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '0';
          textInput.max = '10';
          textInput.step = '1';
        }
      });

    // 每个笔记的最大链接数
    new Setting(containerEl)
      .setName(this.tr.settings.maxLinksPerNote.name)
      .setDesc(this.tr.settings.maxLinksPerNote.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.max_links_per_note))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 50) {
            this.plugin.settings.max_links_per_note = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1';
          textInput.max = '50';
          textInput.step = '1';
        }
      });

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
  }

  /**
   * 渲染 AI 评分提示设置部分
   */
  private renderScoringPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.scoringPrompt });

    // 使用自定义提示切换
    new Setting(containerEl)
      .setName(this.tr.settings.useCustomScoringPrompt.name)
      .setDesc(this.tr.settings.useCustomScoringPrompt.desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.use_custom_scoring_prompt)
        .onChange(async (value) => {
          this.plugin.settings.use_custom_scoring_prompt = value;
          await this.plugin.saveSettings();
          this.display(); // 刷新以显示/隐藏文本区域
        })
      );

    // 自定义提示文本区域（仅在启用时显示）
    if (this.plugin.settings.use_custom_scoring_prompt) {
      new Setting(containerEl)
        .setName(this.tr.settings.customScoringPrompt.name)
        .setDesc(this.tr.settings.customScoringPrompt.desc)
        .addTextArea(text => text
          .setPlaceholder(DEFAULT_SCORING_PROMPT)
          .setValue(this.plugin.settings.custom_scoring_prompt)
          .onChange(async (value) => {
            this.plugin.settings.custom_scoring_prompt = value;
            await this.plugin.saveSettings();
          })
        )
        .then(setting => {
          // 使文本区域更大
          const textArea = setting.controlEl.querySelector('textarea');
          if (textArea) {
            textArea.rows = 10;
            textArea.style.width = '100%';
          }
        });

      // 恢复默认按钮
      new Setting(containerEl)
        .setName(this.tr.settings.restoreScoringPrompt.name)
        .setDesc(this.tr.settings.restoreScoringPrompt.desc)
        .addButton(button => button
          .setButtonText(this.tr.buttons.restoreDefault)
          .onClick(async () => {
            this.plugin.settings.custom_scoring_prompt = DEFAULT_SCORING_PROMPT;
            await this.plugin.saveSettings();
            this.display(); // 刷新
          })
        );
    }
  }

  /**
   * 渲染 AI 标签生成设置部分
   */
  private renderTaggingPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.taggingPrompt });

    // 使用自定义标签提示切换
    new Setting(containerEl)
      .setName(this.tr.settings.useCustomTaggingPrompt.name)
      .setDesc(this.tr.settings.useCustomTaggingPrompt.desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.use_custom_tagging_prompt)
        .onChange(async (value) => {
          this.plugin.settings.use_custom_tagging_prompt = value;
          await this.plugin.saveSettings();
          this.display(); // 刷新以显示/隐藏文本区域
        })
      );

    // 自定义标签提示文本区域（仅在启用时显示）
    if (this.plugin.settings.use_custom_tagging_prompt) {
      new Setting(containerEl)
        .setName(this.tr.settings.customTaggingPrompt.name)
        .setDesc(this.tr.settings.customTaggingPrompt.desc)
        .addTextArea(text => text
          .setPlaceholder(DEFAULT_TAGGING_PROMPT)
          .setValue(this.plugin.settings.custom_tagging_prompt)
          .onChange(async (value) => {
            this.plugin.settings.custom_tagging_prompt = value;
            await this.plugin.saveSettings();
          })
        )
        .then(setting => {
          // 使文本区域更大
          const textArea = setting.controlEl.querySelector('textarea');
          if (textArea) {
            textArea.rows = 10;
            textArea.style.width = '100%';
          }
        });

      // 恢复默认按钮
      new Setting(containerEl)
        .setName(this.tr.settings.restoreTaggingPrompt.name)
        .setDesc(this.tr.settings.restoreTaggingPrompt.desc)
        .addButton(button => button
          .setButtonText(this.tr.buttons.restoreDefault)
          .onClick(async () => {
            this.plugin.settings.custom_tagging_prompt = DEFAULT_TAGGING_PROMPT;
            await this.plugin.saveSettings();
            this.display(); // 刷新
          })
        );
    }
  }

  /**
   * 渲染 AI 批量处理参数部分
   */
  private renderBatchProcessingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.batch });

    // 评分的批量大小
    new Setting(containerEl)
      .setName(this.tr.settings.batchSizeScoring.name)
      .setDesc(this.tr.settings.batchSizeScoring.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.batch_size_scoring))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 50) {
            this.plugin.settings.batch_size_scoring = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1';
          textInput.max = '50';
          textInput.step = '1';
        }
      });

    // 标记的批量大小
    new Setting(containerEl)
      .setName(this.tr.settings.batchSizeTagging.name)
      .setDesc(this.tr.settings.batchSizeTagging.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.batch_size_tagging))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 50) {
            this.plugin.settings.batch_size_tagging = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '1';
          textInput.max = '50';
          textInput.step = '1';
        }
      });

    // LLM 评分最大字符数
    new Setting(containerEl)
      .setName(this.tr.settings.llmScoringMaxChars.name)
      .setDesc(this.tr.settings.llmScoringMaxChars.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.llm_scoring_max_chars))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 500 && num <= 5000) {
            this.plugin.settings.llm_scoring_max_chars = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '500';
          textInput.max = '5000';
          textInput.step = '100';
        }
      });

    // LLM 标签生成最大字符数
    new Setting(containerEl)
      .setName(this.tr.settings.llmTaggingMaxChars.name)
      .setDesc(this.tr.settings.llmTaggingMaxChars.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.llm_tagging_max_chars))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 500 && num <= 5000) {
            this.plugin.settings.llm_tagging_max_chars = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '500';
          textInput.max = '5000';
          textInput.step = '100';
        }
      });
  }

  /**
   * 渲染性能和调试部分
   */
  private renderPerformanceSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.performance });

    // 启用调试日志记录切换
    new Setting(containerEl)
      .setName(this.tr.settings.enableDebugLogging.name)
      .setDesc(this.tr.settings.enableDebugLogging.desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enable_debug_logging)
        .onChange(async (value) => {
          this.plugin.settings.enable_debug_logging = value;
          await this.plugin.saveSettings();
        })
      );

    // 清除缓存按钮（带确认对话框）
    new Setting(containerEl)
      .setName(this.tr.settings.clearCache.name)
      .setDesc(this.tr.settings.clearCache.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.clearCache)
        .setWarning()
        .onClick(async () => {
          // 显示确认对话框
          const modal = new ConfirmModal(
            this.app,
            this.tr.dialogs.clearCacheTitle,
            this.tr.dialogs.clearCacheMessage,
            this.tr.buttons.clearCache,
            this.tr.dialogs.clearCacheConfirmPlaceholder,
            async () => {
              try {
                const cacheService = this.plugin.getCacheService();
                await cacheService.clearCache();
                new Notice(this.tr.notices.cacheClearSuccess);
              } catch (error) {
                const err = error as Error;
                new Notice(`${this.tr.notices.cacheClearFailed}: ${err.message}`);
                console.error('[Settings] 清除缓存失败:', error);
              }
            }
          );
          modal.open();
        })
      );

    // 显示统计信息按钮
    new Setting(containerEl)
      .setName(this.tr.settings.showStatistics.name)
      .setDesc(this.tr.settings.showStatistics.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.showStatistics)
        .onClick(async () => {
          try {
            const cacheService = this.plugin.getCacheService();
            await cacheService.showStatistics();
            new Notice(this.tr.notices.statisticsShown);
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.statisticsFailed}: ${err.message}`);
            console.error('[Settings] 显示统计信息失败:', error);
          }
        })
      );

    // 取消当前操作按钮
    new Setting(containerEl)
      .setName(this.tr.settings.cancelOperation.name)
      .setDesc(this.tr.settings.cancelOperation.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.cancelOperation)
        .setWarning()
        .onClick(async () => {
          try {
            const taskManager = this.plugin.getTaskManager();
            await taskManager.cancelTask();
            new Notice(this.tr.notices.cancelSuccess);
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.cancelFailed}: ${err.message}`);
            console.error('[Settings] 取消操作失败:', error);
          }
        })
      );

    // 查看日志按钮
    new Setting(containerEl)
      .setName(this.tr.settings.viewLogs.name)
      .setDesc(this.tr.settings.viewLogs.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.viewLogs)
        .onClick(async () => {
          try {
            // @ts-ignore - Obsidian 内部 API
            const basePath = this.app.vault.adapter.basePath;
            const pluginDir = `${basePath}/.obsidian/plugins/obsidian-llm-plugin`;

            // 使用正确的 API: app.showInFolder
            // 由于 showInFolder 需要一个文件路径，我们需要指向一个实际存在的日志文件
            // 如果文件不存在，我们可以使用 Obsidian 的 openExternal 来打开文件夹
            const { exec } = require('child_process');
            const platform = require('os').platform();

            // 根据不同平台打开文件夹
            let command: string;
            if (platform === 'win32') {
              command = `explorer "${pluginDir}"`;
            } else if (platform === 'darwin') {
              command = `open "${pluginDir}"`;
            } else {
              command = `xdg-open "${pluginDir}"`;
            }

            exec(command, (error: Error | null) => {
              if (error) {
                console.error('[Settings] 打开日志文件夹失败:', error);
                new Notice(this.tr.notices.viewLogsFailed);
              }
            });
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.viewLogsFailed}: ${err.message}`);
            console.error('[Settings] 查看日志失败:', error);
          }
        })
      );

    // 恢复默认设置按钮（新）
    new Setting(containerEl)
      .setName(this.tr.settings.restoreDefaults.name)
      .setDesc(this.tr.settings.restoreDefaults.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.restoreDefaults)
        .setWarning()
        .onClick(async () => {
          try {
            // 保留 API 密钥
            const jinaApiKey = this.plugin.settings.jina_api_key;
            const aiApiKey = this.plugin.settings.ai_api_key;
            const providerConfigs = this.plugin.settings.provider_configs;

            // 重置为默认值
            Object.assign(this.plugin.settings, DEFAULT_SETTINGS);

            // 恢复 API 密钥
            this.plugin.settings.jina_api_key = jinaApiKey;
            this.plugin.settings.ai_api_key = aiApiKey;
            this.plugin.settings.provider_configs = providerConfigs;

            await this.plugin.saveSettings();
            this.display(); // 刷新显示
            new Notice(this.tr.notices.restoreDefaultsSuccess);
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.restoreDefaultsFailed}: ${err.message}`);
            console.error('[Settings] 恢复默认设置失败:', error);
          }
        })
      );
  }
}
