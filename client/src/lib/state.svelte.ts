import { normalizeAvatar } from './avatar';
import { detectLocale, translate, type Locale, type TranslationKey } from './i18n';
import { defaultServerUrl, isTauri, normalizeServerUrl } from './platform';
import { SoundManager, type SoundName } from './sounds';
import { RealtimeClient } from './ws';
import { VoiceManager } from './voice';
import type {
  Attachment,
  Channels,
  ConnectionStatus,
  Message,
  ServerLimits,
  ServerMessage,
  Toast,
  ToastKind,
  User,
  VoicePeer,
  VoiceSignal,
  VoiceStatus,
  WelcomeMessage
} from './types';

const STORAGE = {
  nickname: 'slopcall.nickname',
  avatar: 'slopcall.avatar',
  language: 'slopcall.lang',
  server: 'slopcall.server',
  clientId: 'slopcall.clientId',
  volumes: 'slopcall.volumes',
  sounds: 'slopcall.sounds',
  soundVolume: 'slopcall.soundVolume',
  micDevice: 'slopcall.micDevice'
};

const APP_VERSION = '0.1.0';
const NICKNAME_LIMIT = 24;
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Settings persistence is best-effort.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Settings persistence is best-effort.
  }
}

function normalizeNickname(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_LIMIT);
}

function loadNickname(): string {
  const stored = readStorage(STORAGE.nickname);
  return stored ? normalizeNickname(stored) : '';
}

function loadAvatar(): string {
  return normalizeAvatar(readStorage(STORAGE.avatar));
}

function loadServerUrl(): string {
  const stored = readStorage(STORAGE.server);
  if (stored) {
    const normalized = normalizeServerUrl(stored);
    if (normalized) {
      return normalized;
    }
  }
  return defaultServerUrl();
}

function loadClientId(): string {
  const existing = readStorage(STORAGE.clientId);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
    return existing;
  }

  const generated =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  writeStorage(STORAGE.clientId, generated);
  return generated;
}

function loadVolumes(): Record<string, number> {
  const raw = readStorage(STORAGE.volumes);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const volumes: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        volumes[id] = Math.min(1, Math.max(0, value));
      }
    }
    return volumes;
  } catch {
    return {};
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
}

function loadMicDevice(): string {
  return readStorage(STORAGE.micDevice) ?? '';
}

function loadSoundsEnabled(): boolean {
  const stored = readStorage(STORAGE.sounds);
  return stored === null ? true : stored !== '0';
}

function loadSoundVolume(): number {
  const stored = readStorage(STORAGE.soundVolume);
  if (stored === null) {
    return 0.6;
  }

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? clampVolume(parsed) : 0.6;
}

export class AppState {
  locale = $state<Locale>(detectLocale());
  nickname = $state<string>(loadNickname());
  avatar = $state<string>(loadAvatar());
  serverUrl = $state<string>(loadServerUrl());
  showOnboarding = $state(loadNickname().length === 0);
  settingsOpen = $state(false);

  connection = $state<ConnectionStatus>('offline');
  selfId = $state('');
  channels = $state<Channels>({ text: [], voice: [] });
  limits = $state<ServerLimits>({
    maxUsers: 32,
    maxVoiceUsers: 12,
    maxMessageLength: 2000,
    historyLimit: 50
  });

  textChannelId = $state<string | null>(null);
  textUsers = $state<User[]>([]);
  typingUsers = $state<User[]>([]);
  messages = $state<Message[]>([]);
  textLoading = $state(false);

  voiceRoomId = $state<string | null>(null);
  voiceRoomName = $state('');
  voiceStatus = $state<VoiceStatus>('idle');
  voiceError = $state('');
  voiceErrorRoomId = $state<string | null>(null);
  voicePeers = $state<VoicePeer[]>([]);
  selfSpeaking = $state(false);
  micMuted = $state(false);
  deafened = $state(false);
  soundsEnabled = $state(loadSoundsEnabled());
  soundVolume = $state(loadSoundVolume());
  micDeviceId = $state(loadMicDevice());

  toasts = $state<Toast[]>([]);

  readonly version = APP_VERSION;

  private readonly realtime: RealtimeClient;
  private readonly voice: VoiceManager;
  private readonly sound = new SoundManager(() => ({
    enabled: this.soundsEnabled,
    volume: this.soundVolume
  }));
  private readonly clientId = loadClientId();
  private readonly storedVolumes = loadVolumes();
  private iceServers: RTCIceServer[] = [];
  private requestedTextChannelId: string | null = null;
  private requestedVoiceRoomId: string | null = null;
  private unlisteners: Array<() => void> = [];
  private initialized = false;
  private hadConnected = false;
  private hadDisconnect = false;
  private voiceJoinToken = 0;
  private toastSequence = 0;
  private volumeSaveTimer: number | null = null;
  private typingTimers = new Map<string, number>();
  private typingActive = false;
  private lastTypingSent = 0;
  private readonly eventLog: Array<{ at: string; text: string }> = [];

