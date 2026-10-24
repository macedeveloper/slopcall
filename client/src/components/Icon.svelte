<script lang="ts">
  import { ICON_PATHS, type IconName } from '../lib/icons';

  let {
    name,
    size = 20,
    label = '',
    class: className = ''
  }: {
    name: IconName;
    size?: number;
    label?: string;
    class?: string;
  } = $props();
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="currentColor"
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
>
  {#each ICON_PATHS[name] as path}
    <path d={path} />
  {/each}
</svg>
