<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/state.svelte';

  let draft = $state('');
  let error = $state('');
  let input: HTMLInputElement;

  onMount(() => {
    input?.focus();
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    error = app.completeOnboarding(draft) ?? '';
  }
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') error = ''; }} />

<div class="onboarding">
  <div class="language-switch" aria-label={app.t('onboarding.language')}>
    <button
      type="button"
      class:active={app.locale === 'en'}
      aria-pressed={app.locale === 'en'}
      onclick={() => app.setLocale('en')}
    >EN</button>
    <button
      type="button"
      class:active={app.locale === 'ru'}
      aria-pressed={app.locale === 'ru'}
      onclick={() => app.setLocale('ru')}
    >RU</button>
  </div>

  <section class="card" aria-labelledby="onboarding-title">
    <div class="brand">
      <span class="brand-mark"><img src="/logo.png" alt="" /></span>
      <span class="brand-name">Slopcall</span>
    </div>

    <h1 id="onboarding-title">{app.t('onboarding.title')}</h1>
    <p class="subtitle">{app.t('onboarding.subtitle')}</p>

    <form onsubmit={submit}>
      <label for="nickname">{app.t('onboarding.nickname')}</label>
      <input
        id="nickname"
        bind:this={input}
        bind:value={draft}
        maxlength="24"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={app.t('onboarding.nicknamePlaceholder')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'nickname-error' : undefined}
      />
      {#if error}
        <p id="nickname-error" class="error" role="alert">{error}</p>
      {/if}
      <button class="primary join" type="submit">{app.t('onboarding.join')}</button>
    </form>

    <p class="note">{app.t('onboarding.note')}</p>
    <p class="tagline">{app.t('app.tagline')}</p>
  </section>
</div>

<style>
  .onboarding {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px;
    position: relative;
    background: var(--base);
  }

  .language-switch {
    position: absolute;
    top: 24px;
    right: 24px;
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: var(--elevated);
    box-shadow: var(--shadow-sm);
  }

  .language-switch button {
    min-width: 44px;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 7px;
    background: transparent;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 700;
  }

  .language-switch button.active {
    background: var(--high);
    color: var(--text);
  }

  .card {
    width: min(440px, 100%);
    padding: 40px;
    border-radius: 18px;
    background: var(--elevated);
    box-shadow: var(--shadow);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;
  }

  .brand-mark {
    width: 44px;
    height: 44px;
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
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  h1 {
    margin: 0 0 8px;
    font-size: clamp(30px, 5vw, 40px);
    line-height: 1.1;
    letter-spacing: -0.04em;
  }

  .subtitle {
    margin: 0 0 28px;
    color: var(--text-dim);
    font-size: 17px;
  }

  form {
    display: grid;
    gap: 10px;
  }

  label {
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
  }

  input {
    width: 100%;
    min-height: 52px;
    padding: 12px 14px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--high);
    color: var(--text);
    font-size: 18px;
  }

  input::placeholder {
    color: var(--text-faint);
  }

  input:focus,
  input:focus-visible {
    border-color: transparent;
  }

  .join {
    margin-top: 8px;
    min-height: 52px;
    font-size: 18px;
  }

  .error {
    margin: 0;
    color: var(--red);
    font-size: 14px;
  }

  .note {
    margin: 24px 0 0;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1.5;
  }

  .tagline {
    margin: 12px 0 0;
    color: var(--text-dim);
    font-size: 15px;
  }

  @media (max-width: 520px) {
    .onboarding {
      padding: 16px;
      align-items: start;
      padding-top: 72px;
    }

    .card {
      padding: 28px;
    }
  }
</style>
