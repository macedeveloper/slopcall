<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/state.svelte';
  import { loadImagePreview } from '../lib/image-preview';

  let {
    url,
    name,
    contentType
  }: {
    url: string;
    name: string;
    contentType: string;
  } = $props();

  let src = $state('');
  let failed = $state(false);
  let loading = $state(true);

  function onImageError(): void {
    src = '';
    failed = true;
    loading = false;
  }

  onMount(() => {
    let cancelled = false;

    void loadImagePreview(url, name, contentType)
      .then((value) => {
        if (!cancelled) {
          src = value;
          loading = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          failed = true;
          loading = false;
        }
      });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if src}
  <img
    src={src}
    alt={name}
    loading="lazy"
    draggable="false"
    onerror={onImageError}
  />
{:else if failed}
  <span class="image-note">{app.t('chat.imagePreviewFailed')}</span>
{:else if loading}
  <span class="image-note">{app.t('chat.imageLoading')}</span>
{/if}

<style>
  img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 320px;
    object-fit: contain;
  }

  .image-note {
    display: block;
    padding: 18px;
    color: var(--text-faint);
    font-size: 13px;
    line-height: 1.4;
  }
</style>
