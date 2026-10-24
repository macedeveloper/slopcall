export type SoundName =
  | 'mic-mute'
  | 'mic-unmute'
  | 'deafen'
  | 'undeafen'
  | 'voice-join'
  | 'voice-leave'
  | 'voice-error'
  | 'peer-join'
  | 'peer-leave'
  | 'message'
  | 'reconnected'
  | 'disconnect';

type SoundSettings = {
  enabled: boolean;
  volume: number;
};

const SOUND_FILES: Record<SoundName, string> = {
  'mic-mute': '/sounds/mic-mute.wav',
  'mic-unmute': '/sounds/mic-unmute.wav',
  deafen: '/sounds/deafen.wav',
  undeafen: '/sounds/undeafen.wav',
  'voice-join': '/sounds/voice-join.wav',
  'voice-leave': '/sounds/voice-leave.wav',
  'voice-error': '/sounds/voice-error.wav',
  'peer-join': '/sounds/peer-join.wav',
  'peer-leave': '/sounds/peer-leave.wav',
  message: '/sounds/message.wav',
  reconnected: '/sounds/reconnected.wav',
  disconnect: '/sounds/disconnect.wav'
};

/**
 * Small file-based sound player. Keeping the effects as separate WAV files
 * means they can be replaced without touching the event wiring in the app.
 */
export class SoundManager {
  private readonly cache = new Map<SoundName, HTMLAudioElement>();
  private unlocked = false;

  constructor(private readonly settings: () => SoundSettings) {
    if (typeof window === 'undefined') {
      return;
    }

    const unlock = (): void => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
  }

  play(name: SoundName): void {
    const { enabled, volume } = this.settings();
    if (!enabled || volume <= 0) {
      return;
    }

    const base = this.getAudio(name);
    const audio = base.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.min(1, Math.max(0, volume));

    void audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        // The next user gesture will unlock playback.
        return;
      }
      console.warn('[sound] playback failed', error);
    });
  }

  private unlock(): void {
    if (this.unlocked) {
      return;
    }
    this.unlocked = true;

    const audio = new Audio(SOUND_FILES['mic-unmute']);
    audio.muted = true;
    audio.volume = 0;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {
        // Autoplay policies can still reject this; normal gestures retry later.
      });
  }

  private getAudio(name: SoundName): HTMLAudioElement {
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }

    const audio = new Audio(SOUND_FILES[name]);
    audio.preload = 'auto';
    this.cache.set(name, audio);
    return audio;
  }
}
