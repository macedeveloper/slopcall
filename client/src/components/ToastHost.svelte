<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each app.toasts as toast (toast.id)}
    <div class="toast" class:error={toast.kind === 'error'} class:success={toast.kind === 'success'} role="status">
      <span class="accent" aria-hidden="true"></span>
      <p>{toast.text}</p>
      <button
        type="button"
        class="dismiss"
        aria-label={app.t('common.dismiss')}
        title={app.t('common.dismiss')}
        onclick={() => app.dismissToast(toast.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    width: min(420px, calc(100vw - 36px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 10px 10px 0;
    border-radius: 10px;
    background: var(--top);
    box-shadow: var(--shadow);
    pointer-events: auto;
  }

  .accent {
    width: 4px;
    align-self: stretch;
    flex: 0 0 4px;
    border-radius: 0 3px 3px 0;
    background: var(--blue);
  }

  .toast.error .accent {
    background: var(--red);
  }

  .toast.success .accent {
    background: var(--green);
  }

  p {
    flex: 1;
    margin: 0;
    padding-top: 3px;
    color: var(--text);
    font-size: 14px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .dismiss {
    width: 32px;
    height: 32px;
    min-height: 32px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 7px;
    background: transparent;
    color: var(--text-faint);
  }

  .dismiss:hover {
    background: var(--high);
    color: var(--text);
  }
</style>
