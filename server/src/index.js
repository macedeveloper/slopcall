import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { LIMITS, TEXT_CHANNELS, VOICE_ROOMS, getIceServers } from './config.js';
import { MessageStore } from './store.js';
import {
  EmptyUploadError,
  UPLOAD_LIMITS,
  UploadStore,
  UploadTooLargeError
} from './uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STARTED_AT = Date.now();

const store = new MessageStore(DATA_DIR, TEXT_CHANNELS.map((channel) => channel.id));
const uploads = new UploadStore(path.join(DATA_DIR, 'uploads'));
const uploadCleanup = setInterval(() => uploads.cleanup(), 60 * 60 * 1000);
uploadCleanup.unref();

/** @type {Map<WebSocket, Session>} */
const sessions = new Map();
/** @type {Map<string, Session>} */
const sessionsById = new Map();
const textMembers = new Map(TEXT_CHANNELS.map((channel) => [channel.id, new Set()]));
const voiceMembers = new Map(VOICE_ROOMS.map((room) => [room.id, new Set()]));

/**
 * @typedef {Object} Session
 * @property {WebSocket} ws
 * @property {string | null} id
 * @property {string | null} nickname
 * @property {string | null} avatar
 * @property {string | null} textChannelId
 * @property {string | null} voiceRoomId
 * @property {boolean} typing
 * @property {number} lastTypingAt
 * @property {boolean} alive
 * @property {number} tokens
 * @property {number} lastRefill
 * @property {NodeJS.Timeout | null} helloTimer
 */

function userInfo(session) {
  return {
    id: session.id,
    nickname: session.nickname,
    ...(session.avatar ? { avatar: session.avatar } : {})
  };
}

function send(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error('[ws] send failed:', error.message);
  }
}

function sendError(session, code, message) {
  send(session.ws, { type: 'error', code, message });
}

function sanitizeNickname(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.maxNicknameLength);
}

const AVATAR_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function sanitizeAvatar(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const avatar = value.trim();
  if (!avatar || avatar.length > LIMITS.maxAvatarLength || !AVATAR_PATTERN.test(avatar)) {
    return null;
  }

  return avatar;
}

const REACTION_PATTERN = /^:[a-z0-9]+:$/;

function sanitizeReaction(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const reaction = value.trim();
  if (!reaction || reaction.length > 32 || /[\u0000-\u001f\u007f]/.test(reaction)) {
    return '';
  }

  if (REACTION_PATTERN.test(reaction)) {
    return reaction;
  }

  return Array.from(reaction).length <= 8 ? reaction : '';
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\u0000/g, '').trim();
}

function validClientId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function takeMessageToken(session) {
  const now = Date.now();
  const elapsed = now - session.lastRefill;
  session.lastRefill = now;
  session.tokens = Math.min(5, session.tokens + (elapsed * 5) / 2000);

  if (session.tokens < 1) {
    return false;
  }

  session.tokens -= 1;
  return true;
}

function broadcastText(channelId, payload, exceptWs = null) {
  for (const member of textMembers.get(channelId) ?? []) {
    if (member.ws !== exceptWs) {
      send(member.ws, payload);
    }
  }
}

function broadcastVoice(roomId, payload, exceptWs = null) {
  for (const member of voiceMembers.get(roomId) ?? []) {
    if (member.ws !== exceptWs) {
      send(member.ws, payload);
    }
  }
}

function leaveText(session, { notify = true } = {}) {
  const channelId = session.textChannelId;
  if (!channelId) {
    return null;
  }

  session.textChannelId = null;
  session.typing = false;
  textMembers.get(channelId)?.delete(session);

  if (notify) {
    broadcastText(channelId, {
      type: 'text:peer-left',
      channelId,
      user: userInfo(session)
    });
  }

  return channelId;
}

function leaveVoice(session, { notify = true } = {}) {
  const roomId = session.voiceRoomId;
  if (!roomId) {
    return null;
  }

  session.voiceRoomId = null;
  voiceMembers.get(roomId)?.delete(session);

  if (notify) {
    broadcastVoice(roomId, {
      type: 'voice:peer-left',
      roomId,
      user: userInfo(session)
    });
  }

  return roomId;
}

