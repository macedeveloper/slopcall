<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { formatVolume } from '../lib/format';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  // Peer whose volume popover is open (Discord opens it from the user row).
  let volumeFor = $state<string | null>(null);

  function joinVoice(roomId: string): void {
    void app.joinVoiceRoom(roomId);
  }

  function changeVolume(peerId: string, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    app.setPeerVolume(peerId, Number(input.value) / 100);
  }

  function toggleVolume(peerId: string): void {
    volumeFor = volumeFor === peerId ? null : peerId;
  }

  function retryVoice(): void {
    if (app.voiceErrorRoomId) {
      void app.joinVoiceRoom(app.voiceErrorRoomId);
    }
  }
</script>

<aside class="sidebar">
  <header class="brand">
    <span class="brand-mark"><img src="/logo.png" alt="" /></span>
    <span class="brand-name">Slopcall</span>
  </header>

  <nav class="navigation" aria-label="Channels">
    <section>
      <h2>{app.t('nav.text')}</h2>
      {#if app.channels.text.length === 0}
        <p class="empty-nav">{app.t('nav.connecting')}</p>
      {:else}
        {#each app.channels.text as channel (channel.id)}
          <button
            type="button"
            class="channel"
            class:active={app.textChannelId === channel.id}
            disabled={app.connection !== 'online'}
            onclick={() => app.joinTextChannel(channel.id)}
            aria-current={app.textChannelId === channel.id ? 'page' : undefined}
          >
            <span class="channel-icon"><Icon name="hash" size={18} /></span>
            <span class="channel-name">{channel.name}</span>
          </button>
        {/each}
      {/if}
    </section>

    <section>
      <h2>{app.t('nav.voice')}</h2>
      {#each app.channels.voice as room (room.id)}
        {@const current = app.voiceRoomId === room.id && app.voiceStatus === 'connected'}
        <button
          type="button"
          class="channel"
          class:active={app.voiceRoomId === room.id}
          disabled={app.connection !== 'online'}
          onclick={() => joinVoice(room.id)}
        >
          <span class="channel-icon"><Icon name="volume" size={18} /></span>
          <span class="channel-name">{room.name}</span>
          {#if current}
            <span class="room-count">{app.voicePeers.length + 1}/{app.limits.maxVoiceUsers}</span>
          {/if}
        </button>

        {#if current}
          <ul class="voice-users">
            <li class="voice-user self">
              <Avatar name={app.nickname} src={app.avatar || undefined} size={24} speaking={app.selfSpeaking} />
              <span class="voice-user-name">{app.nickname}</span>
              {#if app.deafened}
                <span class="voice-user-flag" title={app.t('voice.undeafen')}><Icon name="headphones" size={14} /></span>
              {:else if app.micMuted}
                <span class="voice-user-flag" title={app.t('voice.micMuted')}><Icon name="micOff" size={14} /></span>
              {/if}
            </li>
            {#each app.voicePeers as peer (peer.id)}
              <li class="participant">
                <button
                  type="button"
                  class="voice-user"
                  aria-expanded={volumeFor === peer.id}
                  title="{app.t('voice.volume')}: {peer.nickname}"
                  onclick={() => toggleVolume(peer.id)}
                >
                  <Avatar name={peer.nickname} src={peer.avatar} size={24} speaking={peer.speaking} />
                  <span class="voice-user-name">{peer.nickname}</span>
                  {#if peer.connection !== 'connected'}
                    <span
                      class="peer-state"
                      class:bad={peer.connection === 'failed' || peer.connection === 'disconnected'}
                    >
                      {app.peerStateLabel(peer.connection)}
                    </span>
                  {:else if peer.volume === 0}
                    <span class="voice-user-flag"><Icon name="volumeOff" size={14} /></span>
                  {/if}
                </button>
                {#if volumeFor === peer.id}
                  <div class="volume-pop">
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
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/each}
    </section>
  </nav>

  {#if app.voiceStatus !== 'idle'}
    <div
      class="voice-bar"
      class:joining={app.voiceStatus === 'joining'}
      class:error={app.voiceStatus === 'error'}
      role={app.voiceStatus === 'error' ? 'alert' : undefined}
    >
      <div class="voice-bar-top">
        <div class="voice-bar-text">
          <span class="voice-bar-status">
            <Icon name={app.voiceStatus === 'error' ? 'warning' : 'phone'} size={14} />
            {app.voiceStatusLabel()}
          </span>
          <span class="voice-bar-room">{app.voiceRoomName || app.t('voice.title')}</span>
        </div>
        {#if app.voiceStatus === 'error'}
          {#if app.voiceErrorRoomId}
            <button
              type="button"
              class="bar-button"
              title={app.t('common.retry')}
              aria-label={app.t('common.retry')}
              onclick={retryVoice}
            >
              <Icon name="retry" size={17} />
            </button>
          {/if}
          <button
            type="button"
            class="bar-button"
            title={app.t('common.dismiss')}
            aria-label={app.t('common.dismiss')}
            onclick={() => app.dismissVoiceError()}
          >
            <Icon name="close" size={16} />
          </button>
        {:else}
          <button
            type="button"
            class="bar-button"
            title={app.t('voice.leave')}
            aria-label={app.t('voice.leave')}
            onclick={() => app.leaveVoiceRoom()}
          >
            <Icon name="leave" size={18} />
          </button>
        {/if}
      </div>
      {#if app.voiceStatus === 'error' && app.voiceError}
        <p class="voice-bar-error">{app.voiceError}</p>
      {/if}
    </div>
  {/if}

  <div class="account">
    <Avatar name={app.nickname || '?'} src={app.avatar || undefined} size={32} speaking={app.selfSpeaking} />
    <div class="account-meta">
      <div class="account-name">{app.nickname}</div>
      <div class="status">
        <span
          class="status-dot"
          class:online={app.connection === 'online'}
          class:pending={app.connection === 'connecting' || app.connection === 'reconnecting'}
        ></span>
        {app.statusLabel()}
      </div>
    </div>
    {#if app.connection === 'offline'}
      <button
        type="button"
        class="account-button retry"
        title={app.t('nav.retry')}
        aria-label={app.t('nav.retry')}
        onclick={() => app.reconnect()}
      >
        <Icon name="retry" size={17} />
      </button>
    {/if}
    <button
      type="button"
      class="account-button"
      class:active={app.micMuted}
      aria-pressed={app.micMuted}
      aria-label={app.micMuted ? app.t('voice.unmute') : app.t('voice.mute')}
      title="{app.micMuted ? app.t('voice.unmute') : app.t('voice.mute')} (Ctrl+Shift+M)"
      onclick={() => app.toggleMic()}
    >
      <Icon name={app.micMuted ? 'micOff' : 'mic'} size={18} />
    </button>
    <button
      type="button"
      class="account-button"
      class:active={app.deafened}
      aria-pressed={app.deafened}
      aria-label={app.deafened ? app.t('voice.undeafen') : app.t('voice.deafen')}
      title="{app.deafened ? app.t('voice.undeafen') : app.t('voice.deafen')} (Ctrl+Shift+D)"
      onclick={() => app.toggleDeafen()}
    >
      <Icon name="headphones" size={18} />
    </button>
    <button
      type="button"
      class="account-button"
      title={app.t('nav.settings')}
      aria-label={app.t('nav.settings')}
      onclick={() => (app.settingsOpen = true)}
    >
      <Icon name="settings" size={18} />
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 260px;
    flex: 0 0 260px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--elevated);
  }

  .brand {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 16px;
    box-shadow: var(--shadow-sm);
    z-index: 1;
  }

  .brand-mark {
    width: 24px;
    height: 24px;
    display: block;
    flex: 0 0 auto;
  }

  .brand-mark img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }

  .brand-name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .navigation {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  h2 {
    margin: 0 8px 4px;
    color: var(--text-faint);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .channel {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    padding: 6px 8px;
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    font-size: 16px;
    font-weight: 500;
    line-height: 1.25;
    text-align: left;
  }

  .channel-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--text-faint);
  }

  .channel:hover:not(:disabled) {
    background: var(--high);
    color: var(--text-dim);
  }

  .channel.active {
    background: var(--high);
    color: var(--text);
  }

  .channel:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .channel-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .room-count {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--base);
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .empty-nav {
    margin: 6px 8px;
    color: var(--text-faint);
    font-size: 14px;
  }

  .voice-users {
    margin: 2px 0 4px;
    padding: 0 0 0 28px;
    list-style: none;
  }

  .voice-user {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: transparent;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
  }

  button.voice-user:hover,
  button.voice-user[aria-expanded='true'] {
    background: var(--high);
    color: var(--text);
  }

  .voice-user-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .voice-user-flag {
    display: grid;
    place-items: center;
    color: var(--red);
  }

  .peer-state {
    color: var(--yellow);
    font-size: 11px;
    white-space: nowrap;
  }

  .peer-state.bad {
    color: var(--red);
  }

  .volume-pop {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 0 6px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--base);
    color: var(--text-faint);
  }

  .volume-pop input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 20px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .volume-value {
    width: 34px;
    color: var(--text-dim);
    font-size: 11px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .voice-bar {
    flex: 0 0 auto;
    padding: 8px 8px 8px 12px;
    background: var(--base);
    border-bottom: 1px solid var(--divider);
  }

  .voice-bar-top {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .voice-bar-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .voice-bar-status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--green);
    font-size: 14px;
    font-weight: 700;
  }

  .voice-bar.joining .voice-bar-status {
    color: var(--yellow);
  }

  .voice-bar.error .voice-bar-status {
    color: var(--red);
  }

  .voice-bar-room {
    overflow: hidden;
    color: var(--text-faint);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .voice-bar-error {
    margin: 6px 0 2px;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.35;
  }

  .bar-button,
  .account-button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 6px;
    background: transparent;
    color: var(--text-dim);
  }

  .bar-button:hover,
  .account-button:hover {
    background: var(--high);
    color: var(--text);
  }

  .account {
    flex: 0 0 auto;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    background: var(--base);
  }

  .account-meta {
    flex: 1;
    min-width: 0;
    margin-left: 6px;
  }

  .account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 14px;
    line-height: 1.25;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1.3;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--special);
  }

  .status-dot.online {
    background: var(--green);
  }

  .status-dot.pending {
    background: var(--yellow);
  }

  .account-button.active {
    color: var(--red);
  }

  .account-button.retry {
    color: var(--accent);
  }
</style>
