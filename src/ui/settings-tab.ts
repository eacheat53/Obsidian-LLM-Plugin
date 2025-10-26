/**
 * 插件配置的设置选项卡 UI
 * 实现包含所有可配置参数的综合设置面板
 * 支持中英文
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ObsidianLLMPlugin from '../main';
import { DEFAULT_SCORING_PROMPT, DEFAULT_TAGGING_PROMPT, DEFAULT_SETTINGS } from '../plugin-settings';
import { LLMProvider } from '../types/api-types';
import { t, Translation } from '../i18n/translations';

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
      .addDropdown(dropdown => dropdown
        .addOption('gemini', this.tr.providers.gemini)
        .addOption('openai', this.tr.providers.openai)
        .addOption('anthropic', this.tr.providers.anthropic)
        .addOption('custom', this.tr.providers.custom)
        .setValue(this.plugin.settings.ai_provider)
        .onChange(async (value) => {
          const newProvider = value as LLMProvider;

          // 保存当前提供商的配置
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider] = {
            api_url: this.plugin.settings.ai_api_url,
            api_key: this.plugin.settings.ai_api_key,
            model_name: this.plugin.settings.ai_model_name,
          };

          // 切换提供商
          this.plugin.settings.ai_provider = newProvider;

          // 加载新提供商的配置
          const newConfig = this.plugin.settings.provider_configs[newProvider];
          this.plugin.settings.ai_api_url = newConfig.api_url;
          this.plugin.settings.ai_api_key = newConfig.api_key;
          this.plugin.settings.ai_model_name = newConfig.model_name;

          await this.plugin.saveSettings();
          this.display(); // 刷新显示
        })
      );

    // API URL
    new Setting(containerEl)
      .setName(this.tr.settings.aiApiUrl.name)
      .setDesc(this.tr.settings.aiApiUrl.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiApiUrl)
        .setValue(this.plugin.settings.ai_api_url)
        .onChange(async (value) => {
          this.plugin.settings.ai_api_url = value;
          // 同步到 provider_configs
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
          // 同步到 provider_configs
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].api_key = value;
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

    // 模型名称
    new Setting(containerEl)
      .setName(this.tr.settings.aiModelName.name)
      .setDesc(this.tr.settings.aiModelName.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiModelName)
        .setValue(this.plugin.settings.ai_model_name)
        .onChange(async (value) => {
          this.plugin.settings.ai_model_name = value;
          // 同步到 provider_configs
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].model_name = value;
          await this.plugin.saveSettings();
        })
      );

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
          if (!isNaN(num) && num >= 0 && num <= 1) {
            this.plugin.settings.similarity_threshold = num;
            await this.plugin.saveSettings();
          }
        })
      )
      .then(setting => {
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'number';
          textInput.min = '0';
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

    // 清除缓存按钮
    new Setting(containerEl)
      .setName(this.tr.settings.clearCache.name)
      .setDesc(this.tr.settings.clearCache.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.clearCache)
        .setWarning()
        .onClick(async () => {
          try {
            const cacheService = this.plugin.getCacheService();
            await cacheService.clearCache();
            new Notice(this.tr.notices.cacheClearSuccess);
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.cacheClearFailed}: ${err.message}`);
            console.error('[Settings] 清除缓存失败:', error);
          }
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
