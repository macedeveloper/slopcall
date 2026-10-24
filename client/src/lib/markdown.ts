import { CONTESTMOJI_BY_NAME, contestmojiUrl } from './contestmoji';

export type FunStyle = 'dynamic-force' | 'pcboy' | 'ink' | 'fusion' | 'tuc';

export type MarkdownStyle = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
  fun?: FunStyle;
};

export type MarkdownToken =
  | ({ kind: 'text'; text: string } & MarkdownStyle)
  | ({
      kind: 'emoji';
      name: string;
      file: string;
      src: string;
    } & Pick<MarkdownStyle, 'href'>);

type Pattern = {
  kind: 'code' | 'strong' | 'em' | 'strike' | 'link' | 'autolink';
  regex: RegExp;
};

const PATTERNS: Pattern[] = [
  { kind: 'code', regex: /`([^`\n]+)`/g },
  { kind: 'strong', regex: /\*\*([^\n]+?)\*\*/g },
  { kind: 'em', regex: /\*([^*\n]+?)\*/g },
  { kind: 'strike', regex: /~~([^\n]+?)~~/g },
  { kind: 'link', regex: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g },
  { kind: 'autolink', regex: /https?:\/\/[^\s<>"'`]+/g }
];

const FUN_PATTERN = /\b(dynamic force|pcboy(?:800)?|inkfusion|the ultimate contest|tuc)\b/gi;

const STYLE_KEY = {
  strong: 'bold',
  em: 'italic',
  strike: 'strike'
} as const;

const EMOJI_PATTERN = /:([a-z0-9]+):/g;

function nextPattern(text: string): { pattern: Pattern; match: RegExpExecArray } | null {
  let best: { pattern: Pattern; match: RegExpExecArray } | null = null;

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(text);
    if (!match) {
      continue;
    }

    if (
      !best ||
      match.index < best.match.index ||
      (match.index === best.match.index && match[0].length > best.match[0].length)
    ) {
      best = { pattern, match };
    }
  }

  return best;
}

function appendPlainText(text: string, style: MarkdownStyle, out: MarkdownToken[]): void {
  if (!text) {
    return;
  }

  if (style.code || style.href) {
    out.push({ kind: 'text', text, ...style });
    return;
  }

  let cursor = 0;

  for (const match of text.matchAll(FUN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      out.push({ kind: 'text', text: text.slice(cursor, index), ...style });
    }

    const raw = match[0];
    const normalized = raw.toLowerCase().replace(/\s+/g, ' ');

    if (normalized === 'inkfusion') {
      const split = Math.min(3, raw.length);
      out.push({ kind: 'text', text: raw.slice(0, split), ...style, fun: 'ink' });
      if (split < raw.length) {
        out.push({ kind: 'text', text: raw.slice(split), ...style, fun: 'fusion' });
      }
    } else {
      const fun: FunStyle =
        normalized === 'dynamic force'
          ? 'dynamic-force'
          : normalized === 'the ultimate contest' || normalized === 'tuc'
            ? 'tuc'
            : 'pcboy';
      out.push({ kind: 'text', text: raw, ...style, fun });
    }

    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    out.push({ kind: 'text', text: text.slice(cursor), ...style });
  }
}

function appendText(text: string, style: MarkdownStyle, out: MarkdownToken[]): void {
  let cursor = 0;

  for (const match of text.matchAll(EMOJI_PATTERN)) {
    const emoji = CONTESTMOJI_BY_NAME.get(match[1]);
    if (!emoji) {
      continue;
    }

    const index = match.index ?? cursor;
    if (index > cursor) {
      appendPlainText(text.slice(cursor, index), style, out);
    }

    out.push({
      kind: 'emoji',
      name: emoji.name,
      file: emoji.file,
      src: contestmojiUrl(emoji.file),
      href: style.href
    });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    appendPlainText(text.slice(cursor), style, out);
  }
}

function parseInline(
  text: string,
  style: MarkdownStyle,
  out: MarkdownToken[],
  depth: number
): void {
  if (depth > 8) {
    appendText(text, style, out);
    return;
  }

  let remaining = text;

  while (remaining.length > 0) {
    const found = nextPattern(remaining);
    if (!found) {
      appendText(remaining, style, out);
      return;
    }

    if (found.match.index > 0) {
      appendText(remaining.slice(0, found.match.index), style, out);
    }

    const inner = found.match[1];

    if (found.pattern.kind === 'autolink') {
      if (style.href) {
        appendText(found.match[0], style, out);
      } else {
        const raw = found.match[0];
        let url = raw;

        while (/[.,!?;:]$/.test(url)) {
          url = url.slice(0, -1);
        }
        if (url.endsWith(')') && !url.includes('(')) {
          url = url.slice(0, -1);
        }

        appendText(url, { ...style, href: url }, out);
        const tail = raw.slice(url.length);
        if (tail) {
          appendText(tail, style, out);
        }
      }
    } else if (found.pattern.kind === 'code') {
      appendText(inner, { ...style, code: true }, out);
    } else if (found.pattern.kind === 'link') {
      parseInline(
        inner,
        { ...style, href: style.href ?? found.match[2] },
        out,
        depth + 1
      );
    } else {
      parseInline(
        inner,
        { ...style, [STYLE_KEY[found.pattern.kind]]: true },
        out,
        depth + 1
      );
    }

    remaining = remaining.slice(found.match.index + found.match[0].length);
  }
}

/**
 * A deliberately small, safe Markdown subset for chat messages:
 * **bold**, *italic*, ~~strike~~, `code`, Markdown links, and bare http(s) links.
 * It returns structured tokens, so message text is never injected as raw HTML.
 */
export function parseMarkdown(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  parseInline(text, {}, tokens, 0);
  return tokens;
}
