// Vendors the Contestmoji SVG set from a local checkout of
// https://github.com/macedeveloper/contestmoji into public/emoji/contestmoji.
//
// Usage: node scripts/vendor-contestmoji.mjs <path-to-contestmoji-main>

import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2];
if (!repo) {
  console.error('Pass the path to the contestmoji-main checkout.');
  process.exit(1);
}

const root = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(root, '..');
const sourceList = join(resolve(repo), 'list');
const targetList = join(clientRoot, 'public', 'emoji', 'contestmoji');
const manifestPath = join(clientRoot, 'src', 'lib', 'contestmoji.ts');

// The upstream site lists every emoji alphabetically. Grouping them by type makes
// the in-app picker easier to scan, so the categories live here alongside the
// vendored artwork instead of being maintained by hand in the generated file.
const CATEGORY_ORDER = ['faces', 'cats', 'hearts', 'flags', 'buttons', 'music', 'nature', 'objects', 'symbols'];
const CATEGORY_NAMES = {
  faces: [
    'angel', 'angeldreamy', 'annoyed', 'bagsundereyes', 'buffoon', 'clown', 'clownpensive',
    'cold', 'cowboy', 'crying', 'disguise', 'dizzy', 'excited', 'expressionless', 'fear',
    'freaky', 'grin', 'grinbigeyes', 'grinsmile', 'grinsweat', 'hearteyes', 'holdingbacktears',
    'hornsangry', 'hornsexcited', 'hornspensive', 'hornssmile', 'hornssmirk', 'hot', 'invader',
    'joy', 'melting', 'meltingcrying', 'mouthless', 'nerd', 'neutral', 'pensive', 'pleading',
    'quepro', 'rage', 'ragecensored', 'raisedeyebrow', 'robot', 'robotevil', 'rofl', 'santa',
    'santapensive', 'smile', 'smilehappy', 'smirk', 'sob', 'sobclassic', 'sunglasses', 'surprised',
    'unamused', 'upsidedown', 'user', 'violent', 'wink', 'yawn', 'yuck'
  ],
  cats: ['catgrin', 'cathehe', 'cathorns', 'catjoy', 'catpensive', 'catrage', 'catsmile', 'catsmirk', 'catyawn'],
  hearts: [
    'heartblack', 'heartblue', 'heartbroken', 'heartbrown', 'heartcyan', 'heartgray', 'heartgreen',
    'heartorange', 'heartpink', 'heartpurple', 'heartred', 'heartsaround', 'heartsparkling',
    'heartwhite', 'heartyellow'
  ],
  flags: [
    'flagblack', 'flagfinish', 'flagkebabia', 'flagkebabiamil', 'flagkebabianeo', 'flagpirate',
    'flagpride', 'flagtrans', 'flagtriangle', 'flagwhite'
  ],
  buttons: [
    'buttonblack', 'buttoncircle', 'buttonempty', 'buttongray', 'buttonheart', 'buttonpink',
    'buttonsquare', 'buttonstar', 'buttontriangle', 'buttonwhite'
  ],
  music: ['musiccymbal', 'musicpiano', 'waveformnoise', 'waveformsaw', 'waveformsine', 'waveformsquare', 'waveformtriangle'],
  nature: ['butterfly', 'fire', 'wiltedrose'],
  objects: ['chair', 'fork', 'telephonereciever', 'wand'],
  symbols: ['bloodtypea', 'bloodtypeab', 'bloodtypeb', 'bloodtypeo', 'boom', 'boomnight', 'checkmark', 'cross', 'infinity', 'like', 'sparkles', 'star', 'warning', 'wave', 'yinyang']
};

const categoryByName = new Map();
for (const category of CATEGORY_ORDER) {
  for (const name of CATEGORY_NAMES[category]) {
    if (categoryByName.has(name)) {
      console.error(`Emoji "${name}" is listed in more than one category.`);
      process.exit(1);
    }
    categoryByName.set(name, category);
  }
}

const index = await readFile(join(resolve(repo), 'index.html'), 'utf8');
const css = await readFile(join(resolve(repo), 'emojis.css'), 'utf8');

const canonical = [];
const canonicalPattern = /<i class="md-e md-e-([a-z0-9]+)"><\/i>([a-z0-9]+)<\/p>/g;
for (const match of index.matchAll(canonicalPattern)) {
  if (match[1] === match[2] && !canonical.includes(match[1])) {
    canonical.push(match[1]);
  }
}

const fileForClass = new Map();
const aliases = new Map();
const classPattern =
  /i\.md-e-(\.?)([a-z0-9]+)\s*\{\s*background-image:\s*url\('([^']+\/list\/[^']+\.svg)'\)/g;
for (const match of css.matchAll(classPattern)) {
  const isAlias = match[1] === '.';
  const name = match[2];
  const file = basename(match[3]);
  if (isAlias) {
    aliases.set(name, file);
  } else {
    fileForClass.set(name, file);
  }
}

const missing = canonical.filter((name) => !fileForClass.has(name));
if (missing.length > 0) {
  console.error(`No SVG mapping for: ${missing.join(', ')}`);
  process.exit(1);
}

const uncategorized = canonical.filter((name) => !categoryByName.has(name));
if (uncategorized.length > 0) {
  console.error(`No category for: ${uncategorized.join(', ')}`);
  process.exit(1);
}

await mkdir(targetList, { recursive: true });
for (const file of await readdir(sourceList)) {
  if (file.toLowerCase().endsWith('.svg')) {
    await copyFile(join(sourceList, file), join(targetList, file));
  }
}

const entries = canonical.map((name) => ({
  name,
  file: fileForClass.get(name),
  category: categoryByName.get(name),
  aliases: [...aliases.entries()].filter(([, file]) => file === fileForClass.get(name)).map(([alias]) => alias)
}));

const lines = [
  '// Vendored Contestmoji artwork. © Mace Dev / macestudios.ru.',
  '// Source: https://github.com/macedeveloper/contestmoji',
  '// Used with permission. Do not load this set from a CDN at runtime.',
  '',
  `export type ContestmojiCategory = ${CATEGORY_ORDER.map((category) => `'${category}'`).join(' | ')};`,
  '',
  'export const CONTESTMOJI_CATEGORIES: ContestmojiCategory[] = [',
  ...CATEGORY_ORDER.map((category) => `  '${category}',`),
  '];',
  '',
  'export type Contestmoji = {',
  '  name: string;',
  '  file: string;',
  '  category: ContestmojiCategory;',
  '  aliases: string[];',
  '};',
  '',
  'export const CONTESTMOJI: Contestmoji[] = [',
  ...entries.map(
    (entry) =>
      `  { name: ${JSON.stringify(entry.name)}, file: ${JSON.stringify(entry.file)}, category: '${entry.category}', aliases: ${JSON.stringify(entry.aliases)} },`
  ),
  '];',
  '',
  'export const CONTESTMOJI_BY_NAME = new Map<string, Contestmoji>();',
  'for (const emoji of CONTESTMOJI) {',
  '  CONTESTMOJI_BY_NAME.set(emoji.name, emoji);',
  '  for (const alias of emoji.aliases) {',
  '    CONTESTMOJI_BY_NAME.set(alias, emoji);',
  '  }',
  '}',
  '',
  'export function contestmojiUrl(file: string): string {',
  '  return `/emoji/contestmoji/${file}`;',
  '}',
  ''
];

await writeFile(manifestPath, lines.join('\n'));
console.log(`Vendored ${entries.length} Contestmoji entries (${aliases.size} aliases).`);
