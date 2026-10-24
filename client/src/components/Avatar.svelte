<script lang="ts">
  let {
    name,
    src,
    size = 40,
    speaking = false
  }: {
    name: string;
    src?: string;
    size?: number;
    speaking?: boolean;
  } = $props();

  const palette = [
    { background: '#ff7a15', color: '#18181c' },
    { background: '#178cf2', color: '#ffffff' },
    { background: '#7a15ff', color: '#ffffff' },
    { background: '#EA508E', color: '#18181c' },
    { background: '#30D557', color: '#18181c' },
    { background: '#F7D023', color: '#18181c' },
    { background: '#E52B3B', color: '#ffffff' }
  ];

  function colorFor(value: string): { background: string; color: string } {
    let hash = 0;
    for (const character of value) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  let initial = $derived(Array.from(name.trim())[0]?.toUpperCase() ?? '?');
  let colors = $derived(colorFor(name));
</script>

<div
  class="avatar"
  class:speaking
  style:width="{size}px"
  style:height="{size}px"
  style:background={colors.background}
  style:color={colors.color}
  style:font-size="{Math.max(12, Math.round(size * 0.42))}px"
  aria-hidden="true"
>
  {initial}
  {#if src}
    {#key src}
      <img
        class="avatar-image"
        src={src}
        alt=""
        draggable="false"
        onerror={(event) => {
          (event.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    {/key}
  {/if}
</div>

<style>
  .avatar {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 50%;
    font-weight: 700;
    line-height: 1;
    user-select: none;
    outline: 0 solid transparent;
    outline-offset: 2px;
  }

  .avatar img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .avatar.speaking {
    outline: 2px solid var(--green);
  }
</style>
