<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { formatDate, formatFileSize, formatTime } from '../lib/format';
  import { insertEmoji, isEmojiOnly } from '../lib/emojis';
  import type { Attachment, Message, Reaction } from '../lib/types';
  import { isPreviewableImage } from '../lib/image-preview';
  import Avatar from './Avatar.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import Icon from './Icon.svelte';
  import ImageAttachment from './ImageAttachment.svelte';
  import Markdown from './Markdown.svelte';
  import ReactionIcon from './ReactionIcon.svelte';

  const QUICK_REACTIONS = [':like:', ':heartred:', ':joy:', ':surprised:', ':crying:', ':fire:'];

  let draft = $state('');
  let scroller = $state<HTMLDivElement | null>(null);
  let input = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let composerWrap = $state<HTMLDivElement | null>(null);
  let emojiOpen = $state(false);
  let reactionFor = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let pendingFile = $state<File | null>(null);
  let uploading = $state(false);
  let atBottom = true;
  let lastChannel: string | null = null;

  const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

  let channel = $derived(app.channels.text.find((candidate) => candidate.id === app.textChannelId) ?? null);
  let onlineCount = $derived(app.textUsers.length + (app.textChannelId ? 1 : 0));
  let typingLabel = $derived.by(() => {
    const users = app.typingUsers;
    if (users.length === 0) {
      return '';
    }
    if (users.length === 1) {
      return app.t('chat.typingOne', { name: users[0].nickname });
    }
    if (users.length === 2) {
      return app.t('chat.typingTwo', {
        first: users[0].nickname,
        second: users[1].nickname
      });
    }
    return app.t('chat.typingMany');
  });
  let knownNames = $derived.by(() => {
    const names = new Map<string, string>();

    for (const message of app.messages) {
      names.set(message.userId, message.nickname);
    }
    for (const user of app.textUsers) {
      names.set(user.id, user.nickname);
    }
    if (app.selfId) {
      names.set(app.selfId, app.nickname);
    }

    return names;
  });

  function isGrouped(message: Message, index: number): boolean {
    if (index === 0) {
      return false;
    }

    const previous = app.messages[index - 1];
    if (!previous || previous.userId !== message.userId) {
      return false;
    }
    if (previous.deletedAt || message.deletedAt) {
      return false;
    }

    return new Date(previous.ts).toDateString() === new Date(message.ts).toDateString();
  }

  function namesFor(userIds: string[]): string {
    return userIds
      .map((userId) => knownNames.get(userId) ?? app.t('chat.unknownUser'))
      .join(', ');
  }

  function reactedNames(message: Message): string {
    const userIds = new Set<string>();
    for (const reaction of message.reactions ?? []) {
      for (const userId of reaction.userIds) {
        userIds.add(userId);
      }
    }
    return namesFor([...userIds]);
  }

  function reactionTitle(reaction: Reaction, mine: boolean): string {
    const names = namesFor(reaction.userIds);
    return `${app.t('chat.reactedBy', { names })} · ${
      mine ? app.t('chat.removeReaction') : app.t('chat.reactWith', { emoji: reaction.emoji })
    }`;
  }

  function onDraftInput(event: Event): void {
    if (editingId) {
      return;
    }
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    app.setTyping(value.trim().length > 0);
  }

  function resizeComposer(): void {
    if (!input) {
      return;
    }

    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }

  $effect(() => {
    draft;
    resizeComposer();
  });

  function onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
      return;
    }

    event.preventDefault();
    void send();
  }

  function onScroll(): void {
    if (!scroller) {
      return;
    }
    atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  async function send(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    if (uploading) {
      return;
    }

    if (editingId) {
      if (app.editMessage(editingId, draft)) {
        cancelEdit();
      }
      return;
    }

    if (pendingFile) {
      uploading = true;
      const sent = await app.sendFile(pendingFile, draft);
      uploading = false;
      if (sent) {
        draft = '';
        pendingFile = null;
        emojiOpen = false;
      }
      input?.focus();
      return;
    }

    if (app.sendMessage(draft)) {
      draft = '';
      emojiOpen = false;
    }
    input?.focus();
  }

  function chooseFile(): void {
    if (editingId) {
      return;
    }
    fileInput?.click();
  }

  function acceptFile(file: File): void {
    if (editingId || uploading) {
      return;
    }

    if (file.size === 0) {
      app.toast('error', app.t('toast.fileEmpty'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      app.toast('error', app.t('toast.fileTooLarge'));
      return;
    }

    pendingFile = file;
    emojiOpen = false;
    input?.focus();
  }

  function onFileChange(event: Event): void {
    const picker = event.currentTarget as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (file) {
      acceptFile(file);
    }
  }

  function pastedFileName(type: string): string {
    const extension =
      type.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'bin';
    return `pasted-${type.startsWith('image/') ? 'image' : 'file'}.${extension}`;
  }

  function onPaste(event: ClipboardEvent): void {
    if (editingId || uploading || app.connection !== 'online') {
      return;
    }

    const file = event.clipboardData?.files?.[0];
    if (!file) {
      return;
    }

    event.preventDefault();
    acceptFile(
      file.name
        ? file
        : new File([file], pastedFileName(file.type), {
            type: file.type,
            lastModified: Date.now()
          })
    );
  }

  function removePendingFile(): void {
    pendingFile = null;
    input?.focus();
  }

  function startEdit(message: Message): void {
    if (message.userId !== app.selfId || message.deletedAt) {
      return;
    }

    editingId = message.id;
    pendingDeleteId = null;
    reactionFor = null;
    emojiOpen = false;
    pendingFile = null;
    draft = message.text;
    app.setTyping(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(draft.length, draft.length);
    });
  }

  function cancelEdit(): void {
    editingId = null;
    draft = '';
    requestAnimationFrame(() => input?.focus());
  }

  function toggleDelete(messageId: string): void {
    pendingDeleteId = pendingDeleteId === messageId ? null : messageId;
    reactionFor = null;
    emojiOpen = false;
  }

  function confirmDelete(messageId: string): void {
    if (app.deleteMessage(messageId)) {
      pendingDeleteId = null;
      if (editingId === messageId) {
        cancelEdit();
      }
    }
  }

  function isImageAttachment(attachment: Attachment): boolean {
    return isPreviewableImage(attachment.name, attachment.contentType);
  }

  function attachmentExpired(attachment: Attachment): boolean {
    return attachment.expiresAt <= Date.now();
  }

  function toggleEmoji(): void {
    if (app.connection !== 'online') {
      return;
    }
    emojiOpen = !emojiOpen;
    if (!emojiOpen) {
      input?.focus();
    }
  }

  function pickEmoji(name: string): void {
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const result = insertEmoji(draft, start, end, name);
    draft = result.text;
    if (draft.trim().length > 0) {
      app.setTyping(true);
    }
    emojiOpen = false;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function closeEmoji(): void {
    emojiOpen = false;
    input?.focus();
  }

  function toggleReactionPicker(messageId: string): void {
    reactionFor = reactionFor === messageId ? null : messageId;
    pendingDeleteId = null;
    emojiOpen = false;
  }

  function chooseReaction(messageId: string, emoji: string): void {
    app.toggleReaction(messageId, emoji);
    reactionFor = null;
  }

  function onWindowClick(event: MouseEvent): void {
    if (emojiOpen && !(event.target instanceof Node && composerWrap?.contains(event.target))) {
      emojiOpen = false;
    }

    if (reactionFor) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.reaction-picker, .message-action')) {
        reactionFor = null;
      }
    }

    if (pendingDeleteId) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.delete-confirm, .message-action')) {
        pendingDeleteId = null;
      }
    }
  }

  $effect(() => {
    // Track new messages, inline actions, and channel changes for auto-scrolling.
    void app.messages.length;
    void app.textChannelId;
    void reactionFor;
    void pendingDeleteId;

    if (!scroller) {
      return;
    }

    if (lastChannel !== app.textChannelId) {
      lastChannel = app.textChannelId;
      emojiOpen = false;
      reactionFor = null;
      pendingDeleteId = null;
      editingId = null;
      draft = '';
      atBottom = true;
      requestAnimationFrame(() => {
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });
      return;
    }

    if (atBottom) {
      requestAnimationFrame(() => {
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });
    }
  });

  $effect(() => {
    if (app.textChannelId) {
      requestAnimationFrame(() => input?.focus());
    }
  });
