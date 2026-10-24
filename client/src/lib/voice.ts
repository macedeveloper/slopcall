import type { VoiceSignal } from './types';

export type VoiceManagerEvents = {
  sendSignal: (to: string, data: VoiceSignal) => void;
  onSelfSpeaking: (speaking: boolean) => void;
  onPeerSpeaking: (peerId: string, speaking: boolean) => void;
  onPeerState: (peerId: string, state: RTCPeerConnectionState) => void;
  onError: (message: string) => void;
};

type AnalyserEntry = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  speaking: boolean;
};

const SPEAKING_THRESHOLD = 0.018;
const LEVEL_INTERVAL_MS = 120;

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
}

/**
 * One RTCPeerConnection per remote participant (full mesh).
 * The newest participant creates the offers; existing participants answer.
 */
export class VoiceManager {
  private localStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];
  private deviceId = '';
  private peers = new Map<string, RTCPeerConnection>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private audios = new Map<string, HTMLAudioElement>();
  private volumes = new Map<string, number>();
  private analysers = new Map<string, AnalyserEntry>();
  private audioContext: AudioContext | null = null;
  private levelTimer: number | null = null;
  private micMuted = false;
  private deafened = false;
  private active = false;

  constructor(private readonly events: VoiceManagerEvents) {}

  async join(iceServers: RTCIceServer[], deviceId = ''): Promise<void> {
    this.destroy();

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('getUserMedia is unavailable');
      error.name = 'NotSupportedError';
      throw error;
    }

    this.deviceId = deviceId;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this.audioConstraints()
    });

    this.active = true;
    this.localStream = stream;
    this.iceServers = iceServers;

    for (const track of stream.getAudioTracks()) {
      track.enabled = !this.micMuted;
    }

    this.ensureAudioContext();
    this.setupAnalyser('self', stream);
    this.startLevelLoop();
  }

  private audioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      ...(this.deviceId ? { deviceId: { ideal: this.deviceId } } : {})
    };
  }

  /**
   * Switches the microphone without leaving the call. Existing peer senders get
   * the new track through replaceTrack(), so the WebRTC connection stays up.
   */
  async setDevice(deviceId: string): Promise<void> {
    this.deviceId = deviceId;

    if (!this.active) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('getUserMedia is unavailable');
      error.name = 'NotSupportedError';
      throw error;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this.audioConstraints()
    });
    const track = stream.getAudioTracks()[0];

    if (!track) {
      for (const candidate of stream.getTracks()) {
        candidate.stop();
      }
      const error = new Error('No microphone track');
      error.name = 'NotFoundError';
      throw error;
    }

    track.enabled = !this.micMuted;

    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'audio');
      if (sender) {
        await sender.replaceTrack(track);
      }
    }

    const self = this.analysers.get('self');
    if (self) {
      self.source.disconnect();
      this.analysers.delete('self');
      if (self.speaking) {
        this.events.onSelfSpeaking(false);
      }
    }

    for (const oldTrack of this.localStream?.getTracks() ?? []) {
      oldTrack.stop();
    }

    this.localStream = stream;
    this.ensureAudioContext();
    this.setupAnalyser('self', stream);
  }

  startMesh(peers: Array<{ id: string }>): void {
    if (!this.active) {
      return;
    }

    for (const peer of peers) {
      void this.createOffer(peer.id);
    }
  }

  async handleSignal(peerId: string, signal: VoiceSignal): Promise<void> {
    if (!this.active) {
      return;
    }

    try {
      if (signal.kind === 'offer') {
        let pc = this.ensurePeer(peerId);

        if (pc.signalingState !== 'stable') {
          this.removePeer(peerId);
          pc = this.ensurePeer(peerId);
        }

        await pc.setRemoteDescription(signal.sdp);
        await this.flushCandidates(peerId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (pc.localDescription) {
          this.events.sendSignal(peerId, {
            kind: 'answer',
            sdp: pc.localDescription.toJSON()
          });
        }
        return;
      }

      if (signal.kind === 'answer') {
        const pc = this.peers.get(peerId);
        if (!pc) {
          return;
        }

        await pc.setRemoteDescription(signal.sdp);
        await this.flushCandidates(peerId, pc);
        return;
      }

      if (!signal.candidate) {
        return;
      }

      const pc = this.peers.get(peerId);
      if (!pc || !pc.remoteDescription) {
        const queued = this.pendingCandidates.get(peerId) ?? [];
        queued.push(signal.candidate);
        this.pendingCandidates.set(peerId, queued);
        return;
      }

      await pc.addIceCandidate(signal.candidate).catch((error: unknown) => {
        this.events.onError(errorText(error));
      });
    } catch (error) {
      this.events.onError(errorText(error));
    }
  }

  removePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      this.peers.delete(peerId);
    }

    this.pendingCandidates.delete(peerId);

    const audio = this.audios.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audios.delete(peerId);
    }

    const analyser = this.analysers.get(peerId);
    if (analyser) {
      analyser.source.disconnect();
      this.analysers.delete(peerId);
      if (analyser.speaking) {
        this.events.onPeerSpeaking(peerId, false);
      }
    }
  }

  setVolume(peerId: string, volume: number): void {
    const normalized = clampVolume(volume);
    this.volumes.set(peerId, normalized);

    const audio = this.audios.get(peerId);
    if (audio) {
      audio.volume = normalized;
    }
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;

    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }

    if (muted) {
      const self = this.analysers.get('self');
      if (self?.speaking) {
        self.speaking = false;
        this.events.onSelfSpeaking(false);
      }
    }
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    for (const audio of this.audios.values()) {
      audio.muted = deafened;
    }
  }

  destroy(): void {
    this.active = false;

    for (const peerId of [...this.peers.keys()]) {
      this.removePeer(peerId);
    }

    for (const [peerId, audio] of [...this.audios.entries()]) {
      audio.pause();
      audio.srcObject = null;
      this.audios.delete(peerId);
    }

    for (const track of this.localStream?.getTracks() ?? []) {
      track.stop();
    }
    this.localStream = null;

    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }

    for (const entry of this.analysers.values()) {
      entry.source.disconnect();
    }
    this.analysers.clear();

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.pendingCandidates.clear();
    this.iceServers = [];
    this.events.onSelfSpeaking(false);
  }

  isActive(): boolean {
    return this.active && this.localStream !== null;
  }

  debugInfo(): {
    audioContextState: AudioContextState | 'none';
    localTrackState: MediaStreamTrackState | 'none';
    localTrackEnabled: boolean | null;
  } {
    const track = this.localStream?.getAudioTracks()[0] ?? null;
    return {
      audioContextState: this.audioContext?.state ?? 'none',
      localTrackState: track?.readyState ?? 'none',
      localTrackEnabled: track?.enabled ?? null
    };
  }

  debug(): Array<{
    id: string;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    hasAudio: boolean;
    volume: number | null;
    muted: boolean | null;
    speaking: boolean;
  }> {
    return [...this.peers.entries()].map(([id, pc]) => {
      const audio = this.audios.get(id);
      return {
        id,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        hasAudio: Boolean(audio),
        volume: audio?.volume ?? null,
        muted: audio?.muted ?? null,
        speaking: this.analysers.get(id)?.speaking ?? false
      };
    });
  }

  private ensureAudioContext(): void {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => {});
    }
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    if (!this.active) {
      throw new Error('Voice is not active');
    }

    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle'
    });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.active) {
        this.events.sendSignal(peerId, {
          kind: 'ice',
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.ontrack = (event) => {
      if (!this.active) {
        return;
      }

      const stream = event.streams[0] ?? new MediaStream([event.track]);
      let audio = this.audios.get(peerId);

      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        this.audios.set(peerId, audio);
      }

      audio.srcObject = stream;
      audio.muted = this.deafened;
      audio.volume = clampVolume(this.volumes.get(peerId) ?? 1);
      void audio.play().catch(() => this.events.onError('audio-blocked'));

      if (!this.analysers.has(peerId)) {
        this.setupAnalyser(peerId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      this.events.onPeerState(peerId, pc.connectionState);
    };

    this.peers.set(peerId, pc);
    this.pendingCandidates.set(peerId, []);
    this.events.onPeerState(peerId, 'new');
    return pc;
  }

  private async createOffer(peerId: string): Promise<void> {
    if (!this.active) {
      return;
    }

    try {
      const pc = this.ensurePeer(peerId);
      if (pc.signalingState !== 'stable') {
        return;
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (pc.localDescription && this.active) {
        this.events.sendSignal(peerId, {
          kind: 'offer',
          sdp: pc.localDescription.toJSON()
        });
      }
    } catch (error) {
      this.events.onError(errorText(error));
    }
  }

  private async flushCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingCandidates.get(peerId);
    if (!queued || queued.length === 0) {
      return;
    }

    this.pendingCandidates.set(peerId, []);
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch((error: unknown) => {
        this.events.onError(errorText(error));
      });
    }
  }

  private setupAnalyser(id: string, stream: MediaStream): void {
    if (!this.audioContext || stream.getAudioTracks().length === 0) {
      return;
    }

    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      this.analysers.set(id, {
        source,
        analyser,
        data: new Uint8Array(analyser.fftSize),
        speaking: false
      });
    } catch {
      // Speaking indicators are optional; audio playback still works.
    }
  }

  private startLevelLoop(): void {
    if (this.levelTimer !== null) {
      return;
    }

    this.levelTimer = window.setInterval(() => {
      if (!this.audioContext || this.audioContext.state !== 'running') {
        return;
      }

      for (const [id, entry] of this.analysers) {
        entry.analyser.getByteTimeDomainData(entry.data);

        let sum = 0;
        for (const sample of entry.data) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / entry.data.length);

        let speaking = rms > SPEAKING_THRESHOLD;
        if (id === 'self' && this.micMuted) {
          speaking = false;
        }

        if (speaking !== entry.speaking) {
          entry.speaking = speaking;
          if (id === 'self') {
            this.events.onSelfSpeaking(speaking);
          } else {
            this.events.onPeerSpeaking(id, speaking);
          }
        }
      }
    }, LEVEL_INTERVAL_MS);
  }
}
