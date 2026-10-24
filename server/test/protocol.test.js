import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class TestClient {
  constructor(port, socketPath = '/ws') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
    this.queue = [];
    this.waiters = [];
    this.closed = false;

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      const index = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (index !== -1) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
      this.queue.push(message);
    });

    this.ws.on('close', () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('socket closed'));
      }
    });
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) {
      return this;
    }
    await once(this.ws, 'open');
    return this;
  }

  send(payload) {
    this.ws.send(JSON.stringify(payload));
  }

  waitFor(predicate, { timeout = 3000, label = 'message' } = {}) {
    const index = this.queue.findIndex(predicate);
    if (index !== -1) {
      return Promise.resolve(this.queue.splice(index, 1)[0]);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const position = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (position !== -1) {
          this.waiters.splice(position, 1);
        }
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeout);

      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  waitForType(type, options) {
    return this.waitFor((message) => message.type === type, {
      ...options,
      label: type
    });
  }

  close() {
    this.ws.close();
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer(dataDir) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server start timeout: ${output}`)), 8000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('listening on')) {
        clearTimeout(timer);
        resolve();
      }
    });

    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${output}`));
    });
  });

  return {
    port,
    child,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      const exited = await Promise.race([
        once(child, 'exit').then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 2000))
      ]);

      if (!exited && child.exitCode === null) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
        } catch {
          // Best effort.
        }
        await Promise.race([
          once(child, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
      }
    }
  };
}

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slopcall-test-'));
}

async function connect(port, nickname, clientId = crypto.randomUUID()) {
  const client = await new TestClient(port).open();
  client.send({ type: 'hello', nickname, clientId });
  const welcome = await client.waitForType('welcome');
  client.id = welcome.self.id;
  client.nickname = nickname;
  client.welcome = welcome;
  return client;
}

test('hello, text channels, messages and presence', async () => {
  const server = await startServer(tempDataDir());
  const alice = await connect(server.port, 'Alice');
  const bob = await connect(server.port, 'Bob');

  try {
    assert.equal(alice.welcome.self.nickname, 'Alice');
    assert.equal(alice.welcome.channels.text.length, 2);
    assert.ok(Array.isArray(alice.welcome.iceServers));

    alice.send({ type: 'text:join', channelId: 'general' });
    const aliceJoined = await alice.waitForType('text:joined');
    assert.equal(aliceJoined.channel.id, 'general');
    assert.deepEqual(aliceJoined.users, []);
    assert.deepEqual(aliceJoined.messages, []);

    bob.send({ type: 'text:join', channelId: 'general' });
    const bobJoined = await bob.waitForType('text:joined');
    assert.deepEqual(bobJoined.users.map((user) => user.nickname), ['Alice']);

    const presence = await alice.waitForType('text:peer-joined');
    assert.equal(presence.user.nickname, 'Bob');

    const started = Date.now();
    alice.send({ type: 'text:message', text: 'Hello Bob!' });
    const [aliceEcho, bobEcho] = await Promise.all([
      alice.waitForType('text:message'),
      bob.waitForType('text:message')
    ]);

    assert.equal(aliceEcho.message.text, 'Hello Bob!');
    assert.equal(bobEcho.message.text, 'Hello Bob!');
    assert.equal(aliceEcho.message.id, bobEcho.message.id);
    assert.ok(Date.now() - started < 1000);

    bob.send({ type: 'text:leave' });
    const left = await alice.waitForType('text:peer-left');
    assert.equal(left.user.nickname, 'Bob');
  } finally {
    alice.close();
    bob.close();
    await server.stop();
  }
});

