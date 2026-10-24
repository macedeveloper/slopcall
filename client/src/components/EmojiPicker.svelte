<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/state.svelte';
  import { searchContestmoji } from '../lib/emojis';
  import type { TranslationKey } from '../lib/i18n';
  import {
    CONTESTMOJI,
    CONTESTMOJI_BY_NAME,
    CONTESTMOJI_CATEGORIES,
    contestmojiUrl,
    type Contestmoji,
    type ContestmojiCategory
  } from '../lib/contestmoji';
  import Icon from './Icon.svelte';

  type Section = {
    id: string;
    label: string;
    items: Contestmoji[];
  };

  type Props = {
    onpick: (name: string) => void;
    onclose: () => void;
  };

  let { onpick, onclose }: Props = $props();

  const RECENT_KEY = 'slopcall.recentEmoji';
  const RECENT_LIMIT = 12;
  const CATEGORY_LABEL_KEYS: Record<ContestmojiCategory, TranslationKey> = {
    faces: 'emoji.category.faces',
    cats: 'emoji.category.cats',
    hearts: 'emoji.category.hearts',
    flags: 'emoji.category.flags',
    buttons: 'emoji.category.buttons',
    music: 'emoji.category.music',
    nature: 'emoji.category.nature',
    objects: 'emoji.category.objects',
    symbols: 'emoji.category.symbols'
  };

  let query = $state('');
  let searchInput = $state<HTMLInputElement | null>(null);
  let recent = $state<string[]>(loadRecent());

  function loadRecent(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((name): name is string => typeof name === 'string' && CONTESTMOJI_BY_NAME.has(name))
        .slice(0, RECENT_LIMIT);
    } catch {
      return [];
    }
  }

  function remember(name: string): void {
    recent = [name, ...recent.filter((candidate) => candidate !== name)].slice(0, RECENT_LIMIT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Recent emojis are a convenience only.
    }
  }

  function pick(emoji: Contestmoji): void {
    remember(emoji.name);
    onpick(emoji.name);
  }

  function byName(name: string): Contestmoji | undefined {
    return CONTESTMOJI_BY_NAME.get(name);
  }

  let recentEmojis = $derived(
    recent.map(byName).filter((emoji): emoji is Contestmoji => emoji !== undefined)
  );
  let results = $derived(searchContestmoji(query));
  let sections = $derived.by((): Section[] => {
    if (query.trim()) {
      return [{ id: 'results', label: app.t('emoji.results'), items: results }];
    }

    const grouped: Section[] = [];
    if (recentEmojis.length > 0) {
      grouped.push({ id: 'recent', label: app.t('emoji.recent'), items: recentEmojis });
    }
    for (const category of CONTESTMOJI_CATEGORIES) {
      const items = CONTESTMOJI.filter((emoji) => emoji.category === category);
      if (items.length > 0) {
        grouped.push({
          id: `category-${category}`,
          label: app.t(CATEGORY_LABEL_KEYS[category]),
          items
        });
      }
    }
    return grouped;
  });

  onMount(() => {
    searchInput?.focus();
  });
</script>

<div
  class="picker"
  role="dialog"
  aria-label={app.t('emoji.title')}
  tabindex="-1"
>
  <header>
    <div class="title">
      <span class="eyebrow">{app.t('emoji.title')}</span>
      <span class="attribution">Mace Dev</span>
    </div>
    <button
      type="button"
      class="close"
      title={app.t('emoji.close')}
      aria-label={app.t('emoji.close')}
      onclick={onclose}
    >
      <Icon name="close" size={16} />
    </button>
  </header>

  <input
    bind:this={searchInput}
    bind:value={query}
    class="search"
    type="search"
    autocomplete="off"
    spellcheck="false"
    placeholder={app.t('emoji.search')}
    aria-label={app.t('emoji.search')}
  />

  <div class="scroll">
    {#if results.length === 0}
      <p class="empty">{app.t('emoji.noResults')}</p>
    {:else}
      {#each sections as section (section.id)}
        {#if section.items.length > 0}
          <div class="section-label">{section.label}</div>
          <div class="grid">
            {#each section.items as emoji (emoji.name)}
              <button
                type="button"
                class="emoji-button"
                title={`:${emoji.name}:`}
                aria-label={emoji.name}
                onclick={() => pick(emoji)}
              >
                <img src={contestmojiUrl(emoji.file)} alt="" draggable="false" />
              </button>
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <footer>
    <span>{app.t('emoji.source')}</span>
    <span>{app.t('emoji.insertHint')}</span>
  </footer>
</div>

<style>
  .picker {
    width: min(376px, calc(100vw - 24px));
    padding: 12px;
    border: 1px solid var(--divider);
    border-radius: 14px;
    background: var(--top);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 2px 10px;
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .eyebrow {
    color: var(--text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .attribution {
    color: var(--text-faint);
    font-size: 10px;
  }

  .close {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 8px;
    background: transparent;
    color: var(--text-dim);
  }

  .close:hover {
    background: var(--high);
    color: var(--text);
  }

  .search {
    width: 100%;
    min-height: 40px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--high);
    color: var(--text);
    font-size: 13px;
  }

  .search::placeholder {
    color: var(--text-faint);
  }

  .search:focus,
  .search:focus-visible {
    border-color: transparent;
  }

  .scroll {
    max-height: 342px;
    overflow-y: auto;
    margin: 6px -4px 0 0;
    padding-right: 4px;
  }

  .section-label {
    padding: 8px 2px 4px;
    color: var(--text-faint);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
    gap: 6px;
  }

  .emoji-button {
    min-height: 44px;
    display: grid;
    place-items: center;
    padding: 6px;
    border-radius: 8px;
    background: transparent;
  }

  .emoji-button:hover {
    background: var(--high);
  }

  .emoji-button:active {
    background: var(--elevated);
  }

  .emoji-button img {
    width: 28px;
    height: 28px;
    display: block;
    object-fit: contain;
  }

  .empty {
    margin: 0;
    padding: 24px 8px;
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
  }

  footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
    padding: 8px 2px 0;
    border-top: 1px solid var(--divider);
    color: var(--text-faint);
    font-size: 10px;
  }

  @media (max-width: 560px) {
    footer span:last-child {
      display: none;
    }
  }
</style>
