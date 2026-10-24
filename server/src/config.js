import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load server/.env without adding a dependency; real environment variables win.
function loadEnvFile() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

export const TEXT_CHANNELS = [
  { id: 'general', name: 'general' },
  { id: 'random', name: 'random' }
];

export const VOICE_ROOMS = [
  { id: 'lounge', name: 'Lounge' },
  { id: 'gaming', name: 'Gaming' }
];

export const LIMITS = {
  maxUsers: 32,
  maxVoiceUsers: 12,
  maxMessageLength: 2000,
  maxNicknameLength: 24,
  maxAvatarLength: 48 * 1000,
  maxReactions: 20,
  maxPayloadBytes: 64 * 1024,
  historyLimit: 50,
  messagesInMemory: 2000
};

function splitUrls(value) {
  return value.split(',').map((url) => url.trim()).filter(Boolean);
}

export function getIceServers() {
  // Google STUN is unreachable from some networks, so STUN_URL replaces it entirely.
  const stunUrls = process.env.STUN_URL
    ? splitUrls(process.env.STUN_URL)
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
  const iceServers = stunUrls.map((urls) => ({ urls }));

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: splitUrls(process.env.TURN_URL),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_PASSWORD || ''
    });
  }

  return iceServers;
}
