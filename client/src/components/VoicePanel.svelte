<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { formatVolume } from '../lib/format';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  function changeVolume(peerId: string, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    app.setPeerVolume(peerId, Number(input.value) / 100);
  }

  function retry(): void {
    if (app.voiceErrorRoomId) {
      void app.joinVoiceRoom(app.voiceErrorRoomId);
    }
  }
</script>

<aside class="voice-panel" aria-label={app.t('voice.title')}>
  <header class="panel-header">
    <div class="title">
      <span class="title-icon"><Icon name="phone" size={18} /></span>
      <div class="title-text">
        <h2>{app.voiceRoomName || app.t('voice.title')}</h2>
        <span class="subtitle" class:ok={app.voiceStatus === 'connected'} class:bad={app.voiceStatus === 'error'}>
          {app.voiceStatusLabel()}
        </span>
      </div>
    </div>
    <button
      type="button"
      class="icon-button"
      title={app.t('voice.leave')}
      aria-label={app.t('voice.leave')}
      onclick={() => app.leaveVoiceRoom()}
    >
      <Icon name="leave" size={18} />
    </button>
  </header>

  {#if app.voiceStatus === 'error'}
    <div class="error-block" role="alert">
      <Icon name="warning" size={24} />
      <p>{app.voiceError}</p>
      <div class="error-actions">
        {#if app.voiceErrorRoomId}
          <button type="button" class="primary" onclick={retry}>{app.t('common.retry')}</button>
        {/if}
        <button type="button" class="secondary" onclick={() => app.dismissVoiceError()}>
          {app.t('common.dismiss')}
        </button>
      </div>
    </div>
  {:else if app.voiceStatus === 'joining'}
    <div class="joining">
      <span class="joining-icon"><Icon name="phone" size={28} /></span>
      <p>{app.t('voice.joining')}</p>
      <button type="button" class="secondary" onclick={() => app.leaveVoiceRoom()}>
        {app.t('common.cancel')}
      </button>
    </div>
  {:else if app.voiceStatus === 'connected'}
    <div class="participants">
      <div class="participant self">
        <Avatar name={app.nickname} src={app.avatar || undefined} size={40} speaking={app.selfSpeaking} />
        <div class="participant-main">
          <div class="participant-top">
            <span class="participant-name">
              {app.nickname}
              <span class="you">({app.t('voice.you')})</span>
            </span>
            {#if app.micMuted}
              <Icon name="micOff" size={15} />
            {:else}
              <Icon name="mic" size={15} />
            {/if}
          </div>
          <span class="participant-sub">
            {app.micMuted ? app.t('voice.micMuted') : app.t('voice.micOn')}
          </span>
        </div>
      </div>

      {#each app.voicePeers as peer (peer.id)}
        <div class="participant">
          <Avatar name={peer.nickname} src={peer.avatar} size={40} speaking={peer.speaking} />
          <div class="participant-main">
            <div class="participant-top">
              <span class="participant-name">{peer.nickname}</span>
              <span
                class="connection-state"
                class:ok={peer.connection === 'connected'}
                class:bad={peer.connection === 'failed' || peer.connection === 'disconnected'}
              >
                {app.peerStateLabel(peer.connection)}
              </span>
            </div>
            <div class="volume-row">
              <Icon name={peer.volume === 0 ? 'volumeOff' : 'volume'} size={16} />
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(peer.volume * 100)}
                aria-label="{app.t('voice.volume')}: {peer.nickname}"
                oninput={(event) => changeVolume(peer.id, event)}
              />
              <span class="volume-value">{formatVolume(peer.volume)}</span>
            </div>
          </div>
        </div>
      {/each}

      {#if app.voicePeers.length === 0}
        <p class="waiting">{app.t('voice.waiting')}</p>
      {/if}
    </div>

    <div class="panel-footer">
      <div class="participant-count">
        {app.t('voice.participantCount', {
          count: app.voicePeers.length + 1,
          max: app.limits.maxVoiceUsers
        })}
      </div>

      <div class="controls">
        <button
          type="button"
          class="control"
          class:active={app.micMuted}
          aria-pressed={app.micMuted}
          onclick={() => app.toggleMic()}
        >
          <Icon name={app.micMuted ? 'micOff' : 'mic'} size={18} />
          <span>{app.micMuted ? app.t('voice.unmute') : app.t('voice.mute')}</span>
          <kbd>Ctrl+Shift+M</kbd>
        </button>
        <button
          type="button"
          class="control"
          class:active={app.deafened}
          aria-pressed={app.deafened}
          onclick={() => app.toggleDeafen()}
        >
          <Icon name="headphones" size={18} />
          <span>{app.deafened ? app.t('voice.undeafen') : app.t('voice.deafen')}</span>
          <kbd>Ctrl+Shift+D</kbd>
        </button>
      </div>

      <p class="p2p-note">{app.t('voice.endToEnd')}</p>
    </div>
  {/if}
</aside>

<style>
  .voice-panel {
    width: 340px;
    flex: 0 0 340px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--elevated);
    border-left: 1px solid var(--divider);
    box-shadow: var(--shadow-sm);
  }

  .panel-header {
    height: 64px;
    flex: 0 0 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid var(--divider);
  }

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .title-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 9px;
    background: var(--high);
    color: var(--accent);
  }

  .title-text {
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subtitle {
    display: block;
    margin-top: 1px;
    color: var(--text-faint);
    font-size: 12px;
  }

  .subtitle.ok {
    color: var(--green);
  }

  .subtitle.bad {
    color: var(--red);
  }

  .icon-button {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 9px;
    background: transparent;
    color: var(--text-dim);
  }

  .icon-button:hover {
    background: var(--high);
    color: var(--text);
  }

  .participants {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .participant {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    background: var(--base);
  }

  .participant.self {
    background: var(--high);
  }

  .participant-main {
    flex: 1;
    min-width: 0;
  }

  .participant-top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .participant-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 600;
  }

  .you {
    color: var(--text-faint);
    font-size: 12px;
    font-weight: 500;
  }

  .participant-sub {
    display: block;
    margin-top: 2px;
    color: var(--text-faint);
    font-size: 12px;
  }

  .connection-state {
    color: var(--yellow);
    font-size: 11px;
    white-space: nowrap;
  }

  .connection-state.ok {
    color: var(--green);
  }

  .connection-state.bad {
    color: var(--red);
  }

  .volume-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    color: var(--text-faint);
  }

  .volume-row input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 24px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .volume-value {
    width: 38px;
    color: var(--text-dim);
    font-size: 11px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .waiting {
    margin: 24px 8px;
    color: var(--text-faint);
    font-size: 14px;
    text-align: center;
  }

  .panel-footer {
    flex: 0 0 auto;
    padding: 12px;
    border-top: 1px solid var(--divider);
    display: grid;
    gap: 10px;
  }

  .participant-count {
    color: var(--text-faint);
    font-size: 12px;
    text-align: center;
  }

  .controls {
    display: grid;
    gap: 8px;
  }

  .control {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border-radius: 9px;
    background: var(--high);
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
    text-align: left;
  }

  .control span {
    flex: 1;
    min-width: 0;
  }

  .control kbd {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    white-space: nowrap;
  }

  .control:hover {
    color: var(--text);
  }

  .control.active {
    background: rgba(229, 43, 59, 0.18);
    color: var(--red);
  }

  .control.active kbd {
    color: rgba(229, 43, 59, 0.75);
  }

  .p2p-note {
    margin: 0;
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.4;
    text-align: center;
  }

  .joining {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
  }

  .joining-icon {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: var(--high);
    color: var(--accent);
  }

  .joining p {
    margin: 0;
    color: var(--text-dim);
    font-size: 15px;
  }

  .error-block {
    margin: 16px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    border-radius: 12px;
    background: rgba(229, 43, 59, 0.12);
    color: var(--red);
  }

  .error-block p {
    margin: 0;
    color: var(--text);
    font-size: 14px;
    line-height: 1.45;
  }

  .error-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .error-actions button {
    min-height: 44px;
    padding: 8px 14px;
    font-size: 14px;
  }

  @media (max-width: 1080px) {
    .voice-panel {
      width: 300px;
      flex-basis: 300px;
    }

    .control kbd {
      display: none;
    }
  }
</style>