  private readonly windowErrorHandler = (event: ErrorEvent): void => {
    this.logEvent(`window error: ${event.message}`);
  };

  private readonly unhandledRejectionHandler = (event: PromiseRejectionEvent): void => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    this.logEvent(`unhandled rejection: ${reason}`);
  };

  private readonly keydownHandler = (event: KeyboardEvent): void => {
    // Tauri registers system-wide shortcuts in Rust. Browser dev gets a local fallback.
    if (isTauri()) {
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault();
      this.toggleMic();
    } else if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault();
      this.toggleDeafen();
    }
  };

  constructor() {
    this.realtime = new RealtimeClient({
      onStatus: (status) => this.handleStatus(status),
      onOpen: () => this.sendHello(),
      onMessage: (message) => this.handleServerMessage(message),
      onFatal: (code) => this.handleFatal(code),
      onClose: (code, reason) =>
        this.logEvent(`socket closed: ${code}${reason ? ` ${reason}` : ''}`)
    });

    this.voice = new VoiceManager({
      sendSignal: (to, data) => {
        this.realtime.send({ type: 'voice:signal', to, data });
      },
      onSelfSpeaking: (speaking) => {
        const next = speaking && !this.micMuted;
        if (this.selfSpeaking !== next) {
          this.selfSpeaking = next;
          void this.syncTray();
        }
      },
      onPeerSpeaking: (peerId, speaking) => {
        const peer = this.voicePeers.find((candidate) => candidate.id === peerId);
        if (peer) {
          peer.speaking = speaking;
        }
      },
      onPeerState: (peerId, state) => {
        const peer = this.voicePeers.find((candidate) => candidate.id === peerId);
        if (peer) {
          peer.connection = state;
        }
      },
      onError: (message) => this.handleVoiceError(message)
    });
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    document.documentElement.lang = this.locale;
    document.documentElement.style.colorScheme = 'dark';
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('error', this.windowErrorHandler);
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);

    if (import.meta.env.DEV) {
      (window as unknown as { __slopcall?: AppState }).__slopcall = this;
    }

    await this.setupTauri();

    if (this.showOnboarding) {
      this.connection = 'offline';
    } else {
      this.connect({ resetChannel: true });
    }
  }

  destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.initialized = false;
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('error', this.windowErrorHandler);
    window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);

    for (const unlisten of this.unlisteners.splice(0)) {
      try {
        unlisten();
      } catch {
        // Ignore teardown failures.
      }
    }

    this.voiceJoinToken += 1;
    this.realtime.stop();
    this.voice.destroy();
    this.clearTyping();
  }

  completeOnboarding(rawNickname: string): string | null {
    const nickname = normalizeNickname(rawNickname);
    if (!nickname) {
      return this.t('settings.invalidNickname');
    }

    this.nickname = nickname;
    writeStorage(STORAGE.nickname, nickname);
    this.showOnboarding = false;
    this.connect({ resetChannel: true });
    return null;
  }

  connect({ resetChannel = false } = {}): void {
    if (this.showOnboarding) {
      return;
    }

    this.voiceJoinToken += 1;
    this.voice.destroy();
    this.resetVoiceState();
    this.realtime.stop();
    this.connection = 'connecting';
    this.hadDisconnect = false;

    if (resetChannel) {
      this.hadConnected = false;
      this.textChannelId = null;
      this.requestedTextChannelId = null;
      this.textUsers = [];
      this.messages = [];
      this.textLoading = false;
      this.clearTyping();
    }

    this.realtime.connect(this.serverUrl);
  }

  reconnect(): void {
    this.connect();
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    document.documentElement.lang = locale;
    writeStorage(STORAGE.language, locale);
  }

  setAvatar(rawAvatar: string): boolean {
    const avatar = normalizeAvatar(rawAvatar);
    if (rawAvatar.trim() && !avatar) {
      return false;
    }

    this.avatar = avatar;
    if (avatar) {
      writeStorage(STORAGE.avatar, avatar);
    } else {
      removeStorage(STORAGE.avatar);
    }

    if (this.connection === 'online') {
      this.realtime.send({ type: 'profile:update', avatar });
    }
    return true;
  }

  avatarFor(userId: string): string | undefined {
    if (userId === this.selfId) {
      return this.avatar || undefined;
    }

    return (
      this.textUsers.find((user) => user.id === userId)?.avatar ??
      this.voicePeers.find((peer) => peer.id === userId)?.avatar
    );
  }

  applyPreferences(
    input: {
      locale: Locale;
      avatar: string;
      soundsEnabled: boolean;
      soundVolume: number;
      micDeviceId: string;
    },
    { switchMicrophone = true } = {}
  ): string | null {
    if (!this.setAvatar(input.avatar)) {
      return this.t('settings.avatarError');
    }

    const micChanged = input.micDeviceId !== this.micDeviceId;

    this.setLocale(input.locale);
    this.soundsEnabled = input.soundsEnabled;
    this.soundVolume = clampVolume(input.soundVolume);
    writeStorage(STORAGE.sounds, this.soundsEnabled ? '1' : '0');
    writeStorage(STORAGE.soundVolume, String(this.soundVolume));
    this.micDeviceId = input.micDeviceId;
    writeStorage(STORAGE.micDevice, this.micDeviceId);

    if (micChanged && switchMicrophone) {
      void this.switchMicrophone(this.micDeviceId);
    }

    return null;
  }

  applySettings(
    input: {
      locale: Locale;
      nickname: string;
      avatar: string;
      serverUrl: string;
      soundsEnabled: boolean;
      soundVolume: number;
      micDeviceId: string;
    },
    { close = true } = {}
  ): string | null {
    const nickname = normalizeNickname(input.nickname);
    if (!nickname) {
      return this.t('settings.invalidNickname');
    }

    const serverUrl = normalizeServerUrl(input.serverUrl);
    if (!serverUrl) {
      return this.t('settings.invalidServer');
    }

    const connectionChanged = nickname !== this.nickname || serverUrl !== this.serverUrl;

    const preferenceError = this.applyPreferences(input, {
      switchMicrophone: !connectionChanged
    });
    if (preferenceError) {
      return preferenceError;
    }

    this.nickname = nickname;
    writeStorage(STORAGE.nickname, nickname);
    this.serverUrl = serverUrl;
    writeStorage(STORAGE.server, serverUrl);

    if (close) {
      this.settingsOpen = false;
    }

    if (connectionChanged) {
      this.connect({ resetChannel: true });
    }

    return null;
  }

  async setMicDevice(deviceId: string): Promise<void> {
    if (deviceId === this.micDeviceId) {
      return;
    }

    this.micDeviceId = deviceId;
    writeStorage(STORAGE.micDevice, deviceId);
    await this.switchMicrophone(deviceId);
  }

  private async switchMicrophone(deviceId: string): Promise<void> {
    if (this.voiceStatus !== 'connected') {
      return;
    }

    try {
      await this.voice.setDevice(deviceId);
    } catch (error) {
      this.toast('error', this.microphoneErrorText(error));
    }
  }

  joinTextChannel(channelId: string): void {
    if (!this.realtime.isOpen()) {
      this.toast('error', this.t('toast.notConnected'));
      return;
    }

    if (this.textChannelId === channelId && !this.textLoading) {
      return;
    }

    this.textChannelId = channelId;
    this.requestedTextChannelId = channelId;
    this.textUsers = [];
    this.messages = [];
    this.textLoading = true;
    this.clearTyping();
    this.realtime.send({ type: 'text:join', channelId });
  }

  leaveTextChannel(): void {
    this.realtime.send({ type: 'text:leave' });
    this.textChannelId = null;
    this.requestedTextChannelId = null;
    this.textUsers = [];
    this.messages = [];
    this.textLoading = false;
    this.clearTyping();
  }

  sendMessage(rawText: string): boolean {
    const text = rawText.replace(/\u0000/g, '').trim();
    if (!text) {
      return false;
    }

    if (text.length > this.limits.maxMessageLength) {
      this.toast('error', this.t('toast.messageTooLong'));
      return false;
    }

    if (!this.realtime.isOpen() || !this.textChannelId) {
      this.toast('error', this.t('toast.notConnected'));
      return false;
    }

    this.setTyping(false);
    return this.realtime.send({ type: 'text:message', text });
  }

  private httpBase(): string {
    const url = new URL(this.serverUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  fileUrl(attachment: Attachment): string {
    if (/^https?:\/\//.test(attachment.url)) {
      return attachment.url;
    }
    return `${this.httpBase()}${attachment.url}`;
  }

  async sendFile(file: File, rawCaption: string): Promise<boolean> {
    if (!this.realtime.isOpen() || !this.textChannelId) {
      this.toast('error', this.t('toast.notConnected'));
      return false;
    }

    if (file.size === 0) {
      this.toast('error', this.t('toast.fileEmpty'));
      return false;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      this.toast('error', this.t('toast.fileTooLarge'));
      return false;
    }

    const caption = rawCaption.replace(/\u0000/g, '').trim();
    if (caption.length > this.limits.maxMessageLength) {
      this.toast('error', this.t('toast.messageTooLong'));
      return false;
    }

    const uploadUrl = `${this.httpBase()}/upload?name=${encodeURIComponent(file.name || 'file')}`;

    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file
      });
    } catch {
      this.toast('error', this.t('toast.fileUploadFailed'));
      return false;
    }

    if (!response.ok) {
      this.toast(
        'error',
        response.status === 413
          ? this.t('toast.fileTooLarge')
          : this.t('toast.fileUploadFailed')
      );
      return false;
    }

    let attachment: Attachment;
    try {
      attachment = (await response.json()) as Attachment;
    } catch {
      this.toast('error', this.t('toast.fileUploadFailed'));
      return false;
    }

    const sent = this.realtime.send({
      type: 'text:message',
      text: caption,
      attachmentId: attachment.id
    });

    this.setTyping(false);

    if (!sent) {
      this.toast('error', this.t('toast.notConnected'));
    }
    return sent;
  }

  setTyping(active: boolean): void {
    if (!this.textChannelId || this.connection !== 'online') {
      this.typingActive = false;
      return;
    }

    const now = Date.now();
    if (!active) {
      if (this.typingActive) {
        this.typingActive = false;
        this.lastTypingSent = now;
        this.realtime.send({ type: 'text:typing', typing: false });
      }
      return;
    }

    if (this.typingActive && now - this.lastTypingSent < 2000) {
      return;
    }

    this.typingActive = true;
    this.lastTypingSent = now;
    this.realtime.send({ type: 'text:typing', typing: true });
  }

  toggleReaction(messageId: string, emoji: string): void {
    if (!this.realtime.isOpen() || !this.textChannelId) {
      this.toast('error', this.t('toast.notConnected'));
      return;
    }
    this.realtime.send({ type: 'text:react', messageId, emoji });
  }

  editMessage(messageId: string, rawText: string): boolean {
    const text = rawText.replace(/\u0000/g, '').trim();
    if (!text) {
      return false;
    }

    if (text.length > this.limits.maxMessageLength) {
      this.toast('error', this.t('toast.messageTooLong'));
      return false;
    }

    if (!this.realtime.isOpen() || !this.textChannelId) {
      this.toast('error', this.t('toast.notConnected'));
      return false;
    }

    this.setTyping(false);
    return this.realtime.send({ type: 'text:edit', messageId, text });
  }

  deleteMessage(messageId: string): boolean {
    if (!this.realtime.isOpen() || !this.textChannelId) {
      this.toast('error', this.t('toast.notConnected'));
      return false;
    }

    return this.realtime.send({ type: 'text:delete', messageId });
  }

  private clearTyping(): void {
    for (const timer of this.typingTimers.values()) {
      window.clearTimeout(timer);
    }
    this.typingTimers.clear();
    this.typingUsers = [];
    this.typingActive = false;
  }

  private setTypingUser(user: User, typing: boolean): void {
    if (user.id === this.selfId) {
      return;
    }

    if (!typing) {
      const timer = this.typingTimers.get(user.id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.typingTimers.delete(user.id);
      }
      this.typingUsers = this.typingUsers.filter((candidate) => candidate.id !== user.id);
      return;
    }

    this.typingUsers = this.typingUsers.some((candidate) => candidate.id === user.id)
      ? this.typingUsers.map((candidate) => (candidate.id === user.id ? user : candidate))
      : [...this.typingUsers, user];

    const existing = this.typingTimers.get(user.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    this.typingTimers.set(
      user.id,
      window.setTimeout(() => this.setTypingUser(user, false), 4500)
    );
  }

  async joinVoiceRoom(roomId: string): Promise<void> {
    if (this.connection !== 'online') {
      this.toast('error', this.t('toast.notConnected'));
      return;
    }

    if (this.voiceStatus === 'connected' && this.voiceRoomId === roomId) {
      return;
    }

    if (this.voiceStatus === 'joining' && this.requestedVoiceRoomId === roomId) {
      return;
    }

    const token = ++this.voiceJoinToken;

    if (this.voiceStatus !== 'idle') {
      this.realtime.send({ type: 'voice:leave' });
      this.voice.destroy();
      this.resetVoiceState();
    }

    const room = this.channels.voice.find((candidate) => candidate.id === roomId);
    this.logEvent(`voice join requested: ${room?.name ?? roomId}`);
    this.voiceRoomName = room?.name ?? roomId;
    this.voiceStatus = 'joining';
    this.voiceError = '';
    this.voiceErrorRoomId = roomId;
    this.requestedVoiceRoomId = roomId;
    void this.syncTray();

    try {
      await this.voice.join(this.iceServers, this.micDeviceId);
    } catch (error) {
      if (token !== this.voiceJoinToken) {
        return;
      }
      this.voiceStatus = 'error';
      this.voiceError = this.microphoneErrorText(error);
      this.logEvent(`voice microphone error: ${this.voiceError}`);
      this.playSound('voice-error');
      void this.syncTray();
      return;
    }

    if (token !== this.voiceJoinToken) {
      this.voice.destroy();
      return;
    }

    this.voice.setMicMuted(this.micMuted);
    this.voice.setDeafened(this.deafened);

    const sent = this.realtime.send({ type: 'voice:join', roomId });
    if (!sent) {
      this.failVoiceJoin(this.t('toast.notConnected'));
    }
  }

  leaveVoiceRoom(): void {
    if (this.voiceStatus === 'idle') {
      return;
    }

    this.voiceJoinToken += 1;
    this.realtime.send({ type: 'voice:leave' });
    this.voice.destroy();
    this.resetVoiceState();
    this.playSound('voice-leave');
    this.toast('info', this.t('toast.voiceLeft'));
  }

  dismissVoiceError(): void {
    this.voiceJoinToken += 1;
    this.voice.destroy();
    this.resetVoiceState();
  }

  toggleMic(): void {
    this.micMuted = !this.micMuted;
    this.voice.setMicMuted(this.micMuted);

    if (this.micMuted) {
      this.selfSpeaking = false;
    }

    this.playSound(this.micMuted ? 'mic-mute' : 'mic-unmute', { ignoreDeafen: true });
    void this.syncTray();
  }

  toggleDeafen(): void {
    this.deafened = !this.deafened;
    this.voice.setDeafened(this.deafened);
    this.playSound(this.deafened ? 'deafen' : 'undeafen', { ignoreDeafen: true });
    void this.syncTray();
  }

  setPeerVolume(peerId: string, volume: number): void {
    const peer = this.voicePeers.find((candidate) => candidate.id === peerId);
    if (!peer) {
      return;
    }

    peer.volume = clampVolume(volume);
    this.voice.setVolume(peerId, peer.volume);
    this.storedVolumes[peerId] = peer.volume;

    if (this.volumeSaveTimer !== null) {
      window.clearTimeout(this.volumeSaveTimer);
    }
    this.volumeSaveTimer = window.setTimeout(() => {
      writeStorage(STORAGE.volumes, JSON.stringify(this.storedVolumes));
      this.volumeSaveTimer = null;
    }, 250);
  }

  toast(kind: ToastKind, text: string): void {
    if (kind === 'error') {
      this.logEvent(`error toast: ${text}`);
    }

    const toast: Toast = { id: ++this.toastSequence, kind, text };
    this.toasts.push(toast);

    if (this.toasts.length > 3) {
      this.toasts.splice(0, this.toasts.length - 3);
    }

    window.setTimeout(() => this.dismissToast(toast.id), 5000);
  }

  dismissToast(id: number): void {
    const index = this.toasts.findIndex((toast) => toast.id === id);
    if (index !== -1) {
      this.toasts.splice(index, 1);
    }
  }

  private playSound(name: SoundName, options: { ignoreDeafen?: boolean } = {}): void {
    if (this.deafened && !options.ignoreDeafen) {
      return;
    }
    this.sound.play(name);
  }

  t(key: TranslationKey, variables?: Record<string, string | number>): string {
    return translate(this.locale, key, variables);
  }

  statusLabel(): string {
    switch (this.connection) {
      case 'online':
        return this.t('nav.connected');
      case 'connecting':
        return this.t('nav.connecting');
      case 'reconnecting':
        return this.t('nav.reconnecting');
      default:
        return this.t('nav.offline');
    }
  }

  voiceStatusLabel(): string {
    switch (this.voiceStatus) {
      case 'connected':
        return this.t('voice.connected');
      case 'joining':
        return this.t('voice.joining');
      case 'error':
        return this.t('voice.failed');
      default:
        return this.t('voice.disconnected');
    }
  }

  peerStateLabel(state: VoicePeer['connection']): string {
    switch (state) {
      case 'connected':
        return this.t('voice.connected');
      case 'failed':
        return this.t('voice.failed');
      case 'disconnected':
        return this.t('voice.disconnected');
      default:
        return this.t('voice.connecting');
    }
  }

  debugVoice(): ReturnType<VoiceManager['debug']> {
    return this.voice.debug();
  }

  async diagnostics(): Promise<string> {
    const lines: string[] = ['Slopcall diagnostics'];
    const add = (key: string, value: string | number | boolean | null | undefined): void => {
      lines.push(`${key}: ${value ?? '-'}`);
    };

    add('version', this.version);
    add('time', new Date().toISOString());
    add('locale', this.locale);
    add('server', this.serverUrl);
    add('connection', this.connection);
    add('nickname', this.nickname || '-');
    add('selfId', this.selfId || '-');
    add('textChannel', this.textChannelId || '-');
    add('voiceStatus', this.voiceStatus);
    add('voiceRoom', this.voiceRoomId ? `${this.voiceRoomName} (${this.voiceRoomId})` : '-');
    add('voiceError', this.voiceError || '-');
    add('micMuted', this.micMuted);
    add('deafened', this.deafened);
    add('micDevice', this.micDeviceId ? 'custom device' : 'system default');
    add(
      'iceServers',
      this.iceServers
        .map((server) => (Array.isArray(server.urls) ? server.urls.join(',') : server.urls))
        .join(' | ') || 'none'
    );

    const voiceInfo = this.voice.debugInfo();
    add('audioContext', voiceInfo.audioContextState);
    add('localTrack', voiceInfo.localTrackState);
    add('localTrackEnabled', voiceInfo.localTrackEnabled);
    add('microphonePermission', await this.microphonePermission());
    add('microphones', await this.microphoneSummary());

    add('tauri', isTauri());
    add('online', navigator.onLine);
    add('visibility', document.visibilityState);
    add('platform', navigator.platform || '-');
    add('language', navigator.language || '-');
    add('screen', `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}x`);
    add('userAgent', navigator.userAgent);

    const peers = this.debugVoice();
    lines.push('voicePeers:');
    if (peers.length === 0) {
      lines.push('- none');
    } else {
      for (const peer of peers) {
        const known = this.voicePeers.find((candidate) => candidate.id === peer.id);
        lines.push(
          `- ${known?.nickname ?? 'unknown'} (${peer.id.slice(0, 8)}): ` +
            `connection=${peer.connectionState}, ice=${peer.iceConnectionState}, ` +
            `audio=${peer.hasAudio}, volume=${peer.volume ?? '-'}, ` +
            `muted=${peer.muted ?? '-'}, speaking=${peer.speaking}`
        );
      }
    }

    lines.push('recentEvents:');
    if (this.eventLog.length === 0) {
      lines.push('- none');
    } else {
      for (const event of this.eventLog.slice(-25)) {
        lines.push(`- ${event.at} ${event.text}`);
      }
    }

    return lines.join('\n');
  }

  private logEvent(text: string): void {
    this.eventLog.push({ at: new Date().toISOString(), text });
    if (this.eventLog.length > 60) {
      this.eventLog.splice(0, this.eventLog.length - 60);
    }
  }

  private async microphonePermission(): Promise<string> {
    try {
      if (!navigator.permissions?.query) {
        return 'unsupported';
      }
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state;
    } catch {
      return 'unknown';
    }
  }

  private async microphoneSummary(): Promise<string> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return 'unsupported';
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      return `${microphones.length}${microphones.some((device) => device.label) ? ' (labels available)' : ''}`;
    } catch {
      return 'unknown';
    }
  }

  private sendHello(): void {
    this.realtime.send({
      type: 'hello',
      nickname: this.nickname,
      avatar: this.avatar,
      clientId: this.clientId
    });
  }

  private handleStatus(status: ConnectionStatus): void {
    const previous = this.connection;
    this.logEvent(`connection: ${previous} -> ${status}`);

    if (status === 'reconnecting' && previous === 'online') {
      this.hadDisconnect = true;
      this.toast('info', this.t('toast.connectionLost'));
      this.playSound('disconnect');
    }

    this.connection = status;

    if (status === 'reconnecting' || status === 'offline') {
      this.voiceJoinToken += 1;
      this.voice.destroy();
      if (this.voiceStatus !== 'idle') {
        this.resetVoiceState();
      }
      this.textUsers = [];
      this.clearTyping();
    }
  }

  private handleWelcome(message: WelcomeMessage): void {
    this.selfId = message.self.id;
    this.nickname = message.self.nickname;
    const serverAvatar = normalizeAvatar(message.self.avatar ?? '');
    if (serverAvatar !== this.avatar) {
      this.avatar = serverAvatar;
      if (serverAvatar) {
        writeStorage(STORAGE.avatar, serverAvatar);
      } else {
        removeStorage(STORAGE.avatar);
      }
    }
    this.channels = message.channels;
    this.limits = message.limits;
    this.iceServers = message.iceServers;
    this.connection = 'online';
    this.logEvent(`welcome: ${this.iceServers.length} ICE server(s)`);

    const wasReconnecting = this.hadDisconnect;
    this.hadDisconnect = false;
    if (wasReconnecting) {
      this.toast('success', this.t('toast.reconnected'));
      this.playSound('reconnected');
    }

    if (this.textChannelId) {
      this.requestedTextChannelId = this.textChannelId;
      this.textLoading = this.messages.length === 0;
      this.realtime.send({ type: 'text:join', channelId: this.textChannelId });
    } else if (!this.hadConnected) {
      const fallback = this.channels.text[0]?.id;
      if (fallback) {
        this.joinTextChannel(fallback);
      }
    }

    this.hadConnected = true;
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        break;

      case 'text:joined':
        if (this.requestedTextChannelId && message.channel.id !== this.requestedTextChannelId) {
          return;
        }
        this.requestedTextChannelId = null;
        this.textChannelId = message.channel.id;
        this.messages = message.messages;
        this.textUsers = message.users;
        this.textLoading = false;
        this.clearTyping();
        break;

      case 'text:left':
        if (this.textChannelId === message.channelId) {
          this.textChannelId = null;
          this.messages = [];
          this.textUsers = [];
          this.clearTyping();
        }
        this.textLoading = false;
        break;

      case 'text:peer-joined':
        if (message.channelId === this.textChannelId) {
          if (!this.textUsers.some((user) => user.id === message.user.id)) {
            this.textUsers.push(message.user);
          }
        }
        break;

      case 'text:peer-left':
        this.setTypingUser(message.user, false);
        this.textUsers = this.textUsers.filter((user) => user.id !== message.user.id);
        break;

      case 'text:typing':
        if (message.channelId === this.textChannelId) {
          this.setTypingUser(message.user, message.typing);
        }
        break;

      case 'profile:updated':
        this.applyUserProfile(message.user);
        break;

      case 'text:message':
        if (message.message.channelId === this.textChannelId) {
          this.messages.push(message.message);
          if (this.messages.length > 1000) {
            this.messages.splice(0, this.messages.length - 1000);
          }
          if (message.message.userId !== this.selfId && !document.hasFocus()) {
            this.playSound('message');
          }
        }
        break;

      case 'text:message-updated':
        if (message.message.channelId === this.textChannelId) {
          const index = this.messages.findIndex((candidate) => candidate.id === message.message.id);
          if (index !== -1) {
            this.messages[index] = message.message;
          }
        }
        break;

      case 'voice:joined':
        if (this.voiceStatus !== 'joining' || this.requestedVoiceRoomId !== message.room.id) {
          return;
        }
        this.voiceRoomId = message.room.id;
        this.voiceRoomName = message.room.name;
        this.voiceStatus = 'connected';
        this.logEvent(`voice joined: ${message.room.name} (${message.peers.length} peer(s))`);
        this.voiceError = '';
        this.voiceErrorRoomId = null;
        this.voicePeers = message.peers.map((user) => this.makePeer(user));
        for (const peer of this.voicePeers) {
          this.voice.setVolume(peer.id, peer.volume);
        }
        this.voice.startMesh(message.peers);
        this.toast('success', this.t('toast.voiceJoined', { room: message.room.name }));
        this.playSound('voice-join');
        void this.syncTray();
        break;

      case 'voice:left':
        this.logEvent('voice left');
        this.voiceJoinToken += 1;
        this.voice.destroy();
        this.resetVoiceState();
        break;

      case 'voice:peer-joined':
        if (this.voiceStatus !== 'connected' || message.roomId !== this.voiceRoomId) {
          return;
        }
        if (!this.voicePeers.some((peer) => peer.id === message.user.id)) {
          const peer = this.makePeer(message.user);
          this.voicePeers.push(peer);
          this.voice.setVolume(peer.id, peer.volume);
          this.logEvent(`voice peer joined: ${message.user.nickname}`);
          this.playSound('peer-join');
        }
        break;

      case 'voice:peer-left': {
        const wasPresent = this.voicePeers.some((peer) => peer.id === message.user.id);
        this.voicePeers = this.voicePeers.filter((peer) => peer.id !== message.user.id);
        this.voice.removePeer(message.user.id);
        if (wasPresent && this.voiceStatus === 'connected') {
          this.logEvent(`voice peer left: ${message.user.nickname}`);
          this.playSound('peer-leave');
        }
        break;
      }

      case 'voice:signal': {
        if (this.voiceStatus !== 'connected') {
          return;
        }
        let peer = this.voicePeers.find((candidate) => candidate.id === message.from);
        if (!peer) {
          peer = this.makePeer({
            id: message.from,
            nickname: message.fromNickname ?? '…'
          });
          this.voicePeers.push(peer);
          this.voice.setVolume(peer.id, peer.volume);
        }
        void this.voice.handleSignal(message.from, message.data);
        break;
      }

      case 'error':
        this.handleServerError(message.code, message.message);
        break;

      case 'server:shutdown':
        this.toast('info', this.t('toast.serverShutdown'));
        break;

      case 'pong':
        break;
    }
  }

  private applyUserProfile(user: User): void {
    if (user.id === this.selfId) {
      const avatar = normalizeAvatar(user.avatar ?? '');
      this.avatar = avatar;
      if (avatar) {
        writeStorage(STORAGE.avatar, avatar);
      } else {
        removeStorage(STORAGE.avatar);
      }
      return;
    }

    this.textUsers = this.textUsers.map((candidate) =>
      candidate.id === user.id ? { ...candidate, avatar: user.avatar } : candidate
    );
    this.voicePeers = this.voicePeers.map((peer) =>
      peer.id === user.id ? { ...peer, avatar: user.avatar } : peer
    );
  }

  private handleServerError(code: string, message: string): void {
    switch (code) {
      case 'replaced':
      case 'server_full':
        // The socket close handler shows the fatal message.
        break;
      case 'rate_limited':
        this.toast('error', this.t('toast.rateLimited'));
        break;
      case 'message_too_long':
        this.toast('error', this.t('toast.messageTooLong'));
        break;
      case 'invalid_avatar':
        this.toast('error', this.t('settings.avatarError'));
        break;
      case 'voice_full':
        this.failVoiceJoin(this.t('voice.full'));
        break;
      case 'invalid_nickname':
        this.showOnboarding = true;
        this.connection = 'offline';
        this.realtime.stop();
        this.toast('error', this.t('settings.invalidNickname'));
        break;
      case 'unknown_channel':
        this.requestedTextChannelId = null;
        this.textChannelId = null;
        this.textLoading = false;
        break;
      case 'message_not_found':
        this.toast('error', this.t('toast.messageNotFound'));
        break;
      case 'not_author':
        this.toast('error', this.t('toast.notAuthor'));
        break;
      case 'invalid_message':
        this.toast('error', this.t('toast.invalidMessage'));
        break;
      case 'invalid_reaction':
        this.toast('error', this.t('toast.reactionFailed'));
        break;
      case 'reaction_limit':
        this.toast('error', this.t('toast.reactionLimit'));
        break;
      case 'not_ready':
        break;
      default:
        if (this.voiceStatus === 'joining') {
          this.failVoiceJoin(this.t('voice.unknownError', { error: message }));
        } else {
          this.toast('error', message || this.t('toast.error'));
        }
    }
  }

  private failVoiceJoin(errorText: string): void {
    const roomId = this.voiceErrorRoomId;
    this.voiceJoinToken += 1;
    this.voice.destroy();
    this.resetVoiceState();
    this.voiceStatus = 'error';
    this.voiceError = errorText;
    this.voiceErrorRoomId = roomId;
    this.logEvent(`voice join failed: ${errorText}`);
    this.playSound('voice-error');
    void this.syncTray();
  }

  private handleFatal(code: 'replaced' | 'server_full'): void {
    this.logEvent(`fatal: ${code}`);
    this.connection = 'offline';
    this.realtime.stop();
    this.voiceJoinToken += 1;
    this.voice.destroy();
    this.resetVoiceState();
    this.toast('error', this.t(code === 'replaced' ? 'toast.replaced' : 'toast.serverFull'));
  }

  private handleVoiceError(message: string): void {
    if (message === 'audio-blocked') {
      this.logEvent('voice audio blocked');
      this.toast('info', this.t('toast.audioBlocked'));
      return;
    }

    console.warn('[voice]', message);
    this.logEvent(`voice error: ${message}`);
    this.playSound('voice-error');
    this.toast('error', this.t('toast.error'));
  }

  private resetVoiceState(): void {
    this.voiceStatus = 'idle';
    this.voiceRoomId = null;
    this.voiceRoomName = '';
    this.voicePeers = [];
    this.voiceError = '';
    this.voiceErrorRoomId = null;
    this.requestedVoiceRoomId = null;
    this.selfSpeaking = false;
    void this.syncTray();
  }

  private makePeer(user: User): VoicePeer {
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      volume: this.storedVolumes[user.id] ?? 1,
      speaking: false,
      connection: 'new'
    };
  }

  private microphoneErrorText(error: unknown): string {
    const name =
      error instanceof DOMException
        ? error.name
        : error && typeof error === 'object' && 'name' in error
          ? String((error as { name: unknown }).name)
          : '';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return this.t('voice.denied');
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return this.t('voice.notFound');
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return this.t('voice.busy');
    }
    if (name === 'NotSupportedError') {
      return this.t('voice.noDevices');
    }

    const detail = error instanceof Error ? error.message : String(error);
    return this.t('voice.unknownError', { error: detail });
  }

  private async setupTauri(): Promise<void> {
    if (!isTauri()) {
      return;
    }

    try {
      const [{ listen }, { invoke }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/core')
      ]);

      this.unlisteners.push(
        await listen('slopcall://toggle-mute', () => this.toggleMic())
      );
      this.unlisteners.push(
        await listen('slopcall://toggle-deafen', () => this.toggleDeafen())
      );

      await invoke('set_audio_state', {
        micMuted: this.micMuted,
        deafened: this.deafened,
        inVoice: this.voiceStatus === 'connected',
        speaking: this.selfSpeaking
      });
    } catch (error) {
      console.warn('[tauri] tray bridge unavailable', error);
    }
  }

  private async syncTray(): Promise<void> {
    if (!isTauri()) {
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_audio_state', {
        micMuted: this.micMuted,
        deafened: this.deafened,
        inVoice: this.voiceStatus === 'connected',
        speaking: this.selfSpeaking
      });
    } catch {
      // Tray updates are best-effort.
    }
  }
}

export const app = new AppState();
