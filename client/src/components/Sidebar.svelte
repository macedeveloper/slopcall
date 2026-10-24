<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  function joinVoice(roomId: string): void {
    void app.joinVoiceRoom(roomId);
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
            <Icon name="hash" size={16} />
            <span class="channel-name">{channel.name}</span>
            {#if app.textChannelId === channel.id}
              <span class="active-marker" aria-hidden="true"></span>
            {/if}
          </button>
        {/each}
      {/if}
    </section>

    <section>
      <h2>{app.t('nav.voice')}</h2>
      {#each app.channels.voice as room (room.id)}
        <button
          type="button"
          class="channel"
          class:active={app.voiceRoomId === room.id}
          disabled={app.connection !== 'online'}
          onclick={() => joinVoice(room.id)}
        >
          <Icon name="phone" size={16} />
          <span class="channel-name">{room.name}</span>
          {#if app.voiceRoomId === room.id}
            <span class="live">
              <span class="dot"></span>
              {app.voiceStatus === 'joining' ? app.t('nav.connecting') : app.t('voice.connected')}
            </span>
          {/if}
        </button>
      {/each}
    </section>
  </nav>

  <div class="account">
    <div class="account-top">
      <Avatar name={app.nickname || '?'} src={app.avatar || undefined} size={40} speaking={app.selfSpeaking} />
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
      <button
        type="button"
        class="icon-button"
        title={app.t('nav.settings')}
        aria-label={app.t('nav.settings')}
        onclick={() => (app.settingsOpen = true)}
      >
        <Icon name="settings" size={18} />
      </button>
    </div>

    <div class="account-controls">
      <button
        type="button"
        class="control"
        class:active={app.micMuted}
        aria-pressed={app.micMuted}
        title="{app.micMuted ? app.t('voice.unmute') : app.t('voice.mute')} (Ctrl+Shift+M)"
        onclick={() => app.toggleMic()}
      >
        <Icon name={app.micMuted ? 'micOff' : 'mic'} size={17} />
        <span>{app.t('nav.mic')}</span>
      </button>
      <button
        type="button"
        class="control"
        class:active={app.deafened}
        aria-pressed={app.deafened}
        title="{app.deafened ? app.t('voice.undeafen') : app.t('voice.deafen')} (Ctrl+Shift+D)"
        onclick={() => app.toggleDeafen()}
      >
        <Icon name="headphones" size={17} />
        <span>{app.t('nav.audio')}</span>
      </button>
    </div>

    {#if app.connection === 'offline'}
      <button type="button" class="retry" onclick={() => app.reconnect()}>
        <Icon name="retry" size={15} />
        {app.t('nav.retry')}
      </button>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 280px;
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--elevated);
    border-right: 1px solid var(--divider);
    box-shadow: var(--shadow-sm);
  }

  .brand {
    height: 64px;
    flex: 0 0 64px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    box-shadow: var(--shadow-sm);
    z-index: 1;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
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
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .navigation {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 10px;
    display: flex;
    flex-direction: column;
    gap: 26px;
  }

  h2 {
    margin: 0 10px 6px;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .channel {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: transparent;
    color: var(--text-dim);
    font-size: 17px;
    font-weight: 500;
    text-align: left;
  }

  .channel:hover:not(:disabled) {
    background: var(--high);
    color: var(--text);
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

  .active-marker {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--green);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
  }

  .empty-nav {
    margin: 6px 10px;
    color: var(--text-faint);
    font-size: 14px;
  }

  .account {
    flex: 0 0 auto;
    padding: 12px;
    background: var(--base);
    border-top: 1px solid var(--divider);
    display: grid;
    gap: 10px;
  }

  .account-top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .account-meta {
    flex: 1;
    min-width: 0;
  }

  .account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 16px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    color: var(--text-faint);
    font-size: 12px;
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

  .icon-button {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: transparent;
    color: var(--text-dim);
  }

  .icon-button:hover {
    background: var(--high);
    color: var(--text);
  }

  .account-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .control {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 9px;
    background: var(--high);
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
  }

  .control:hover {
    color: var(--text);
  }

  .control.active {
    background: rgba(229, 43, 59, 0.18);
    color: var(--red);
  }

  .retry {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--base);
    font-size: 14px;
    font-weight: 700;
  }
</style>
