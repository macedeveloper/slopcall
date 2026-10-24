// Generates the placeholder UI sounds used by Slopcall.
// Replace the WAV files in public/sounds with your own recordings later;
// the filenames and the sound engine do not need to change.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const MIN_GAIN = 0.0001;
const SOUND_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');

function makeBuffer(duration) {
  return new Float32Array(Math.ceil(duration * SAMPLE_RATE));
}

function envelope(progress, attack = 0.015, release = 0.08) {
  const attackEnd = Math.min(attack, 0.49);
  const releaseStart = Math.max(0.5, 1 - release);
  if (progress < attackEnd) {
    return Math.max(MIN_GAIN, progress / attackEnd);
  }
  if (progress > releaseStart) {
    return Math.max(MIN_GAIN, (1 - progress) / (1 - releaseStart));
  }
  return 1;
}

function addNote(buffer, startSeconds, duration, frequency, gain, options = {}) {
  const start = Math.floor(startSeconds * SAMPLE_RATE);
  const length = Math.floor(duration * SAMPLE_RATE);
  const endFrequency = options.endFrequency ?? frequency;
  const attack = options.attack ?? 0.012;
  const release = options.release ?? 0.09;
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const target = start + index;
    if (target >= buffer.length) {
      break;
    }

    const progress = index / Math.max(1, length - 1);
    const currentFrequency = frequency + (endFrequency - frequency) * progress;
    phase += (Math.PI * 2 * currentFrequency) / SAMPLE_RATE;

    const level = envelope(progress, attack, release) * gain;
    const fundamental = Math.sin(phase);
    const second = options.warmth ? Math.sin(phase * 2) * 0.14 : 0;
    const third = options.warmth ? Math.sin(phase * 3) * 0.05 : 0;

    buffer[target] += (fundamental + second + third) * level;
  }
}

function addNoise(buffer, startSeconds, duration, gain) {
  const start = Math.floor(startSeconds * SAMPLE_RATE);
  const length = Math.floor(duration * SAMPLE_RATE);
  for (let index = 0; index < length; index += 1) {
    const target = start + index;
    if (target >= buffer.length) {
      break;
    }
    const progress = index / Math.max(1, length - 1);
    buffer[target] += (Math.random() * 2 - 1) * envelope(progress, 0.004, 0.03) * gain;
  }
}

function normalize(buffer, peak = 0.82) {
  let maximum = 0;
  for (const sample of buffer) {
    maximum = Math.max(maximum, Math.abs(sample));
  }
  if (maximum === 0) {
    return buffer;
  }
  const scale = peak / maximum;
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] *= scale;
  }
  return buffer;
}

function wavBytes(samples) {
  const dataLength = samples.length * 2;
  const bytes = Buffer.alloc(44 + dataLength);

  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataLength, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    bytes.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  return bytes;
}

const sounds = {
  'mic-mute': () => {
    const buffer = makeBuffer(0.11);
    addNote(buffer, 0, 0.09, 560, 0.55, { endFrequency: 350, release: 0.05 });
    return buffer;
  },
  'mic-unmute': () => {
    const buffer = makeBuffer(0.11);
    addNote(buffer, 0, 0.09, 350, 0.55, { endFrequency: 560, release: 0.05 });
    return buffer;
  },
  deafen: () => {
    const buffer = makeBuffer(0.14);
    addNote(buffer, 0, 0.12, 390, 0.55, { endFrequency: 240, release: 0.06 });
    addNote(buffer, 0.035, 0.08, 195, 0.18, { endFrequency: 150, release: 0.04 });
    return buffer;
  },
  undeafen: () => {
    const buffer = makeBuffer(0.14);
    addNote(buffer, 0, 0.12, 240, 0.5, { endFrequency: 390, release: 0.06 });
    addNote(buffer, 0.035, 0.08, 390, 0.16, { endFrequency: 520, release: 0.04 });
    return buffer;
  },
  'voice-join': () => {
    const buffer = makeBuffer(0.31);
    addNote(buffer, 0, 0.12, 523.25, 0.42, { warmth: true, release: 0.07 });
    addNote(buffer, 0.075, 0.12, 659.25, 0.4, { warmth: true, release: 0.07 });
    addNote(buffer, 0.15, 0.16, 783.99, 0.44, { warmth: true, release: 0.1 });
    return buffer;
  },
  'voice-leave': () => {
    const buffer = makeBuffer(0.27);
    addNote(buffer, 0, 0.11, 659.25, 0.38, { warmth: true, release: 0.06 });
    addNote(buffer, 0.07, 0.11, 523.25, 0.36, { warmth: true, release: 0.06 });
    addNote(buffer, 0.14, 0.13, 392, 0.4, { warmth: true, release: 0.08 });
    return buffer;
  },
  'voice-error': () => {
    const buffer = makeBuffer(0.3);
    addNote(buffer, 0, 0.24, 190, 0.42, { endFrequency: 165, release: 0.12 });
    addNote(buffer, 0.085, 0.16, 285, 0.16, { endFrequency: 245, release: 0.08 });
    addNoise(buffer, 0, 0.06, 0.025);
    return buffer;
  },
  'peer-join': () => {
    const buffer = makeBuffer(0.18);
    addNote(buffer, 0, 0.1, 880, 0.3, { warmth: true, release: 0.07 });
    addNote(buffer, 0.055, 0.1, 1174.66, 0.28, { warmth: true, release: 0.08 });
    return buffer;
  },
  'peer-leave': () => {
    const buffer = makeBuffer(0.18);
    addNote(buffer, 0, 0.1, 783.99, 0.26, { warmth: true, release: 0.07 });
    addNote(buffer, 0.055, 0.1, 523.25, 0.25, { warmth: true, release: 0.08 });
    return buffer;
  },
  message: () => {
    const buffer = makeBuffer(0.19);
    addNote(buffer, 0, 0.1, 659.25, 0.32, { warmth: true, release: 0.08 });
    addNote(buffer, 0.045, 0.12, 987.77, 0.24, { warmth: true, release: 0.09 });
    return buffer;
  },
  reconnected: () => {
    const buffer = makeBuffer(0.28);
    addNote(buffer, 0, 0.1, 440, 0.34, { warmth: true, release: 0.06 });
    addNote(buffer, 0.065, 0.1, 554.37, 0.33, { warmth: true, release: 0.06 });
    addNote(buffer, 0.13, 0.14, 659.25, 0.38, { warmth: true, release: 0.09 });
    return buffer;
  },
  disconnect: () => {
    const buffer = makeBuffer(0.3);
    addNote(buffer, 0, 0.12, 440, 0.34, { warmth: true, release: 0.07 });
    addNote(buffer, 0.08, 0.12, 330, 0.32, { warmth: true, release: 0.07 });
    addNote(buffer, 0.16, 0.13, 220, 0.34, { warmth: true, release: 0.1 });
    return buffer;
  }
};

await mkdir(SOUND_DIR, { recursive: true });

for (const [name, makeSound] of Object.entries(sounds)) {
  const buffer = normalize(makeSound());
  await writeFile(join(SOUND_DIR, `${name}.wav`), wavBytes(buffer));
  console.log(`wrote ${name}.wav (${(buffer.length / SAMPLE_RATE).toFixed(2)}s)`);
}