function handleHello(session, message) {
  if (session.nickname) {
    sendError(session, 'already_joined', 'Already joined');
    return;
  }

  const nickname = sanitizeNickname(message.nickname);
  if (!nickname) {
    sendError(session, 'invalid_nickname', 'Nickname is required');
    return;
  }

  const clientId = validClientId(message.clientId) ? message.clientId : crypto.randomUUID();
  const existing = sessionsById.get(clientId);

  if (existing && existing !== session) {
    send(existing.ws, {
      type: 'error',
      code: 'replaced',
      message: 'This identity was opened in another window'
    });
    existing.ws.close(4001, 'replaced');
    cleanupSession(existing);
  }

  if (sessionsById.size >= LIMITS.maxUsers && !sessionsById.has(clientId)) {
    sendError(session, 'server_full', `Server is limited to ${LIMITS.maxUsers} users`);
    session.ws.close(1013, 'server full');
    return;
  }

  if (session.helloTimer) {
    clearTimeout(session.helloTimer);
    session.helloTimer = null;
  }

  session.id = clientId;
  session.nickname = nickname;
  session.avatar = sanitizeAvatar(message.avatar);
  sessionsById.set(clientId, session);

  send(session.ws, {
    type: 'welcome',
    self: userInfo(session),
    channels: {
      text: TEXT_CHANNELS,
      voice: VOICE_ROOMS
    },
    iceServers: getIceServers(),
    limits: {
      maxUsers: LIMITS.maxUsers,
      maxVoiceUsers: LIMITS.maxVoiceUsers,
      maxMessageLength: LIMITS.maxMessageLength,
      historyLimit: LIMITS.historyLimit
    }
  });

  console.log(`[user] ${nickname} joined (${sessionsById.size} online)`);
}

function handleTextJoin(session, message) {
  const channel = TEXT_CHANNELS.find((candidate) => candidate.id === message.channelId);
  if (!channel) {
    sendError(session, 'unknown_channel', 'Unknown text channel');
    return;
  }

  if (session.textChannelId === channel.id) {
    send(session.ws, {
      type: 'text:joined',
      channel,
      messages: store.history(channel.id),
      users: [...(textMembers.get(channel.id) ?? [])]
        .filter((member) => member !== session)
        .map(userInfo)
    });
    return;
  }

  leaveText(session);
  session.textChannelId = channel.id;
  const members = textMembers.get(channel.id);

  send(session.ws, {
    type: 'text:joined',
    channel,
    messages: store.history(channel.id),
    users: [...members].filter((member) => member !== session).map(userInfo)
  });

  members.add(session);
  broadcastText(
    channel.id,
    {
      type: 'text:peer-joined',
      channelId: channel.id,
      user: userInfo(session)
    },
    session.ws
  );
}

function handleTextLeave(session) {
  const channelId = leaveText(session);
  if (channelId) {
    send(session.ws, { type: 'text:left', channelId });
  }
}

function handleTyping(session, message) {
  if (!session.textChannelId) {
    return;
  }

  if (message.typing !== true) {
    stopTyping(session);
    return;
  }

  const now = Date.now();
  if (session.typing && now - session.lastTypingAt < 1500) {
    return;
  }

  session.typing = true;
  session.lastTypingAt = now;
  broadcastText(
    session.textChannelId,
    {
      type: 'text:typing',
      channelId: session.textChannelId,
      user: userInfo(session),
      typing: true
    },
    session.ws
  );
}

function stopTyping(session) {
  if (!session.typing || !session.textChannelId) {
    return;
  }

  session.typing = false;
  broadcastText(
    session.textChannelId,
    {
      type: 'text:typing',
      channelId: session.textChannelId,
      user: userInfo(session),
      typing: false
    },
    session.ws
  );
}

function handleReaction(session, message) {
  if (!session.textChannelId) {
    sendError(session, 'not_in_channel', 'Join a text channel first');
    return;
  }

  const messageId = typeof message.messageId === 'string' ? message.messageId : '';
  const emoji = sanitizeReaction(message.emoji);
  if (!messageId || !emoji) {
    sendError(session, 'invalid_reaction', 'Reaction is invalid');
    return;
  }

  if (!takeMessageToken(session)) {
    sendError(session, 'rate_limited', 'Slow down');
    return;
  }

  const current = store.find(session.textChannelId, messageId);
  if (!current || current.deletedAt) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  const reactions = (current.reactions ?? []).map((reaction) => ({
    emoji: reaction.emoji,
    userIds: [...reaction.userIds]
  }));
  const index = reactions.findIndex((reaction) => reaction.emoji === emoji);

  if (index === -1) {
    if (reactions.length >= LIMITS.maxReactions) {
      sendError(session, 'reaction_limit', 'Too many reactions on this message');
      return;
    }
    reactions.push({ emoji, userIds: [session.id] });
  } else {
    const reaction = reactions[index];
    const userIndex = reaction.userIds.indexOf(session.id);
    if (userIndex === -1) {
      reaction.userIds.push(session.id);
    } else {
      reaction.userIds.splice(userIndex, 1);
    }
    if (reaction.userIds.length === 0) {
      reactions.splice(index, 1);
    }
  }

  const updated = store.update(session.textChannelId, messageId, (target) => {
    if (reactions.length > 0) {
      target.reactions = reactions;
    } else {
      delete target.reactions;
    }
    return target;
  });

  if (!updated) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  broadcastText(session.textChannelId, {
    type: 'text:message-updated',
    message: updated
  });
}

