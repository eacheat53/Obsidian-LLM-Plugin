/**
 * Settings tab UI for plugin configuration
 * Implements comprehensive settings panel with all configurable parameters
 * Supports English and Chinese languages
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ObsidianLLMPlugin from '../main';
import { DEFAULT_SCORING_PROMPT, DEFAULT_TAGGING_PROMPT, DEFAULT_SETTINGS } from '../plugin-settings';
import { LLMProvider } from '../types/api-types';
import { t, Translation } from '../i18n/translations';

/**
 * Settings tab class
 */
export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianLLMPlugin;

  constructor(app: App, plugin: ObsidianLLMPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Get current translation object based on language setting
   */
  private get tr(): Translation {
    return t(this.plugin.settings.language);
  }

  /**
   * Display settings panel
   */
  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    // Main title
    containerEl.createEl('h1', { text: this.tr.sections.main });

    // Language selection (at top)
    this.renderLanguageSelection(containerEl);

    // Jina AI Linker Settings section
    this.renderJinaSettings(containerEl);

    // AI Smart Scoring Configuration section
    this.renderAIScoringSettings(containerEl);

    // Processing Parameters section
    this.renderProcessingSettings(containerEl);

    // Link Insertion Settings section
    this.renderLinkSettings(containerEl);

    // AI Scoring Prompt Settings section
    this.renderScoringPromptSettings(containerEl);

    // AI Tag Generation Settings section
    this.renderTaggingPromptSettings(containerEl);

    // AI Batch Processing Parameters section
    this.renderBatchProcessingSettings(containerEl);

    // Performance and Debugging section
    this.renderPerformanceSettings(containerEl);
  }

  /**
   * Validate API key (non-empty check)
   */
  private validateAPIKey(key: string, fieldName: string): boolean {
    if (!key || key.trim().length === 0) {
      new Notice(`⚠️ ${fieldName} cannot be empty. Please enter a valid API key.`);
      return false;
    }
    return true;
  }

  /**
   * Validate path format
   */
  private validatePath(path: string): boolean {
    if (!path.startsWith('/')) {
      new Notice('⚠️ Path must start with "/"');
      return false;
    }
    return true;
  }

  /**
   * Validate numeric range
   */
  private validateRange(value: number, min: number, max: number, fieldName: string): boolean {
    if (value < min || value > max) {
      new Notice(`⚠️ ${fieldName} must be between ${min} and ${max}`);
      return false;
    }
    return true;
  }

  /**
   * Render Language Selection section
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
          this.display(); // Refresh display to show new language
        })
      );
  }

  /**
   * Render Jina AI Linker Settings section
   */
  private renderJinaSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.jina });

    // Jina API Key (password field)
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
        // Make it a password field
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'password';
        }
      });

    // Jina Model Name
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

    // Jina Embedding Max Characters (number input instead of slider)
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

    // Jina Max Input Tokens (new setting)
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
   * Render AI Smart Scoring Configuration section
   */
  private renderAIScoringSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.ai });

    // AI Provider dropdown
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

          // Save current provider's configuration
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider] = {
            api_url: this.plugin.settings.ai_api_url,
            api_key: this.plugin.settings.ai_api_key,
            model_name: this.plugin.settings.ai_model_name,
          };

          // Switch provider
          this.plugin.settings.ai_provider = newProvider;

          // Load new provider's configuration
          const newConfig = this.plugin.settings.provider_configs[newProvider];
          this.plugin.settings.ai_api_url = newConfig.api_url;
          this.plugin.settings.ai_api_key = newConfig.api_key;
          this.plugin.settings.ai_model_name = newConfig.model_name;

          await this.plugin.saveSettings();
          this.display(); // Refresh display
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
          // Sync to provider_configs
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].api_url = value;
          await this.plugin.saveSettings();
        })
      );

    // API Key (password field)
    new Setting(containerEl)
      .setName(this.tr.settings.aiApiKey.name)
      .setDesc(this.tr.settings.aiApiKey.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiApiKey)
        .setValue(this.plugin.settings.ai_api_key)
        .onChange(async (value) => {
          this.plugin.settings.ai_api_key = value;
          // Sync to provider_configs
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].api_key = value;
          await this.plugin.saveSettings();
        })
      )
      .then(setting => {
        // Make it a password field
        const textInput = setting.controlEl.querySelector('input');
        if (textInput) {
          textInput.type = 'password';
        }
      });

    // Model Name
    new Setting(containerEl)
      .setName(this.tr.settings.aiModelName.name)
      .setDesc(this.tr.settings.aiModelName.desc)
      .addText(text => text
        .setPlaceholder(this.tr.placeholders.aiModelName)
        .setValue(this.plugin.settings.ai_model_name)
        .onChange(async (value) => {
          this.plugin.settings.ai_model_name = value;
          // Sync to provider_configs
          this.plugin.settings.provider_configs[this.plugin.settings.ai_provider].model_name = value;
          await this.plugin.saveSettings();
        })
      );

    // LLM Max Input Tokens (new setting)
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
   * Render Processing Parameters section
   */
  private renderProcessingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.processing });

    // Default Scan Path
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

    // Excluded Folders (text area)
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
        // Make text area smaller
        const textArea = setting.controlEl.querySelector('textarea');
        if (textArea) {
          textArea.rows = 2;
        }
      });

    // Excluded File Patterns (text area)
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
        // Make text area smaller
        const textArea = setting.controlEl.querySelector('textarea');
        if (textArea) {
          textArea.rows = 2;
        }
      });
  }

  /**
   * Render Link Insertion Settings section
   */
  private renderLinkSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.link });

    // Jina Similarity Threshold (number input instead of slider)
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

    // Minimum AI Score (number input instead of slider)
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

    // Maximum Links per Note (number input instead of slider)
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
   * Render AI Scoring Prompt Settings section
   */
  private renderScoringPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.scoringPrompt });

    // Use Custom Prompt toggle
    new Setting(containerEl)
      .setName(this.tr.settings.useCustomScoringPrompt.name)
      .setDesc(this.tr.settings.useCustomScoringPrompt.desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.use_custom_scoring_prompt)
        .onChange(async (value) => {
          this.plugin.settings.use_custom_scoring_prompt = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide text area
        })
      );

    // Custom Prompt text area (only show if enabled)
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
          // Make text area larger
          const textArea = setting.controlEl.querySelector('textarea');
          if (textArea) {
            textArea.rows = 10;
            textArea.style.width = '100%';
          }
        });

      // Restore Default button
      new Setting(containerEl)
        .setName(this.tr.settings.restoreScoringPrompt.name)
        .setDesc(this.tr.settings.restoreScoringPrompt.desc)
        .addButton(button => button
          .setButtonText(this.tr.buttons.restoreDefault)
          .onClick(async () => {
            this.plugin.settings.custom_scoring_prompt = DEFAULT_SCORING_PROMPT;
            await this.plugin.saveSettings();
            this.display(); // Refresh
          })
        );
    }
  }

  /**
   * Render AI Tag Generation Settings section
   */
  private renderTaggingPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.taggingPrompt });

    // Use Custom Tag Prompt toggle
    new Setting(containerEl)
      .setName(this.tr.settings.useCustomTaggingPrompt.name)
      .setDesc(this.tr.settings.useCustomTaggingPrompt.desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.use_custom_tagging_prompt)
        .onChange(async (value) => {
          this.plugin.settings.use_custom_tagging_prompt = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide text area
        })
      );

    // Custom Tag Prompt text area (only show if enabled)
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
          // Make text area larger
          const textArea = setting.controlEl.querySelector('textarea');
          if (textArea) {
            textArea.rows = 10;
            textArea.style.width = '100%';
          }
        });

      // Restore Default button
      new Setting(containerEl)
        .setName(this.tr.settings.restoreTaggingPrompt.name)
        .setDesc(this.tr.settings.restoreTaggingPrompt.desc)
        .addButton(button => button
          .setButtonText(this.tr.buttons.restoreDefault)
          .onClick(async () => {
            this.plugin.settings.custom_tagging_prompt = DEFAULT_TAGGING_PROMPT;
            await this.plugin.saveSettings();
            this.display(); // Refresh
          })
        );
    }
  }

  /**
   * Render AI Batch Processing Parameters section
   */
  private renderBatchProcessingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.batch });

    // Batch Size for Scoring (number input instead of slider)
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

    // Batch Size for Tagging (number input instead of slider)
    new Setting(containerEl)
      .setName(this.tr.settings.batchSizeTagging.name)
      .setDesc(this.tr.settings.batchSizeTagging.desc)
      .addText(text => text
        .setValue(String(this.plugin.settings.batch_size_tagging))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 20) {
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
          textInput.max = '20';
          textInput.step = '1';
        }
      });
  }

  /**
   * Render Performance and Debugging section
   */
  private renderPerformanceSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: this.tr.sections.performance });

    // Enable Debug Logging toggle
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

    // Clear Cache button
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
            console.error('[Settings] Clear cache failed:', error);
          }
        })
      );

    // Show Statistics button
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
            console.error('[Settings] Show statistics failed:', error);
          }
        })
      );

    // Cancel Current Operation button
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
            console.error('[Settings] Cancel operation failed:', error);
          }
        })
      );

    // Restore Default Settings button (new)
    new Setting(containerEl)
      .setName(this.tr.settings.restoreDefaults.name)
      .setDesc(this.tr.settings.restoreDefaults.desc)
      .addButton(button => button
        .setButtonText(this.tr.buttons.restoreDefaults)
        .setWarning()
        .onClick(async () => {
          try {
            // Preserve API keys
            const jinaApiKey = this.plugin.settings.jina_api_key;
            const aiApiKey = this.plugin.settings.ai_api_key;
            const providerConfigs = this.plugin.settings.provider_configs;

            // Reset to defaults
            Object.assign(this.plugin.settings, DEFAULT_SETTINGS);

            // Restore API keys
            this.plugin.settings.jina_api_key = jinaApiKey;
            this.plugin.settings.ai_api_key = aiApiKey;
            this.plugin.settings.provider_configs = providerConfigs;

            await this.plugin.saveSettings();
            this.display(); // Refresh display
            new Notice(this.tr.notices.restoreDefaultsSuccess);
          } catch (error) {
            const err = error as Error;
            new Notice(`${this.tr.notices.restoreDefaultsFailed}: ${err.message}`);
            console.error('[Settings] Restore defaults failed:', error);
          }
        })
      );
  }
}
