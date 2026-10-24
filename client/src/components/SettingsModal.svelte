<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fileToAvatar } from '../lib/avatar';
  import { app } from '../lib/state.svelte';
  import type { Locale } from '../lib/i18n';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let draftLocale = $state<Locale>(app.locale);
  let draftNickname = $state(app.nickname);
  let draftAvatar = $state(app.avatar);
  let draftServer = $state(app.serverUrl);
  let draftSoundsEnabled = $state(app.soundsEnabled);
  let draftSoundVolume = $state(Math.round(app.soundVolume * 100));
  let draftMicDevice = $state(app.micDeviceId);
  let micDevices = $state<MediaDeviceInfo[]>([]);
  let micLabelsAvailable = $state(false);
  let error = $state('');
  let copyState = $state<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  let copyTimer: number | null = null;
  let nicknameInput: HTMLInputElement;
  let avatarInput: HTMLInputElement;

  let copyLabel = $derived(
    copyState === 'copied'
      ? app.t('settings.diagnosticsCopied')
      : copyState === 'failed'
        ? app.t('settings.diagnosticsFailed')
        : app.t('settings.copyDiagnostics')
  );

  async function writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back to the legacy path below.
      }
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) {
      throw new Error('copy failed');
    }
  }

  async function copyDiagnostics(): Promise<void> {
    if (copyState === 'copying') {
      return;
    }

    copyState = 'copying';
    try {
      await writeClipboard(await app.diagnostics());
      copyState = 'copied';
    } catch {
      copyState = 'failed';
    }

    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
    copyTimer = window.setTimeout(() => {
      copyState = 'idle';
      copyTimer = null;
    }, 2500);
  }

  async function chooseAvatar(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    error = '';
    try {
      draftAvatar = await fileToAvatar(file);
      savePreferences();
    } catch {
      error = app.t('settings.avatarError');
    }
  }

  function removeAvatar(): void {
    draftAvatar = '';
    savePreferences();
  }

  async function loadMicrophones(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      micDevices = [];
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      micDevices = devices.filter((device) => device.kind === 'audioinput');
      micLabelsAvailable = micDevices.some((device) => device.label.length > 0);
    } catch {
      micDevices = [];
    }
  }

  onMount(() => {
    nicknameInput?.focus();
    nicknameInput?.select();
    void loadMicrophones();

    const media = navigator.mediaDevices;
    const onDeviceChange = (): void => {
      void loadMicrophones();
    };
    media?.addEventListener?.('devicechange', onDeviceChange);

    return () => media?.removeEventListener?.('devicechange', onDeviceChange);
  });

  onDestroy(() => {
    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
  });

  function settingsInput() {
    return {
      locale: draftLocale,
      nickname: draftNickname,
      avatar: draftAvatar,
      serverUrl: draftServer,
      soundsEnabled: draftSoundsEnabled,
      soundVolume: draftSoundVolume / 100,
      micDeviceId: draftMicDevice
    };
  }

  function savePreferences(): void {
    const message = app.applyPreferences(settingsInput());
    error = message ?? '';
  }

  function saveIdentity(): void {
    const message = app.applySettings(settingsInput(), { close: false });
    error = message ?? '';
  }

  function close(): void {
    const message = app.applySettings(settingsInput());
    error = message ?? '';
  }

  function save(event: SubmitEvent): void {
    event.preventDefault();
    close();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      close();
    }
  }}