function handleEditMessage(session, message) {
  if (!session.textChannelId) {
    sendError(session, 'not_in_channel', 'Join a text channel first');
    return;
  }

  const messageId = typeof message.messageId === 'string' ? message.messageId : '';
  const text = sanitizeText(message.text);
  if (!messageId || !text) {
    sendError(session, 'invalid_message', 'Message text is required');
    return;
  }

  if (text.length > LIMITS.maxMessageLength) {
    sendError(session, 'message_too_long', 'Message is too long');
    return;
  }

  if (!takeMessageToken(session)) {
    sendError(session, 'rate_limited', 'Slow down');
    return;
  }

  const current = store.find(session.textChannelId, messageId);
  if (!current || current.deletedAt) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  if (current.userId !== session.id) {
    sendError(session, 'not_author', 'Only the author can edit this message');
    return;
  }

  const updated = store.update(session.textChannelId, messageId, (target) => {
    target.text = text;
    target.editedAt = Date.now();
    return target;
  });

  if (!updated) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  broadcastText(session.textChannelId, {
    type: 'text:message-updated',
    message: updated
  });
}

function handleDeleteMessage(session, message) {
  if (!session.textChannelId) {
    sendError(session, 'not_in_channel', 'Join a text channel first');
    return;
  }

  const messageId = typeof message.messageId === 'string' ? message.messageId : '';
  if (!messageId) {
    sendError(session, 'invalid_message', 'Message was not found');
    return;
  }

  if (!takeMessageToken(session)) {
    sendError(session, 'rate_limited', 'Slow down');
    return;
  }

  const current = store.find(session.textChannelId, messageId);
  if (!current || current.deletedAt) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  if (current.userId !== session.id) {
    sendError(session, 'not_author', 'Only the author can delete this message');
    return;
  }

  const attachment = current.attachment;
  const updated = store.update(session.textChannelId, messageId, (target) => {
    target.text = '';
    target.deletedAt = Date.now();
    delete target.editedAt;
    delete target.attachment;
    delete target.reactions;
    return target;
  });

  if (!updated) {
    sendError(session, 'message_not_found', 'Message was not found');
    return;
  }

  if (attachment) {
    uploads.remove(attachment);
  }

  broadcastText(session.textChannelId, {
    type: 'text:message-updated',
    message: updated
  });
}

function handleTextMessage(session, message) {
  if (!session.textChannelId) {
    sendError(session, 'not_in_channel', 'Join a text channel first');
    return;
  }

  stopTyping(session);

  const attachmentId =
    typeof message.attachmentId === 'string' ? message.attachmentId : null;
  const attachment = attachmentId ? uploads.get(attachmentId) : null;

  if (attachmentId && !attachment) {
    sendError(session, 'invalid_attachment', 'Attachment is missing or expired');
    return;
  }

  const text = sanitizeText(message.text);
  if (!text && !attachment) {
    sendError(session, 'empty_message', 'Message is empty');
    return;
  }

  if (text.length > LIMITS.maxMessageLength) {
    sendError(session, 'message_too_long', `Message is limited to ${LIMITS.maxMessageLength} characters`);
    return;
  }

  if (!takeMessageToken(session)) {
    sendError(session, 'rate_limited', 'Slow down');
    return;
  }

  const saved = {
    id: crypto.randomUUID(),
    channelId: session.textChannelId,
    userId: session.id,
    nickname: session.nickname,
    text,
    ts: Date.now(),
    ...(attachment ? { attachment: uploads.publicInfo(attachment) } : {})
  };

  store.add(session.textChannelId, saved);
  broadcastText(session.textChannelId, { type: 'text:message', message: saved });
}

