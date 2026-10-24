<script lang="ts">
  import { CONTESTMOJI_BY_NAME, contestmojiUrl } from '../lib/contestmoji';

  let { emoji, size = 18 }: { emoji: string; size?: number } = $props();

  let contestmoji = $derived.by(() => {
    const match = /^:([a-z0-9]+):$/.exec(emoji);
    return match ? CONTESTMOJI_BY_NAME.get(match[1]) : undefined;
  });
</script>

{#if contestmoji}
  <img
    class="contestmoji"
    src={contestmojiUrl(contestmoji.file)}
    alt={emoji}
    width={size}
    height={size}
    draggable="false"
  />
{:else}
  <span class="unicode" style:font-size={`${size}px`} aria-hidden="true">{emoji}</span>
{/if}

<style>
  .contestmoji {
    display: block;
    object-fit: contain;
  }

  .unicode {
    display: block;
    line-height: 1;
    font-family: var(--font-sans), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  }
</style>
