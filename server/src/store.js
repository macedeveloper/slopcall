import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.js';

function isValidAttachment(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Number.isFinite(value.size) &&
    typeof value.contentType === 'string' &&
    typeof value.url === 'string' &&
    Number.isFinite(value.expiresAt)
  );
}

function isValidReaction(value) {
  return (
    value &&
    typeof value.emoji === 'string' &&
    value.emoji.length > 0 &&
    value.emoji.length <= 32 &&
    Array.isArray(value.userIds) &&
    value.userIds.length > 0 &&
    value.userIds.length <= LIMITS.maxUsers &&
    value.userIds.every((userId) => typeof userId === 'string')
  );
}

function isValidMessage(message, channelId) {
  return (
    message &&
    typeof message.id === 'string' &&
    message.channelId === channelId &&
    typeof message.userId === 'string' &&
    typeof message.nickname === 'string' &&
    typeof message.text === 'string' &&
    Number.isFinite(message.ts) &&
    (message.editedAt === undefined || Number.isFinite(message.editedAt)) &&
    (message.deletedAt === undefined || Number.isFinite(message.deletedAt)) &&
    (message.attachment === undefined || isValidAttachment(message.attachment)) &&
    (message.reactions === undefined ||
      (Array.isArray(message.reactions) &&
        message.reactions.length <= LIMITS.maxReactions &&
        message.reactions.every(isValidReaction))) &&
    (message.text.length > 0 || isValidAttachment(message.attachment) || Number.isFinite(message.deletedAt))
  );
}

/**
 * Append-only JSONL storage, one file per text channel.
 * Keeps the last `messagesInMemory` messages in RAM and uses the tail as history.
 * No native dependencies, which keeps deployment on the small Ubuntu box simple.
 */
export class MessageStore {
  constructor(dataDir, channelIds) {
    this.dir = dataDir;
    this.channels = new Map();

    fs.mkdirSync(dataDir, { recursive: true });
    for (const channelId of channelIds) {
      this.load(channelId);
    }
  }

  fileFor(channelId) {
    return path.join(this.dir, `${channelId}.jsonl`);
  }

  load(channelId) {
    const file = this.fileFor(channelId);
    let lines = [];

    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[store] failed to read ${file}:`, error.message);
      }
    }

    const messages = [];
    for (const line of lines.slice(-LIMITS.messagesInMemory)) {
      try {
        const message = JSON.parse(line);
        if (isValidMessage(message, channelId)) {
          messages.push(message);
        }
      } catch {
        // Ignore corrupt lines instead of failing startup.
      }
    }

    this.channels.set(channelId, messages);

    if (lines.length > LIMITS.messagesInMemory) {
      this.compact(channelId, messages);
    }
  }

  compact(channelId, messages = this.channels.get(channelId) ?? []) {
    const file = this.fileFor(channelId);
    const temporary = `${file}.tmp`;
    const body = messages.map((message) => JSON.stringify(message)).join('\n');

    fs.writeFileSync(temporary, body.length > 0 ? `${body}\n` : '');
    fs.rmSync(file, { force: true });
    fs.renameSync(temporary, file);
  }

  add(channelId, message) {
    const messages = this.channels.get(channelId);
    if (!messages) {
      return;
    }

    messages.push(message);
    if (messages.length > LIMITS.messagesInMemory) {
      messages.splice(0, messages.length - LIMITS.messagesInMemory);
    }

    try {
      fs.appendFileSync(this.fileFor(channelId), `${JSON.stringify(message)}\n`);
    } catch (error) {
      console.error(`[store] failed to persist message in ${channelId}:`, error.message);
    }
  }

  find(channelId, messageId) {
    return (this.channels.get(channelId) ?? []).find((message) => message.id === messageId) ?? null;
  }

  update(channelId, messageId, updater) {
    const messages = this.channels.get(channelId);
    const message = messages?.find((candidate) => candidate.id === messageId);
    if (!messages || !message) {
      return null;
    }

    if (updater(message) === false) {
      return null;
    }

    try {
      this.compact(channelId, messages);
    } catch (error) {
      console.error(`[store] failed to persist update in ${channelId}:`, error.message);
    }

    return message;
  }

  history(channelId) {
    return (this.channels.get(channelId) ?? []).slice(-LIMITS.historyLimit);
  }
}
