import {
  CONTESTMOJI,
  CONTESTMOJI_BY_NAME,
  contestmojiUrl,
  type Contestmoji
} from './contestmoji';

export function insertEmoji(
  text: string,
  start: number,
  end: number,
  name: string
): { text: string; cursor: number } {
  const token = `:${name}:`;
  const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
  return { text: next, cursor: start + token.length };
}

export function searchContestmoji(query: string): Contestmoji[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return CONTESTMOJI;
  }

  return CONTESTMOJI.filter(
    (emoji) =>
      emoji.name.includes(normalized) ||
      emoji.aliases.some((alias) => alias.includes(normalized))
  );
}

const UNICODE_EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\uFE0F|\u200D|\u20E3/gu;

/**
 * True when the message contains at least one emoji and nothing except emoji
 * (Unicode or valid Contestmoji tokens) plus whitespace.
 */
export function isEmojiOnly(text: string): boolean {
  let value = text.trim();
  if (!value) {
    return false;
  }

  let found = false;

  value = value.replace(/:([a-z0-9]+):/gi, (token, name: string) => {
    if (CONTESTMOJI_BY_NAME.has(name.toLowerCase())) {
      found = true;
      return '';
    }
    return token;
  });

  value = value.replace(/[0-9#*]\uFE0F?\u20E3/g, () => {
    found = true;
    return '';
  });

  value = value.replace(UNICODE_EMOJI, () => {
    found = true;
    return '';
  });

  value = value.replace(/\s/gu, '');
  return found && value.length === 0;
}

let preloadedImages: HTMLImageElement[] | null = null;

/** Warm the browser cache so the picker opens with its artwork already visible. */
export function preloadContestmoji(): void {
  if (preloadedImages !== null || typeof Image === 'undefined') {
    return;
  }

  preloadedImages = CONTESTMOJI.map((emoji) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = contestmojiUrl(emoji.file);
    return image;
  });
}
