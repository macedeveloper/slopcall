import WebSocket from 'ws';

const url = 'ws://31.77.9.218:8787';
const nickname = `probe${Math.floor(Math.random() * 10000)}`;
const ws = new WebSocket(url);
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const timer = setTimeout(() => {
  log('timeout');
  process.exit(2);
}, 12000);

ws.on('open', () => {
  log('open');
  ws.send(JSON.stringify({
    type: 'hello',
    nickname,
    clientId: `probe-${Math.random().toString(36).slice(2, 10)}`
  }));
});

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { log('raw', raw.toString()); return; }
  log('recv', msg.type, JSON.stringify(msg).slice(0, 700));
  if (msg.type === 'welcome') {
    ws.send(JSON.stringify({ type: 'voice:join', roomId: 'lounge' }));
  }
  if (msg.type === 'voice:joined') {
    setTimeout(() => ws.send(JSON.stringify({ type: 'voice:leave' })), 500);
  }
  if (msg.type === 'voice:left') {
    clearTimeout(timer);
    ws.close();
    process.exit(0);
  }
  if (msg.type === 'error') {
    log('SERVER ERROR', msg.code, msg.message);
  }
});

ws.on('error', (error) => {
  log('ws error', error.message);
});

ws.on('close', (code, reason) => {
  log('close', code, reason.toString());
  clearTimeout(timer);
  process.exit(0);
});