/>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      close();
    }
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
    <header>
      <h1 id="settings-title">{app.t('settings.title')}</h1>
      <button
        type="button"
        class="icon-button"
        title={app.t('settings.close')}
        aria-label={app.t('settings.close')}
        onclick={close}
      >
        <Icon name="close" size={18} />
      </button>
    </header>

    <form onsubmit={save}>
      <div class="section">
        <span class="section-label" id="settings-language-label">{app.t('settings.language')}</span>
        <div class="segmented" role="group" aria-labelledby="settings-language-label">
          <button
            type="button"
            class:active={draftLocale === 'en'}
            aria-pressed={draftLocale === 'en'}
            onclick={() => {
              draftLocale = 'en';
              savePreferences();
            }}>English</button>
          <button
            type="button"
            class:active={draftLocale === 'ru'}
            aria-pressed={draftLocale === 'ru'}
            onclick={() => {
              draftLocale = 'ru';
              savePreferences();
            }}>Русский</button>
        </div>
        <p class="hint">{app.t('settings.languageHint')}</p>
      </div>

      <div class="section">
        <label for="settings-nickname" class="section-label">{app.t('settings.nickname')}</label>
        <input
          id="settings-nickname"
          class="text-input"
          bind:this={nicknameInput}
          bind:value={draftNickname}
          maxlength="24"
          autocomplete="off"
          spellcheck="false"
          onblur={saveIdentity}
        />
      </div>

      <div class="section">
        <div class="section-label">{app.t('settings.avatar')}</div>
        <div class="avatar-row">
          <Avatar name={draftNickname || '?'} src={draftAvatar || undefined} size={64} />
          <div class="avatar-actions">
            <button type="button" class="secondary" onclick={() => avatarInput?.click()}>
              {app.t('settings.avatarChoose')}
            </button>
            {#if draftAvatar}
              <button type="button" class="secondary" onclick={removeAvatar}>
                {app.t('settings.avatarRemove')}
              </button>
            {/if}
          </div>
          <input
            bind:this={avatarInput}
            class="avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onchange={chooseAvatar}
          />
        </div>
        <p class="hint">{app.t('settings.avatarHint')}</p>
      </div>

      <div class="section">
        <label for="settings-server" class="section-label">{app.t('settings.server')}</label>
        <input
          id="settings-server"
          class="text-input"
          bind:value={draftServer}
          autocomplete="off"
          spellcheck="false"
          placeholder="ws://31.77.9.218:8787"
          onblur={saveIdentity}
        />
        <p class="hint">{app.t('settings.serverHint')}</p>
      </div>

      <div class="section">
        <div class="section-label">{app.t('settings.sounds')}</div>
        <label class="toggle-row">
          <input
            id="settings-sounds-enabled"
            type="checkbox"
            checked={draftSoundsEnabled}
            onchange={(event) => {
              draftSoundsEnabled = (event.currentTarget as HTMLInputElement).checked;
              savePreferences();
            }}
          />
          <span>{app.t('settings.soundsEnabled')}</span>
        </label>
        <div class="volume-row">
          <label for="settings-sound-volume">{app.t('settings.soundVolume')}</label>
          <input
            id="settings-sound-volume"
            class="volume-range"
            type="range"
            min="0"
            max="100"
            step="5"
            value={draftSoundVolume}
            oninput={(event) => {
              draftSoundVolume = Number((event.currentTarget as HTMLInputElement).value);
              savePreferences();
            }}
          />
          <span class="volume-value">{draftSoundVolume}%</span>
        </div>
        <p class="hint">{app.t('settings.soundsHint')}</p>
        <p class="hint">{app.t('settings.messageSoundNote')}</p>
      </div>

      <div class="section">
        <label for="settings-microphone" class="section-label">{app.t('settings.microphone')}</label>
        <select
          id="settings-microphone"
          class="text-input"
          value={draftMicDevice}
          onchange={(event) => {
            draftMicDevice = (event.currentTarget as HTMLSelectElement).value;
            savePreferences();
          }}
        >
          <option value="">{app.t('settings.microphoneDefault')}</option>
          {#each micDevices as device, index (device.deviceId || index)}
            <option value={device.deviceId}>
              {device.label || app.t('settings.microphoneN', { n: index + 1 })}
            </option>
          {/each}
          {#if draftMicDevice && !micDevices.some((device) => device.deviceId === draftMicDevice)}
            <option value={draftMicDevice}>{app.t('settings.microphoneUnavailable')}</option>
          {/if}
        </select>
        <p class="hint">{app.t('settings.microphoneHint')}</p>
        {#if micDevices.length > 0 && !micLabelsAvailable}
          <p class="hint">{app.t('settings.microphonePermission')}</p>
        {/if}
      </div>

      <div class="section">
        <div class="section-label">{app.t('settings.hotkeys')}</div>
        <div class="hotkey-row">
          <span>{app.t('settings.hotkeyMic')}</span>
          <span class="keys"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>M</kbd></span>
        </div>
        <div class="hotkey-row">
          <span>{app.t('settings.hotkeyDeafen')}</span>
          <span class="keys"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>D</kbd></span>
        </div>
        <p class="hint">{app.t('settings.hotkeyHint')}</p>
      </div>

      <div class="section">
        <div class="section-label">{app.t('settings.diagnostics')}</div>
        <p class="hint">{app.t('settings.diagnosticsHint')}</p>
        <button
          type="button"
          class="secondary diagnostics-button"
          disabled={copyState === 'copying'}
          onclick={copyDiagnostics}
        >
          {#if copyState === 'copied'}
            <Icon name="check" size={16} />
          {:else if copyState === 'failed'}
            <Icon name="warning" size={16} />
          {/if}
          {copyLabel}
        </button>
        <span class="sr-only" aria-live="polite">
          {copyState === 'copied'
            ? app.t('settings.diagnosticsCopied')
            : copyState === 'failed'
              ? app.t('settings.diagnosticsFailed')
              : ''}
        </span>
      </div>

      <div class="section about">
        <div class="section-label">{app.t('settings.about')}</div>
        <p class="hint">{app.t('settings.version', { version: app.version })}</p>
        <p class="hint">{app.t('settings.tray')}</p>
      </div>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <p class="hint voice-note">{app.t('settings.voiceNote')}</p>

      <footer>
        <button type="submit" class="primary">{app.t('settings.done')}</button>
      </footer>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.6);
  }

  .modal {
    width: min(540px, 100%);
    max-height: min(760px, calc(100vh - 48px));
    overflow-y: auto;
    border-radius: 16px;
    background: var(--top);
    box-shadow: var(--shadow);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid var(--divider);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
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

  form {
    padding: 8px 24px 24px;
  }

  .section {
    padding: 18px 0;
    border-bottom: 1px solid var(--divider);
  }

  .section:last-of-type {
    border-bottom: 0;
  }

  .section-label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 700;
  }

  .avatar-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .avatar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .avatar-file {
    display: none;
  }

  .segmented {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: var(--high);
  }

  .segmented button {
    min-width: 104px;
    min-height: 40px;
    padding: 6px 14px;
    border-radius: 7px;
    background: transparent;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
  }

  .segmented button.active {
    background: var(--accent);
    color: var(--base);
  }

  .text-input {
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--high);
    color: var(--text);
    font-size: 16px;
  }

  .text-input:focus,
  .text-input:focus-visible {
    border-color: transparent;
  }

  .toggle-row {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }

  .toggle-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    min-height: 0;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .volume-row {
    display: grid;
    grid-template-columns: auto minmax(80px, 1fr) 44px;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    color: var(--text);
    font-size: 14px;
  }

  .volume-range {
    width: 100%;
    min-height: 0;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .volume-range:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .volume-value {
    color: var(--text-faint);
    font-size: 12px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 8px 0 0;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1.45;
  }

  .hotkey-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    color: var(--text);
    font-size: 14px;
  }

  .keys {
    display: inline-flex;
    gap: 4px;
  }

  kbd {
    display: inline-block;
    padding: 3px 7px;
    border-radius: 5px;
    background: var(--high);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
  }

  .diagnostics-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  .about .hint {
    margin-top: 4px;
  }

  .error {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(229, 43, 59, 0.16);
    color: var(--red);
    font-size: 13px;
  }

  .voice-note {
    margin-top: 16px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--divider);
  }

  footer button {
    min-height: 44px;
    padding: 8px 18px;
    font-size: 14px;
  }

  @media (max-width: 560px) {
    .modal {
      max-height: calc(100vh - 24px);
    }

    form {
      padding: 4px 18px 18px;
    }

    header {
      padding: 14px 18px;
    }

    .segmented button {
      min-width: 0;
      flex: 1;
    }

    .segmented {
      display: flex;
    }
  }
</style>
