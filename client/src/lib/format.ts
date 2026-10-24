import type { Locale } from './i18n';
import { localeTag } from './i18n';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatTime(timestamp: number, locale: Locale): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeTag(locale), {
      hour: '2-digit',
      minute: '2-digit'
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(timestamp);
}

export function formatDate(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short'
  }).format(timestamp);
}

export function formatVolume(volume: number): string {
  return `${Math.round(volume * 100)}%`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const precision = exponent === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
}
