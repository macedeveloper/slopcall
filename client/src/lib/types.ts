export type User = {
  id: string;
  nickname: string;
  avatar?: string;
};

export type TextChannel = {
  id: string;
  name: string;
};

export type VoiceRoom = {
  id: string;
  name: string;
};

export type Channels = {
  text: TextChannel[];
  voice: VoiceRoom[];
};

export type Attachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  url: string;
  expiresAt: number;
};

export type Reaction = {
  emoji: string;
  userIds: string[];
};

export type Message = {
  id: string;
  channelId: string;
  userId: string;
  nickname: string;
  text: string;
  ts: number;
  editedAt?: number;
  deletedAt?: number;
  attachment?: Attachment;
  reactions?: Reaction[];
};

export type ServerLimits = {
  maxUsers: number;
  maxVoiceUsers: number;
  maxMessageLength: number;
  historyLimit: number;
};

export type VoicePeer = {
  id: string;
  nickname: string;
  avatar?: string;
  volume: number;
  speaking: boolean;
  connection: RTCPeerConnectionState | 'new';
};

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';
export type VoiceStatus = 'idle' | 'joining' | 'connected' | 'error';
export type ToastKind = 'error' | 'info' | 'success';

export type Toast = {
  id: number;
  kind: ToastKind;
  text: string;
};

export type WelcomeMessage = {
  type: 'welcome';
  self: User;
  channels: Channels;
  iceServers: RTCIceServer[];
  limits: ServerLimits;
};

export type ServerMessage =
  | WelcomeMessage
  | { type: 'text:joined'; channel: TextChannel; messages: Message[]; users: User[] }
  | { type: 'text:left'; channelId: string }
  | { type: 'text:peer-joined'; channelId: string; user: User }
  | { type: 'text:peer-left'; channelId: string; user: User }
  | { type: 'text:message'; message: Message }
  | { type: 'text:typing'; channelId: string; user: User; typing: boolean }
  | { type: 'text:message-updated'; message: Message }
  | { type: 'profile:updated'; user: User }
  | {
      type: 'voice:joined';
      room: VoiceRoom;
      self: User;
      peers: User[];
      maxVoiceUsers: number;
    }
  | { type: 'voice:left'; roomId: string }
  | { type: 'voice:peer-joined'; roomId: string; user: User }
  | { type: 'voice:peer-left'; roomId: string; user: User }
  | {
      type: 'voice:signal';
      from: string;
      fromNickname?: string;
      data: VoiceSignal;
    }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; ts: number }
  | { type: 'server:shutdown' };

export type VoiceSignal =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit | null };

export type ClientMessage =
  | { type: 'hello'; nickname: string; avatar: string; clientId: string }
  | { type: 'text:join'; channelId: string }
  | { type: 'text:leave' }
  | { type: 'text:message'; text: string; attachmentId?: string }
  | { type: 'text:typing'; typing: boolean }
  | { type: 'text:react'; messageId: string; emoji: string }
  | { type: 'text:edit'; messageId: string; text: string }
  | { type: 'text:delete'; messageId: string }
  | { type: 'profile:update'; avatar: string }
  | { type: 'voice:join'; roomId: string }
  | { type: 'voice:leave' }
  | { type: 'voice:signal'; to: string; data: VoiceSignal }
  | { type: 'ping' };