function handleProfileUpdate(session, message) {
  const raw = typeof message.avatar === 'string' ? message.avatar.trim() : '';
  const avatar = raw ? sanitizeAvatar(raw) : null;

  if (raw && !avatar) {
    sendError(session, 'invalid_avatar', 'Profile picture is invalid or too large');
    return;
  }

  session.avatar = avatar;

  const recipients = new Set();
  if (session.textChannelId) {
    for (const member of textMembers.get(session.textChannelId) ?? []) {
      recipients.add(member);
    }
  }
  if (session.voiceRoomId) {
    for (const member of voiceMembers.get(session.voiceRoomId) ?? []) {
      recipients.add(member);
    }
  }

  for (const recipient of recipients) {
    send(recipient.ws, { type: 'profile:updated', user: userInfo(session) });
  }
}

function handleVoiceJoin(session, message) {
  const room = VOICE_ROOMS.find((candidate) => candidate.id === message.roomId);
  if (!room) {
    sendError(session, 'unknown_voice_room', 'Unknown voice room');
    return;
  }

  if (session.voiceRoomId === room.id) {
    send(session.ws, {
      type: 'voice:joined',
      room,
      self: userInfo(session),
      peers: [...(voiceMembers.get(room.id) ?? [])]
        .filter((member) => member !== session)
        .map(userInfo),
      maxVoiceUsers: LIMITS.maxVoiceUsers
    });
    return;
  }

  leaveVoice(session);
  const members = voiceMembers.get(room.id);

  if (members.size >= LIMITS.maxVoiceUsers) {
    sendError(session, 'voice_full', `Voice rooms are limited to ${LIMITS.maxVoiceUsers} people`);
    return;
  }

  session.voiceRoomId = room.id;
  send(session.ws, {
    type: 'voice:joined',
    room,
    self: userInfo(session),
    peers: [...members].map(userInfo),
    maxVoiceUsers: LIMITS.maxVoiceUsers
  });

  members.add(session);
  broadcastVoice(
    room.id,
    {
      type: 'voice:peer-joined',
      roomId: room.id,
      user: userInfo(session)
    },
    session.ws
  );
}

function handleVoiceLeave(session) {
  const roomId = leaveVoice(session);
  if (roomId) {
    send(session.ws, { type: 'voice:left', roomId });
  }
}

function handleVoiceSignal(session, message) {
  if (!session.voiceRoomId) {
    sendError(session, 'not_in_voice', 'Join a voice room first');
    return;
  }

  if (typeof message.to !== 'string') {
    sendError(session, 'invalid_target', 'Signal target is missing');
    return;
  }

  const data = message.data;
  if (
    !data ||
    typeof data !== 'object' ||
    !['offer', 'answer', 'ice'].includes(data.kind)
  ) {
    sendError(session, 'invalid_signal', 'Invalid signal payload');
    return;
  }

  const target = sessionsById.get(message.to);
  if (
    !target ||
    target === session ||
    !target.voiceRoomId ||
    target.voiceRoomId !== session.voiceRoomId
  ) {
    sendError(session, 'invalid_target', 'Signal target is not in your voice room');
    return;
  }

  send(target.ws, {
    type: 'voice:signal',
    from: session.id,
    fromNickname: session.nickname,
    data
  });
}

function handleMessage(session, message) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendError(session, 'invalid_message', 'Malformed message');
    return;
  }

  if (message.type === 'hello') {
    handleHello(session, message);
    return;
  }

  if (!session.nickname) {
    sendError(session, 'not_ready', 'Send hello first');
    return;
  }

  switch (message.type) {
    case 'text:join':
      handleTextJoin(session, message);
      break;
    case 'text:leave':
      handleTextLeave(session);
      break;
    case 'text:message':
      handleTextMessage(session, message);
      break;
    case 'text:typing':
      handleTyping(session, message);
      break;
    case 'text:react':
      handleReaction(session, message);
      break;
    case 'text:edit':
      handleEditMessage(session, message);
      break;
    case 'text:delete':
      handleDeleteMessage(session, message);
      break;
    case 'profile:update':
      handleProfileUpdate(session, message);
      break;
    case 'voice:join':
      handleVoiceJoin(session, message);
      break;
    case 'voice:leave':
      handleVoiceLeave(session);
      break;
    case 'voice:signal':
      handleVoiceSignal(session, message);
      break;
    case 'ping':
      send(session.ws, { type: 'pong', ts: Date.now() });
      break;
    default:
      sendError(session, 'unknown_type', `Unknown message type: ${message.type}`);
  }
}

