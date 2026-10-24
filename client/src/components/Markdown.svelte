<script lang="ts">
  import { parseMarkdown } from '../lib/markdown';

  let { text }: { text: string } = $props();
  let tokens = $derived(parseMarkdown(text));
</script>

{#each tokens as token, index (index)}
  {#if token.kind === 'emoji'}
    {#if token.href}
      <a class="md-link" href={token.href} target="_blank" rel="noopener noreferrer">
        <img
          class="inline-emoji"
          src={token.src}
          alt={`:${token.name}:`}
          title={`:${token.name}:`}
          draggable="false"
        />
      </a>
    {:else}
      <img
        class="inline-emoji"
        src={token.src}
        alt={`:${token.name}:`}
        title={`:${token.name}:`}
        draggable="false"
      />
    {/if}
  {:else if token.href}
    <a
      class="md-link"
      class:md-bold={token.bold}
      class:md-italic={token.italic}
      class:md-strike={token.strike}
      class:md-code={token.code}
      class:md-fun-dynamic-force={token.fun === 'dynamic-force'}
      class:md-fun-pcboy={token.fun === 'pcboy'}
      class:md-fun-ink={token.fun === 'ink'}
      class:md-fun-fusion={token.fun === 'fusion'}
      class:md-fun-tuc={token.fun === 'tuc'}
      href={token.href}
      target="_blank"
      rel="noopener noreferrer"
    >{token.text}</a>
  {:else}
    <span
      class:md-bold={token.bold}
      class:md-italic={token.italic}
      class:md-strike={token.strike}
      class:md-code={token.code}
      class:md-fun-dynamic-force={token.fun === 'dynamic-force'}
      class:md-fun-pcboy={token.fun === 'pcboy'}
      class:md-fun-ink={token.fun === 'ink'}
      class:md-fun-fusion={token.fun === 'fusion'}
      class:md-fun-tuc={token.fun === 'tuc'}
    >{token.text}</span>
  {/if}
{/each}

<style>
  .md-bold {
    font-weight: 700;
  }

  .md-italic {
    font-style: italic;
  }

  .md-strike {
    text-decoration: line-through;
  }

  .md-code {
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--high);
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .md-link {
    color: var(--blue);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .md-link:hover {
    color: #55aaff;
  }

  .md-fun-dynamic-force {
    display: inline-block;
    font-style: italic;
    font-weight: 700;
    background: linear-gradient(180deg, #ffff00 0%, #ff7f00 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  .md-fun-pcboy {
    display: inline-block;
    font-weight: 700;
    background: linear-gradient(180deg, #ffffff 0%, #dfdfdf 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  .md-fun-ink {
    font-weight: 700;
    color: #745793;
  }

  .md-fun-fusion {
    font-weight: 700;
    color: #a1a3b4;
  }

  .md-fun-tuc {
    font-weight: 700;
    color: #24e34e;
  }

  .inline-emoji {
    width: 1.25em;
    height: 1.25em;
    display: inline-block;
    object-fit: contain;
    vertical-align: -0.22em;
  }
</style>