test('reactions, author-only edits, and soft deletes', async () => {
  const server = await startServer(tempDataDir());
  const alice = await connect(server.port, 'Alice');
  const bob = await connect(server.port, 'Bob');

  try {
    alice.send({ type: 'text:join', channelId: 'general' });
    await alice.waitForType('text:joined');
    bob.send({ type: 'text:join', channelId: 'general' });
    await bob.waitForType('text:joined');

    alice.send({ type: 'text:message', text: 'React to me' });
    const [aliceMessage, bobMessage] = await Promise.all([
      alice.waitForType('text:message'),
      bob.waitForType('text:message')
    ]);
    const messageId = aliceMessage.message.id;
    assert.equal(messageId, bobMessage.message.id);

    bob.send({ type: 'text:react', messageId, emoji: ':heartred:' });
    const [aliceReaction, bobReaction] = await Promise.all([
      alice.waitForType('text:message-updated'),
      bob.waitForType('text:message-updated')
    ]);
    assert.deepEqual(aliceReaction.message.reactions, [
      { emoji: ':heartred:', userIds: [bob.id] }
    ]);
    assert.equal(bobReaction.message.reactions[0].userIds.length, 1);

    bob.send({ type: 'text:react', messageId, emoji: ':heartred:' });
    const [aliceRemoved, bobRemoved] = await Promise.all([
      alice.waitForType('text:message-updated'),
      bob.waitForType('text:message-updated')
    ]);
    assert.equal(aliceRemoved.message.reactions, undefined);
    assert.equal(bobRemoved.message.reactions, undefined);

    bob.send({ type: 'text:edit', messageId, text: 'Hacked' });
    const notAuthor = await bob.waitForType('error');
    assert.equal(notAuthor.code, 'not_author');

    alice.send({ type: 'text:edit', messageId, text: 'Edited text' });
    const [aliceEdited, bobEdited] = await Promise.all([
      alice.waitForType('text:message-updated'),
      bob.waitForType('text:message-updated')
    ]);
    assert.equal(aliceEdited.message.text, 'Edited text');
    assert.equal(bobEdited.message.text, 'Edited text');
    assert.ok(Number.isFinite(aliceEdited.message.editedAt));

    bob.send({ type: 'text:delete', messageId });
    const notDeleteAuthor = await bob.waitForType('error');
    assert.equal(notDeleteAuthor.code, 'not_author');

    alice.send({ type: 'text:delete', messageId });
    const [aliceDeleted, bobDeleted] = await Promise.all([
      alice.waitForType('text:message-updated'),
      bob.waitForType('text:message-updated')
    ]);
    assert.equal(aliceDeleted.message.text, '');
    assert.ok(Number.isFinite(aliceDeleted.message.deletedAt));
    assert.equal(bobDeleted.message.attachment, undefined);
    assert.equal(bobDeleted.message.reactions, undefined);
  } finally {
    alice.close();
    bob.close();
    await server.stop();
  }
});

test('voice rooms, signaling relay and leave notifications', async () => {
  const server = await startServer(tempDataDir());
  const alice = await connect(server.port, 'Alice');
  const bob = await connect(server.port, 'Bob');
  const charlie = await connect(server.port, 'Charlie');

  try {
    alice.send({ type: 'voice:join', roomId: 'lounge' });
    const aliceVoice = await alice.waitForType('voice:joined');
    assert.equal(aliceVoice.room.id, 'lounge');
    assert.deepEqual(aliceVoice.peers, []);

    bob.send({ type: 'voice:join', roomId: 'lounge' });
    const [bobVoice, aliceSawBob] = await Promise.all([
      bob.waitForType('voice:joined'),
      alice.waitForType('voice:peer-joined')
    ]);
    assert.deepEqual(bobVoice.peers.map((peer) => peer.nickname), ['Alice']);
    assert.equal(aliceSawBob.user.nickname, 'Bob');

    bob.send({
      type: 'voice:signal',
      to: alice.id,
      data: { kind: 'offer', sdp: { type: 'offer', sdp: 'fake-offer' } }
    });
    const offer = await alice.waitForType('voice:signal');
    assert.equal(offer.from, bob.id);
    assert.equal(offer.fromNickname, 'Bob');
    assert.equal(offer.data.kind, 'offer');
    assert.equal(offer.data.sdp.sdp, 'fake-offer');

    alice.send({
      type: 'voice:signal',
      to: bob.id,
      data: { kind: 'answer', sdp: { type: 'answer', sdp: 'fake-answer' } }
    });
    const answer = await bob.waitForType('voice:signal');
    assert.equal(answer.from, alice.id);
    assert.equal(answer.fromNickname, 'Alice');
    assert.equal(answer.data.kind, 'answer');

    charlie.send({ type: 'voice:signal', to: alice.id, data: { kind: 'offer', sdp: {} } });
    const notInVoice = await charlie.waitForType('error');
    assert.equal(notInVoice.code, 'not_in_voice');

    bob.send({ type: 'voice:leave' });
    await bob.waitForType('voice:left');
    const bobLeft = await alice.waitForType('voice:peer-left');
    assert.equal(bobLeft.user.nickname, 'Bob');

    alice.send({ type: 'voice:join', roomId: 'gaming' });
    const moved = await alice.waitForType('voice:joined');
    assert.equal(moved.room.id, 'gaming');
    assert.deepEqual(moved.peers, []);
  } finally {
    alice.close();
    bob.close();
    charlie.close();
    await server.stop();
  }
});

