import fs from 'node:fs';

const map = {
  mic: 'mic-fill',
  micOff: 'mic-mute-fill',
  headphones: 'headphones',
  volume: 'volume-up-fill',
  volumeMute: 'volume-mute-fill',
  volumeOff: 'volume-off-fill',
  settings: 'gear-fill',
  send: 'send-fill',
  leave: 'box-arrow-right',
  chat: 'chat-dots-fill',
  people: 'people-fill',
  person: 'person-fill',
  close: 'x-lg',
  keyboard: 'keyboard-fill',
  translate: 'translate',
  hash: 'hash',
  phone: 'telephone-fill',
  retry: 'arrow-clockwise',
  sliders: 'sliders',
  check: 'check2',
  warning: 'exclamation-triangle-fill',
  power: 'power'
};

let output =
  '// Vendored subset of Bootstrap Icons (MIT). https://icons.getbootstrap.com/\n' +
  '// Generated from bootstrap-icons; only the paths used by Slopcall are included.\n\n' +
  'export const ICON_PATHS = {\n';

for (const [name, file] of Object.entries(map)) {
  const svg = fs.readFileSync(`node_modules/bootstrap-icons/icons/${file}.svg`, 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1]);
  output += `  ${name}: ${JSON.stringify(paths)},\n`;
}

output += '} as const;\n\nexport type IconName = keyof typeof ICON_PATHS;\n';
fs.writeFileSync('src/lib/icons.ts', output);
console.log(`Wrote ${Object.keys(map).length} icons`);