</script>

<svelte:window
  onclick={onWindowClick}
  onkeydown={(event) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (emojiOpen) {
      closeEmoji();
      event.preventDefault();
    }
    if (reactionFor) {
      reactionFor = null;
      event.preventDefault();
    }
    if (pendingDeleteId) {
      pendingDeleteId = null;
      event.preventDefault();
    }
    if (editingId) {
      cancelEdit();
      event.preventDefault();
    }
  }}
/>

<section
  class="chat"
  aria-label={channel ? `#${channel.name}` : app.t('chat.choose')}
  onpaste={onPaste}
>
  {#if !channel}
    <div class="no-channel">
      <span class="no-channel-icon"><Icon name="chat" size={44} /></span>
      <h1>{app.t('chat.choose')}</h1>
      <p>{app.t('chat.chooseHint')}</p>
    </div>
  {:else}
    <header class="chat-header">
      <div class="channel-title">
        <Icon name="hash" size={22} />
        <h1>{channel.name}</h1>
      </div>
      <div class="header-meta">
        <span class="online-count">
          <span class="status-dot" class:online={app.connection === 'online'}></span>
          {app.t('chat.online', { count: onlineCount })}
        </span>
        <button
          type="button"
          class="leave"
          title={app.t('chat.leave')}
          aria-label={app.t('chat.leave')}
          onclick={() => app.leaveTextChannel()}
        >
          <Icon name="leave" size={18} />
          <span>{app.t('chat.leave')}</span>
        </button>
      </div>
    </header>

    {#if app.connection !== 'online'}
      <div class="connection-banner" class:offline={app.connection === 'offline'}>
        {app.connection === 'offline' ? app.t('chat.offlineBanner') : app.t('chat.connectionBanner')}
      </div>
    {/if}

    <div class="messages" bind:this={scroller} onscroll={onScroll}>
      {#if app.textLoading}
        <p class="state-line">{app.t('chat.loading')}</p>
      {:else if app.messages.length === 0}
        <div class="state-empty">
          <Icon name="chat" size={32} />
          <p>{app.t('chat.empty')}</p>
        </div>
      {:else}
        {#each app.messages as message, index (message.id)}
          {@const grouped = isGrouped(message, index)}
          {@const emojiOnly = isEmojiOnly(message.text)}
          {@const reactionNames = message.reactions?.length ? reactedNames(message) : ''}
          <article
            class="message"
            class:own={message.userId === app.selfId}
            class:grouped
            data-message-id={message.id}
          >
            {#if !grouped}
              <Avatar name={message.nickname} src={app.avatarFor(message.userId)} size={36} />
            {/if}
            <div class="message-body">
              <div class="message-meta">
                {#if !grouped}
                  <span class="message-author">{message.nickname}</span>
                {/if}
                <time datetime={new Date(message.ts).toISOString()}>
                  {formatTime(message.ts, app.locale)}
                </time>
                {#if message.editedAt && !message.deletedAt}
                  <span class="edited">{app.t('chat.edited')}</span>
                {/if}
                {#if !message.deletedAt}
                  <div class="message-tools">
                    <button
                      type="button"
                      class="message-action"
                      data-action="react"
                      title={app.t('chat.addReaction')}
                      aria-label={app.t('chat.addReaction')}
                      aria-expanded={reactionFor === message.id}
                      disabled={app.connection !== 'online'}
                      onclick={() => toggleReactionPicker(message.id)}
                    >
                      <Icon name="emoji" size={15} />
                    </button>
                    {#if message.userId === app.selfId}
                      <button
                        type="button"
                        class="message-action"
                        data-action="edit"
                        title={app.t('chat.edit')}
                        aria-label={app.t('chat.edit')}
                        disabled={app.connection !== 'online'}
                        onclick={() => startEdit(message)}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        type="button"
                        class="message-action danger"
                        class:active={pendingDeleteId === message.id}
                        data-action="delete"
                        title={app.t('chat.delete')}
                        aria-label={app.t('chat.delete')}
                        aria-expanded={pendingDeleteId === message.id}
                        disabled={app.connection !== 'online'}
                        onclick={() => toggleDelete(message.id)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
              {#if message.deletedAt}
                <div class="message-text deleted">{app.t('chat.deletedMessage')}</div>
              {:else}
                <div class="message-text" class:emoji-only={emojiOnly}>
                  <Markdown text={message.text} />
                </div>
              {/if}
              {#if message.attachment && !message.deletedAt}
                {@const attachment = message.attachment}
                {@const expired = attachmentExpired(attachment)}
                {@const url = app.fileUrl(attachment)}
                <div class="attachment" class:expired>
                  {#if isImageAttachment(attachment)}
                    {#if expired}
                      <div class="expired-file">
                        <Icon name="paperclip" size={18} />
                        <span>{attachment.name}</span>
                        <strong>{app.t('chat.fileExpired')}</strong>
                      </div>
                    {:else}
                      <a
                        class="image-attachment"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={attachment.name}
                      >
                        <ImageAttachment
                          url={url}
                          name={attachment.name}
                          contentType={attachment.contentType}
                        />
                      </a>
                    {/if}
                  {:else}
                    <div class="file-attachment">
                      <span class="file-icon"><Icon name="paperclip" size={20} /></span>
                      <span class="file-info">
                        <span class="file-name">{attachment.name}</span>
                        <span class="file-size">
                          {formatFileSize(attachment.size)}
                          {#if expired}
                            · {app.t('chat.fileExpired')}
                          {:else}
                            · {app.t('chat.fileAvailableUntil', {
                              date: formatDate(attachment.expiresAt, app.locale)
                            })}
                          {/if}
                        </span>
                      </span>
                      {#if !expired}
                        <a
                          class="file-open"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={attachment.name}
                        >
                          <Icon name="download" size={16} />
                        </a>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
              {#if message.reactions && message.reactions.length > 0 && !message.deletedAt}
                <div class="reactions">
                  {#each message.reactions as reaction (reaction.emoji)}
                    {@const mine = reaction.userIds.includes(app.selfId)}
                    <button
                      type="button"
                      class="reaction"
                      class:mine
                      title={reactionTitle(reaction, mine)}
                      aria-label={reactionTitle(reaction, mine)}
                      disabled={app.connection !== 'online'}
                      onclick={() => chooseReaction(message.id, reaction.emoji)}
                    >
                      <ReactionIcon emoji={reaction.emoji} size={17} />
                      <span class="reaction-count">{reaction.userIds.length}</span>
                    </button>
                  {/each}
                  {#if reactionNames}
                    <span class="reaction-names">
                      {app.t('chat.reactedBy', { names: reactionNames })}
                    </span>
                  {/if}
                </div>
              {/if}
              {#if reactionFor === message.id && !message.deletedAt}
                <div class="reaction-picker" role="group" aria-label={app.t('chat.addReaction')}>
                  {#each QUICK_REACTIONS as emoji (emoji)}
                    <button
                      type="button"
                      class="reaction-choice"
                      title={app.t('chat.reactWith', { emoji })}
                      aria-label={app.t('chat.reactWith', { emoji })}
                      onclick={() => chooseReaction(message.id, emoji)}
                    >
                      <ReactionIcon {emoji} size={22} />
                    </button>
                  {/each}
                </div>
              {/if}
              {#if pendingDeleteId === message.id && !message.deletedAt}
                <div class="delete-confirm">
                  <span>{app.t('chat.deleteConfirm')}</span>
                  <button
                    type="button"
                    class="delete-yes"
                    data-action="confirm-delete"
                    onclick={() => confirmDelete(message.id)}
                  >
                    {app.t('chat.delete')}
                  </button>
                  <button
                    type="button"
                    class="delete-cancel"
                    onclick={() => (pendingDeleteId = null)}
                  >
                    {app.t('common.cancel')}
                  </button>
                </div>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>

    <div class="typing-line" aria-live="polite">
      {#if typingLabel}
        <span class="typing-dots" aria-hidden="true"></span>
        <span>{typingLabel}</span>
      {/if}
    </div>

    <div class="composer-wrap" bind:this={composerWrap}>
      {#if emojiOpen && app.connection === 'online'}
        <div class="emoji-popover" id="emoji-picker">
          <EmojiPicker onpick={pickEmoji} onclose={closeEmoji} />
        </div>
      {/if}

      {#if editingId}
        <div class="edit-banner" aria-live="polite">
          <Icon name="edit" size={15} />
          <span>{app.t('chat.editing')}</span>
          <button
            type="button"
            class="pending-remove"
            title={app.t('chat.cancelEdit')}
            aria-label={app.t('chat.cancelEdit')}
            onclick={cancelEdit}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      {/if}

      {#if pendingFile}
        <div class="pending-file" aria-live="polite">
          <span class="pending-icon"><Icon name="paperclip" size={17} /></span>
          <span class="pending-name">{pendingFile.name}</span>
          <span class="pending-size">
            {uploading ? app.t('chat.uploading') : formatFileSize(pendingFile.size)}
          </span>
          {#if !uploading}
            <button
              type="button"
              class="pending-remove"
              title={app.t('chat.removeAttachment')}
              aria-label={app.t('chat.removeAttachment')}
              onclick={removePendingFile}
            >
              <Icon name="close" size={14} />
            </button>
          {/if}
        </div>
      {/if}

      <form class="composer" onsubmit={send}>
        <button
          type="button"
          class="emoji-toggle"
          title={app.t('chat.attach')}
          aria-label={app.t('chat.attach')}
          disabled={app.connection !== 'online' || uploading || editingId !== null}
          onclick={chooseFile}
        >
          <Icon name="paperclip" size={19} />
        </button>
        <input
          bind:this={fileInput}
          class="file-input"
          type="file"
          onchange={onFileChange}
        />
        <button
          type="button"
          class="emoji-toggle"
          title={app.t('chat.emoji')}
          aria-label={app.t('chat.emoji')}
          aria-expanded={emojiOpen}
          aria-controls="emoji-picker"
          disabled={app.connection !== 'online' || uploading}
          onclick={toggleEmoji}
        >
          <Icon name="emoji" size={20} />
        </button>
        <textarea
          bind:this={input}
          bind:value={draft}
          rows={1}
          maxlength={app.limits.maxMessageLength}
          placeholder={editingId ? app.t('chat.editing') : app.t('chat.placeholder', { channel: channel.name })}
          aria-label={editingId ? app.t('chat.editing') : app.t('chat.placeholder', { channel: channel.name })}
          autocomplete="off"
          disabled={app.connection !== 'online' || uploading}
          oninput={onDraftInput}
          onkeydown={onComposerKeydown}
        ></textarea>
        <button
          type="submit"
          class="primary send"
          disabled={app.connection !== 'online' || uploading || (draft.trim().length === 0 && !pendingFile)}
          title={uploading ? app.t('chat.uploading') : editingId ? app.t('chat.edit') : app.t('chat.send')}
          aria-label={uploading ? app.t('chat.uploading') : editingId ? app.t('chat.edit') : app.t('chat.send')}
        >
          {#if uploading}
            <Icon name="retry" size={18} />
          {:else}
            <Icon name="send" size={18} />
          {/if}
        </button>
      </form>
    </div>
  {/if}
</section>

<style>
  .chat {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--base);
  }

  .no-channel {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px;
  }

  .no-channel-icon {
    width: 84px;
    height: 84px;
    display: grid;
    place-items: center;
    margin-bottom: 20px;
    border-radius: 20px;
    background: var(--elevated);
    color: var(--text-faint);
    box-shadow: var(--shadow-sm);
  }

  .no-channel h1 {
    margin: 0 0 8px;
    font-size: 30px;
    letter-spacing: -0.03em;
  }

  .no-channel p {
    margin: 0;
    color: var(--text-dim);
    font-size: 17px;
  }

  .chat-header {
    height: 64px;
    flex: 0 0 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 20px;
    border-bottom: 1px solid var(--divider);
    box-shadow: var(--shadow-sm);
    z-index: 1;
  }

  .channel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-dim);
  }

  .channel-title h1 {
    margin: 0;
    color: var(--text);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .online-count {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-faint);
    font-size: 13px;
    white-space: nowrap;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--special);
  }

  .status-dot.online {
    background: var(--green);
  }

  .leave {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    border-radius: 9px;
    background: transparent;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
  }

  .leave:hover {
    background: var(--high);
    color: var(--text);
  }

  .connection-banner {
    padding: 8px 20px;
    background: rgba(247, 208, 35, 0.12);
    color: var(--yellow);
    border-bottom: 1px solid var(--divider);
    font-size: 13px;
  }

  .connection-banner.offline {
    background: rgba(229, 43, 59, 0.14);
    color: var(--red);
  }

  .messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .state-line {
    margin: 24px auto;
    color: var(--text-faint);
    font-size: 14px;
  }

  .state-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-faint);
    text-align: center;
  }

  .state-empty p {
    margin: 0;
    font-size: 16px;
  }

  .message {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    max-width: 900px;
  }

  .message.grouped {
    margin-top: -8px;
  }

  .message.grouped .message-body {
    margin-left: 48px;
  }

  .message-body {
    min-width: 0;
    flex: 1;
  }

  .message-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .message-author {
    color: var(--text);
    font-size: 15px;
    font-weight: 700;
  }

  .message.own .message-author {
    color: var(--accent);
  }

  .message-meta time {
    color: var(--text-faint);
    font-size: 11px;
  }

  .edited {
    color: var(--text-faint);
    font-size: 11px;
    font-style: italic;
  }

  .message-tools {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  .message-action {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    opacity: 0;
    transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
  }

  .message:hover .message-action,
  .message-action:focus-visible,
  .message-action[aria-expanded='true'] {
    opacity: 1;
  }

  .message-action:hover {
    background: var(--high);
    color: var(--text);
  }

  .message-action.danger:hover,
  .message-action.active {
    opacity: 1;
    color: var(--red);
  }

  @media (hover: none) {
    .message-action {
      opacity: 0.7;
    }
  }

  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .reaction {
    height: 29px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    border: 1px solid var(--divider);
    border-radius: 8px;
    background: var(--elevated);
    color: var(--text-dim);
  }

  .reaction:hover {
    background: var(--high);
    color: var(--text);
  }

  .reaction.mine {
    border-color: var(--accent);
    background: var(--high);
    color: var(--text);
  }

  .reaction-count {
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }

  .reaction-names {
    flex-basis: 100%;
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.3;
  }

  .reaction-picker {
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 6px;
    padding: 5px;
    border: 1px solid var(--divider);
    border-radius: 10px;
    background: var(--elevated);
    box-shadow: var(--shadow-sm);
  }

  .reaction-choice {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    background: transparent;
    color: var(--text-dim);
  }

  .reaction-choice:hover {
    background: var(--high);
  }

  .message-text {
    color: var(--text);
    font-size: 17px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-sans), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  }

  .message-text.deleted {
    color: var(--text-faint);
    font-size: 15px;
    font-style: italic;
  }

  .message-text.emoji-only {
    font-size: 42px;
    line-height: 1.15;
  }

  .message-text.emoji-only :global(.inline-emoji) {
    width: 1em;
    height: 1em;
    vertical-align: -0.1em;
  }

  .delete-confirm {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--divider);
    border-radius: 10px;
    background: var(--elevated);
    color: var(--text-dim);
    font-size: 13px;
  }

  .delete-confirm > span {
    margin-right: auto;
  }

  .delete-yes,
  .delete-cancel {
    min-height: 32px;
    padding: 5px 10px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
  }

  .delete-yes {
    background: var(--red);
    color: #fff;
  }

  .delete-cancel {
    background: var(--high);
    color: var(--text);
  }

  .attachment {
    margin-top: 8px;
  }

  .image-attachment {
    display: block;
    max-width: min(420px, 100%);
    overflow: hidden;
    border: 1px solid var(--divider);
    border-radius: 12px;
    background: var(--elevated);
  }

  .file-attachment {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 440px;
    padding: 9px 10px;
    border: 1px solid var(--divider);
    border-radius: 11px;
    background: var(--elevated);
  }

  .file-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 9px;
    background: var(--high);
    color: var(--text-dim);
  }

  .file-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    overflow: hidden;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    color: var(--text-faint);
    font-size: 12px;
  }

  .file-open {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 8px;
    color: var(--text-dim);
  }

  .file-open:hover {
    background: var(--high);
    color: var(--text);
  }

  .attachment.expired .file-attachment,
  .attachment.expired .expired-file {
    opacity: 0.65;
  }

  .expired-file {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 440px;
    padding: 12px;
    border: 1px solid var(--divider);
    border-radius: 11px;
    background: var(--elevated);
    color: var(--text-dim);
    font-size: 14px;
  }

  .expired-file strong {
    margin-left: auto;
    color: var(--yellow);
    font-size: 12px;
  }

  .typing-line {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 24px;
    padding: 0 24px;
    color: var(--text-faint);
    font-size: 13px;
  }

  .typing-dots {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
    animation: typing-pulse 1.1s ease-in-out infinite;
  }

  @keyframes typing-pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .composer-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .pending-file,
  .edit-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 20px 6px;
    padding: 7px 8px 7px 10px;
    border: 1px solid var(--divider);
    border-radius: 10px;
    background: var(--elevated);
  }

  .edit-banner {
    border-color: var(--accent);
    color: var(--text-dim);
    font-size: 13px;
  }

  .edit-banner > span {
    flex: 1;
    color: var(--text);
    font-weight: 600;
  }

  .pending-icon {
    display: grid;
    place-items: center;
    color: var(--text-dim);
  }

  .pending-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-size {
    flex: 0 0 auto;
    color: var(--text-faint);
    font-size: 12px;
  }

  .pending-remove {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 7px;
    background: transparent;
    color: var(--text-faint);
  }

  .pending-remove:hover {
    background: var(--high);
    color: var(--text);
  }

  .file-input {
    display: none;
  }

  .emoji-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 20px;
    z-index: 20;
  }

  .composer {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--divider);
    background: var(--base);
  }

  .emoji-toggle {
    width: 44px;
    height: 52px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 10px;
    background: transparent;
    color: var(--text-dim);
  }

  .emoji-toggle:hover:not(:disabled) {
    background: var(--high);
    color: var(--text);
  }

  .emoji-toggle:disabled {
    opacity: 0.4;
  }

  .composer textarea {
    flex: 1;
    min-width: 0;
    min-height: 52px;
    max-height: 180px;
    padding: 12px 14px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--high);
    color: var(--text);
    font: inherit;
    font-size: 17px;
    line-height: 1.45;
    resize: none;
    overflow-y: auto;
  }

  .composer textarea::placeholder {
    color: var(--text-faint);
  }

  .composer textarea:focus,
  .composer textarea:focus-visible {
    border-color: transparent;
  }

  .composer textarea:disabled {
    opacity: 0.5;
  }

  .send {
    width: 52px;
    height: 52px;
    min-height: 52px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 12px;
  }

  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-width: 1050px) {
    .leave span {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .emoji-popover {
      left: 12px;
    }
  }
</style>