test('validation and rate limiting', async () => {
  const server = await startServer(tempDataDir());
  const alice = await connect(server.port, 'Alice');

  try {
    const fresh = await new TestClient(server.port).open();
    fresh.send({ type: 'hello', nickname: '   ' });
    const invalid = await fresh.waitForType('error');
    assert.equal(invalid.code, 'invalid_nickname');
    fresh.close();

    alice.send({ type: 'text:join', channelId: 'general' });
    await alice.waitForType('text:joined');

    alice.send({ type: 'text:message', text: 'x'.repeat(2001) });
    const tooLong = await alice.waitForType('error');
    assert.equal(tooLong.code, 'message_too_long');

    alice.send({ type: 'text:message', text: '   ' });
    const empty = await alice.waitForType('error');
    assert.equal(empty.code, 'empty_message');

    for (let index = 0; index < 6; index += 1) {
      alice.send({ type: 'text:message', text: `burst ${index}` });
    }
    const rateLimited = await alice.waitForType('error');
    assert.equal(rateLimited.code, 'rate_limited');
  } finally {
    alice.close();
    await server.stop();
  }
});

test('messages persist across server restarts', async () => {
  const dataDir = tempDataDir();
  let server = await startServer(dataDir);

  try {
    const alice = await connect(server.port, 'Alice');
    alice.send({ type: 'text:join', channelId: 'random' });
    await alice.waitForType('text:joined');
    alice.send({ type: 'text:message', text: 'this should survive' });
    await alice.waitForType('text:message');
    alice.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    await server.stop();
  }

  server = await startServer(dataDir);
  try {
    const bob = await connect(server.port, 'Bob');
    bob.send({ type: 'text:join', channelId: 'random' });
    const joined = await bob.waitForType('text:joined');
    assert.equal(joined.messages.length, 1);
    assert.equal(joined.messages[0].text, 'this should survive');
    assert.equal(joined.messages[0].nickname, 'Alice');
    bob.close();
  } finally {
    await server.stop();
  }
});

test('websocket is accepted at the root path too', async () => {
  const server = await startServer(tempDataDir());

  try {
    const client = await new TestClient(server.port, '/').open();
    client.send({ type: 'hello', nickname: 'Root', clientId: crypto.randomUUID() });
    const welcome = await client.waitForType('welcome');
    assert.equal(welcome.self.nickname, 'Root');
    client.close();
  } finally {
    await server.stop();
  }
});

test('health endpoint reports server state', async () => {  const server = await startServer(tempDataDir());
  const alice = await connect(server.port, 'Alice');

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.users, 1);
  } finally {
    alice.close();
    await server.stop();
  }
});