function cleanupSession(session) {
  if (session.helloTimer) {
    clearTimeout(session.helloTimer);
    session.helloTimer = null;
  }

  sessions.delete(session.ws);
  leaveText(session);
  leaveVoice(session);

  if (session.id && sessionsById.get(session.id) === session) {
    sessionsById.delete(session.id);
    console.log(`[user] ${session.nickname ?? session.id} left (${sessionsById.size} online)`);
  }
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function contentDisposition(meta) {
  const inline =
    /^(image\/(?:png|jpeg|gif|webp|avif|jxl|qoi)|audio\/|video\/|application\/pdf)$/.test(
      meta.contentType
    );
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeRFC5987(meta.name)}`;
}

const httpServer = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/upload') {
    const contentLength = Number(request.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > UPLOAD_LIMITS.maxBytes) {
      request.resume();
      sendJson(response, 413, { error: 'file_too_large', maxBytes: UPLOAD_LIMITS.maxBytes });
      return;
    }

    uploads
      .save(
        request,
        url.searchParams.get('name') ?? 'file',
        request.headers['content-type']
      )
      .then((meta) => {
        sendJson(response, 201, uploads.publicInfo(meta));
      })
      .catch((error) => {
        if (error instanceof UploadTooLargeError) {
          sendJson(response, 413, {
            error: 'file_too_large',
            maxBytes: UPLOAD_LIMITS.maxBytes
          });
          return;
        }
        if (error instanceof EmptyUploadError) {
          sendJson(response, 400, { error: 'empty_file' });
          return;
        }

        console.error('[upload] failed:', error);
        sendJson(response, 500, { error: 'upload_failed' });
      });
    return;
  }

  const fileMatch = /^\/files\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (request.method === 'GET' && fileMatch) {
    const meta = uploads.get(fileMatch[1]);
    if (!meta) {
      response.writeHead(404, { ...CORS_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const file = uploads.pathFor(meta);
    if (!fs.existsSync(file)) {
      uploads.remove(meta);
      response.writeHead(404, { ...CORS_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      ...CORS_HEADERS,
      'content-type': meta.contentType,
      'content-length': meta.size,
      'content-disposition': contentDisposition(meta),
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff'
    });

    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      response.end();
    });
    stream.pipe(response);
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    const body = JSON.stringify({
      name: 'slopcall',
      ok: true,
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      users: sessionsById.size,
      textChannels: Object.fromEntries(
        [...textMembers].map(([id, members]) => [id, members.size])
      ),
      voiceRooms: Object.fromEntries(
        [...voiceMembers].map(([id, members]) => [id, members.size])
      )
    });

    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store'
    });
    response.end(body);
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: LIMITS.maxPayloadBytes,
  perMessageDeflate: false
});

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (url.pathname !== '/ws' && url.pathname !== '/') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  if (wss.clients.size > LIMITS.maxUsers + 16) {
    ws.close(1013, 'server busy');
    return;
  }

  /** @type {Session} */
  const session = {
    ws,
    id: null,
    nickname: null,
    avatar: null,
    textChannelId: null,
    voiceRoomId: null,
    typing: false,
    lastTypingAt: 0,
    alive: true,
    tokens: 5,
    lastRefill: Date.now(),
    helloTimer: null
  };

  sessions.set(ws, session);
  session.helloTimer = setTimeout(() => {
    if (!session.nickname) {
      ws.close(4002, 'hello timeout');
    }
  }, 10_000);

  ws.on('pong', () => {
    session.alive = true;
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      sendError(session, 'binary_unsupported', 'Binary messages are not supported');
      return;
    }

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      sendError(session, 'invalid_json', 'Message must be valid JSON');
      return;
    }

    try {
      handleMessage(session, message);
    } catch (error) {
      console.error('[ws] handler failed:', error);
      sendError(session, 'internal_error', 'Internal server error');
    }
  });

  ws.on('close', () => cleanupSession(session));
  ws.on('error', (error) => {
    console.error('[ws] socket error:', error.message);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const session = sessions.get(ws);
    if (!session) {
      continue;
    }

    if (!session.alive) {
      ws.terminate();
      continue;
    }

    session.alive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, 30_000);
heartbeat.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[server] shutting down (${signal})`);

  for (const ws of wss.clients) {
    try {
      send(ws, { type: 'server:shutdown' });
      ws.close(1001, 'server shutdown');
    } catch {
      // Ignore individual socket failures during shutdown.
    }
  }

  clearInterval(heartbeat);
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  console.error('[server] unhandled rejection:', error);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[slopcall] listening on http://${HOST}:${PORT} (websocket: /ws)`);
  console.log(`[slopcall] data directory: ${DATA_DIR}`);
});
