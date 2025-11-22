import { Notice, setIcon } from 'obsidian';
import { t } from '../i18n/translations';
import { Language } from '../plugin-settings';

export class NotifierService {
  private lastNoticeAt = 0;
  private throttleMs = 1500;
  private progressNotice: Notice | null = null;
  private progressEl: {
    fill: HTMLElement;
    percent: HTMLElement;
    details: HTMLElement;
  } | null = null;
  private lang: Language;

  constructor(lang: Language) {
    this.lang = lang;
  }

  setLanguage(lang: Language) { this.lang = lang; }

  info(key: string, vars?: Record<string, any>, throttle = true) {
    this.show('info', key, vars, throttle);
  }

  success(key: string, vars?: Record<string, any>, throttle = false) {
    this.show('success', key, vars, throttle);
  }

  warn(key: string, vars?: Record<string, any>, throttle = false) {
    this.show('warning', key, vars, throttle);
  }

  error(message: string) {
    this.show('error', message, undefined, false, 5000);
  }

  beginProgress(key: string, vars?: Record<string, any>) {
    this.endProgress();
    const title = this.tr(key, vars);

    const fragment = document.createDocumentFragment();
    const container = fragment.createEl('div', { cls: 'llm-progress-notice' });

    const header = container.createEl('div', { cls: 'llm-progress-header' });
    header.createEl('span', { cls: 'llm-progress-title', text: title });
    const percentEl = header.createEl('span', { cls: 'llm-progress-percent', text: '0%' });

    const bar = container.createEl('div', { cls: 'llm-progress-bar' });
    const fillEl = bar.createEl('div', { cls: 'llm-progress-fill' });

    const detailsEl = container.createEl('div', { cls: 'llm-progress-details', text: 'Starting...' });

    this.progressNotice = new Notice(fragment, 0);
    this.progressEl = {
      fill: fillEl,
      percent: percentEl,
      details: detailsEl
    };
  }

  updateProgressBar(key: string, current: number, total: number) {
    if (!this.progressNotice || !this.progressEl) return;

    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
    const message = this.tr(key);

    this.progressEl.fill.style.width = `${percent}%`;
    this.progressEl.percent.innerText = `${percent}%`;
    this.progressEl.details.innerText = message;
  }

  updateProgressPercent(percent: number, message: string) {
    if (!this.progressNotice || !this.progressEl) return;

    this.progressEl.fill.style.width = `${percent}%`;
    this.progressEl.percent.innerText = `${Math.floor(percent)}%`;
    this.progressEl.details.innerText = message;
  }

  endProgress() {
    if (this.progressNotice && (this.progressNotice as any).hide) {
      try { (this.progressNotice as any).hide(); } catch { }
    }
    this.progressNotice = null;
    this.progressEl = null;
  }

  private show(type: 'info' | 'success' | 'warning' | 'error', keyOrMsg: string, vars?: Record<string, any>, throttle = false, duration = 3000) {
    const now = Date.now();
    if (throttle && now - this.lastNoticeAt < this.throttleMs) return;

    const message = this.tr(keyOrMsg, vars);
    const fragment = document.createDocumentFragment();
    const container = fragment.createEl('div', { cls: `llm-notice-container type-${type}` });

    const iconContainer = container.createEl('div', { cls: 'llm-notice-icon' });
    const iconName = type === 'success' ? 'check-circle' :
      type === 'error' ? 'alert-circle' :
        type === 'warning' ? 'alert-triangle' : 'info';
    setIcon(iconContainer, iconName);

    const content = container.createEl('div', { cls: 'llm-notice-content' });
    // 如果消息包含换行，第一行作为标题，其余作为详情
    const lines = message.split('\n');
    if (lines.length > 1) {
      content.createEl('div', { cls: 'llm-notice-title', text: lines[0] });
      content.createEl('div', { cls: 'llm-notice-message', text: lines.slice(1).join('\n') });
    } else {
      content.createEl('div', { cls: 'llm-notice-message', text: message });
    }

    new Notice(fragment, duration);
    this.lastNoticeAt = now;
  }

  private tr(key: string, vars?: Record<string, any>): string {
    const dict = t(this.lang);
    const path = key.split('.');
    let cur: any = dict;
    for (const p of path) {
      if (cur && p in cur) cur = cur[p]; else { cur = key; break; }
    }
    if (typeof cur === 'string' && vars) {
      return cur.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
    }
    return typeof cur === 'string' ? cur : key;
  }
}
