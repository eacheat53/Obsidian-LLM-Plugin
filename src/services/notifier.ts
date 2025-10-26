import { Notice } from 'obsidian';
import { t } from '../i18n/translations';
import { Language } from '../plugin-settings';

export class NotifierService {
  private lastNoticeAt = 0;
  private throttleMs = 1500;
  private progressNotice: Notice | null = null;
  private lang: Language;

  constructor(lang: Language) {
    this.lang = lang;
  }

  setLanguage(lang: Language) { this.lang = lang; }

  info(key: string, vars?: Record<string, any>, throttle = true) {
    this.maybeShow(this.tr(key, vars), throttle);
  }

  success(key: string, vars?: Record<string, any>, throttle = false) {
    this.maybeShow(this.tr(key, vars), throttle);
  }

  warn(key: string, vars?: Record<string, any>, throttle = false) {
    this.maybeShow(this.tr(key, vars), throttle);
  }

  error(message: string) {
    new Notice(message, 5000);
  }

  beginProgress(key: string, vars?: Record<string, any>) {
    this.endProgress();
    const msg = this.tr(key, vars);
    this.progressNotice = new Notice(msg, 0); // persistent until endProgress
  }

  // 以简单文本进度条的方式显示，例如 [██████░░░░] 60%
  updateProgressBar(key: string, current: number, total: number) {
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
    const bar = this.makeBar(percent);
    const msg = this.tr(key, { percent: `${percent}%`, bar });
    this.endProgress();
    this.progressNotice = new Notice(msg, 0);
  }

  private makeBar(percent: number, width = 10): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  endProgress() {
    if (this.progressNotice && (this.progressNotice as any).hide) {
      try { (this.progressNotice as any).hide(); } catch {}
    }
    this.progressNotice = null;
  }

  private maybeShow(message: string, throttle: boolean) {
    const now = Date.now();
    if (!throttle || now - this.lastNoticeAt >= this.throttleMs) {
      new Notice(message, 3000);
      this.lastNoticeAt = now;
    }
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
