import type { ClientMessage, ConnectionStatus, ServerMessage } from './types';

export type RealtimeHandlers = {
  onStatus: (status: ConnectionStatus) => void;
  onOpen: () => void;
  onMessage: (message: ServerMessage) => void;
  onFatal: (code: 'replaced' | 'server_full') => void;
  onClose?: (code: number, reason: string) => void;
};

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private url = '';
  private reconnectTimer: number | null = null;
  private attempt = 0;
  private stopped = true;

  constructor(private readonly handlers: RealtimeHandlers) {}

  connect(url: string): void {
    this.stop();
    this.url = url;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.stopped = true;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.close(1000, 'client closed');
      } catch {
        // The socket may already be closed.
      }
    }
  }

  private open(): void {
    if (this.stopped) {
      return;
    }

    this.handlers.onStatus('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.handlers.onStatus('reconnecting');
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }

      this.attempt = 0;
      this.handlers.onOpen();
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }

      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      this.handlers.onMessage(message);
    });

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;

      if (this.stopped) {
        return;
      }

      this.handlers.onClose?.(event.code, event.reason);

      if (event.code === 4001) {
        this.stopped = true;
        this.handlers.onFatal('replaced');
        return;
      }

      if (event.code === 1013) {
        this.stopped = true;
        this.handlers.onFatal('server_full');
        return;
      }

      this.handlers.onStatus('reconnecting');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close event handles retries; errors are expected when the server is down.
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) {
      return;
    }

    this.attempt += 1;
    const backoff = Math.min(8000, 1000 * 2 ** Math.min(this.attempt - 1, 3));
    const delay = backoff + Math.round(Math.random() * 250);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}
