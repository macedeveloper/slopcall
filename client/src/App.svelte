<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/state.svelte';
  import { preloadContestmoji } from './lib/emojis';
  import Chat from './components/Chat.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ToastHost from './components/ToastHost.svelte';
  import VoicePanel from './components/VoicePanel.svelte';

  let ready = $state(false);

  onMount(() => {
    let active = true;
    void app.init().finally(() => {
      if (active) {
        ready = true;
      }
    });
    preloadContestmoji();

    return () => {
      active = false;
      app.destroy();
    };
  });
</script>

{#if !ready}
  <div class="splash" aria-label="Slopcall">
    <span class="splash-mark"><img src="/logo.png" alt="" /></span>
    <span class="splash-name">Slopcall</span>
  </div>
{:else if app.showOnboarding}
  <Onboarding />
{:else}
  <div class="app-shell">
    <Sidebar />
    <main class="workspace">
      <Chat />
      {#if app.voiceStatus !== 'idle'}
        <VoicePanel />
      {/if}
    </main>
  </div>

  {#if app.settingsOpen}
    <SettingsModal />
  {/if}
{/if}

<ToastHost />

<style>
  .splash {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--base);
  }

  .splash-mark {
    width: 48px;
    height: 48px;
    display: block;
  }

  .splash-mark img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }

  .splash-name {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .app-shell {
    min-height: 100vh;
    height: 100vh;
    display: flex;
    overflow: hidden;
    background: var(--base);
  }

  .workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
</style>
