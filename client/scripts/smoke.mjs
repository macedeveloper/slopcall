import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const screenshots = path.join(root, '..', 'docs', 'screenshots');
const BASE_URL = process.env.SLOPCALL_URL ?? 'http://127.0.0.1:1420';
const SERVER_URL = process.env.SLOPCALL_SERVER ?? 'ws://127.0.0.1:8787';
const AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACKSURBVHhe7dAhAQBADIDAlfiyX37zVABxBsnsf2s2DDYNYLBpAINNAxhsGsBg0wAGmwYw2DSAwaYBDDYNYLBpAINNAxhsGsBg0wAGmwYw2DSAwaYBDDYNYLBpAINNAxhsGsBg0wAGmwYw2DSAwaYBDDYNYLBpAINNAxhsGsBg0wAGmwYw2DSAweYAP3bSWVkDI6QAAAAASUVORK5CYII=',
  'base64'
);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (condition) {
    console.log(`ok   ${message}`);
  } else {
    fail(message);
  }
}

async function waitForSound(page, name) {
  await page.waitForFunction(
    (file) => (window.__soundPlays ?? []).some((src) => src.includes(`/sounds/${file}.wav`)),
    name,
    { timeout: 2500 }
  );
}

async function createClient(browser, nickname, locale = 'en-US') {
  const context = await browser.newContext({
    locale,
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone']
  });

  await context.addInitScript(
    (values) => {
      localStorage.setItem('slopcall.lang', values.locale);
      localStorage.setItem('slopcall.server', values.server);
    },
    { locale: locale.startsWith('ru') ? 'ru' : 'en', server: SERVER_URL }
  );

  await context.addInitScript(() => {
    window.__soundPlays = [];
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLMediaElement && this.src.includes('/sounds/')) {
        window.__soundPlays.push(this.src);
      }
      return originalPlay.call(this).catch(() => undefined);
    };
  });

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.warn(`[${nickname}] console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => console.warn(`[${nickname}] page error: ${error.message}`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nickname');
  if (nickname === 'Alice') {
    assert(
      (await page.locator('.brand-mark img[src="/logo.png"]').count()) === 1,
      'onboarding uses the app logo'
    );
  }
  await page.fill('#nickname', nickname);
  await page.click('button:has-text("Join Slopcall")');
  await page.waitForFunction(() => window.__slopcall?.connection === 'online');
  await page.waitForFunction(() => window.__slopcall?.textChannelId === 'general');

  return { context, page };
}

async function main() {
  await mkdir(screenshots, { recursive: true });

  const browser = await chromium.launch({
    channel: 'msedge',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  try {
    const alice = await createClient(browser, 'Alice');
    const bob = await createClient(browser, 'Bob');

    await alice.page.fill('textarea[placeholder="Message #general"]', 'Hello from Alice');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector('text=Hello from Alice', { timeout: 3000 });
    assert(true, 'text message arrives for the second client within 3s');

    await bob.page.fill('textarea[placeholder="Message #general"]', 'Hey Alice, voice?');
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await alice.page.waitForSelector('text=Hey Alice, voice?', { timeout: 3000 });
    assert(true, 'replies arrive in both directions');

    await alice.page.fill('textarea[placeholder="Message #general"]', 'First line');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Shift+Enter');
    await alice.page.type('textarea[placeholder="Message #general"]', 'Second line');
    const multilineDraft = await alice.page.inputValue(
      'textarea[placeholder="Message #general"]'
    );
    assert(multilineDraft === 'First line\nSecond line', 'Shift+Enter inserts a newline');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector('text=First line', { timeout: 3000 });
    const multilineMessage = bob.page.locator('.message', { hasText: 'First line' }).last();
    const multilineText = await multilineMessage.locator('.message-text').innerText();
    assert(multilineText === 'First line\nSecond line', 'multiline messages keep their line breaks');

    const online = await alice.page.locator('.online-count').innerText();
    assert(online.includes('2'), `channel roster shows 2 people (${online.trim()})`);

    await alice.page.click('button[title="Settings"]');
    await alice.page.waitForSelector('.modal');
    await alice.page.setInputFiles('input.avatar-file', {
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: AVATAR_PNG
    });
    await alice.page.waitForSelector('.avatar-row .avatar-image');
    await alice.page.click('.modal button[type="submit"]');
    await alice.page.waitForSelector('.modal', { state: 'detached' });
    await bob.page.waitForFunction(
      () =>
        window.__slopcall.textUsers.some(
          (user) =>
            user.nickname === 'Alice' &&
            typeof user.avatar === 'string' &&
            user.avatar.startsWith('data:image/')
        ),
      undefined,
      { timeout: 3000 }
    );
    assert(true, 'profile picture uploads and syncs to other clients');

    await alice.page.fill('textarea[placeholder="Message #general"]', 'Typing indicator test');
    await bob.page.waitForFunction(
      () => document.querySelector('.typing-line')?.textContent?.includes('Alice is typing'),
      undefined,
      { timeout: 3000 }
    );
    assert(true, 'typing status appears for other clients');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForFunction(
      () => !document.querySelector('.typing-line')?.textContent?.includes('Alice is typing'),
      undefined,
      { timeout: 3000 }
    );
    assert(true, 'typing status clears after sending');

    const reactionText = `Reaction test ${Date.now()}`;
    await bob.page.fill('textarea[placeholder="Message #general"]', reactionText);
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    const reactionMessage = alice.page.locator('.message', { hasText: reactionText }).last();
    await reactionMessage.waitFor({ timeout: 3000 });
    await reactionMessage.hover();
    await reactionMessage.locator('.message-action').click();
    await reactionMessage.locator('.reaction-picker button[title*=":heartred:"]').click();
    await bob.page.waitForFunction(
      (text) => {
        const match = [...document.querySelectorAll('.message')].find((element) =>
          element.textContent?.includes(text)
        );
        return match?.querySelector('.reaction .reaction-count')?.textContent?.trim() === '1';
      },
      reactionText,
      { timeout: 3000 }
    );
    assert(true, 'reactions sync across clients');
    await bob.page.waitForFunction(
      (text) => {
        const match = [...document.querySelectorAll('.message')].find((element) =>
          element.textContent?.includes(text)
        );
        return match?.querySelector('.reaction-names')?.textContent?.includes('Alice');
      },
      reactionText,
      { timeout: 3000 }
    );
    assert(true, 'reaction list shows who reacted');

    await reactionMessage.locator('.reaction').click();
    await bob.page.waitForFunction(
      (text) => {
        const match = [...document.querySelectorAll('.message')].find((element) =>
          element.textContent?.includes(text)
        );
        return Boolean(match) && match.querySelectorAll('.reaction').length === 0;
      },
      reactionText,
      { timeout: 3000 }
    );
    assert(true, 'reactions can be toggled off');

    const editText = `Edit test ${Date.now()}`;
    await bob.page.fill('textarea[placeholder="Message #general"]', editText);
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    const authorMessage = bob.page.locator('.message', { hasText: editText }).last();
    await authorMessage.waitFor({ timeout: 3000 });
    const messageId = await authorMessage.getAttribute('data-message-id');
    assert(Boolean(messageId), 'messages expose a stable id for edits');
    await authorMessage.hover();
    await authorMessage.locator('[data-action="edit"]').click();
    await bob.page.waitForSelector('.edit-banner');
    assert(
      (await bob.page.inputValue('textarea[placeholder="Editing message"]')) === editText,
      'editing loads the original message into the composer'
    );
    const editedText = `${editText} (edited)`;
    await bob.page.fill('textarea[placeholder="Editing message"]', editedText);
    await bob.page.press('textarea[placeholder="Editing message"]', 'Enter');
    await alice.page
      .locator(`[data-message-id="${messageId}"] .message-text`)
      .filter({ hasText: editedText })
      .waitFor({ timeout: 3000 });
    assert(
      (await alice.page.locator(`[data-message-id="${messageId}"] .edited`).count()) === 1,
      'edited messages sync with an edited marker'
    );

    await bob.page.locator(`[data-message-id="${messageId}"]`).hover();
    await bob.page.locator(`[data-message-id="${messageId}"] [data-action="delete"]`).click();
    await bob.page.locator(`[data-message-id="${messageId}"] .delete-confirm`).waitFor();
    await bob.page
      .locator(`[data-message-id="${messageId}"] [data-action="confirm-delete"]`)
      .click();
    await alice.page
      .locator(`[data-message-id="${messageId}"] .message-text.deleted`)
      .waitFor({ timeout: 3000 });
    assert(
      (await alice.page.locator(`[data-message-id="${messageId}"] .message-text.deleted`).textContent())?.trim() ===
        'This message was deleted.',
      'deleted messages leave a placeholder for other clients'
    );

    await alice.page.click('button:has-text("Lounge")');
    await alice.page.waitForFunction(() => window.__slopcall?.voiceStatus === 'connected');
    assert(true, 'first client joins the voice room');

    await bob.page.click('button:has-text("Lounge")');
    await bob.page.waitForFunction(() => window.__slopcall?.voiceStatus === 'connected');
    await alice.page.waitForFunction(() => window.__slopcall?.voicePeers.length === 1);
    await bob.page.waitForFunction(() => window.__slopcall?.voicePeers.length === 1);
    assert(true, 'both clients see each other in the voice room');

    await alice.page.waitForFunction(
      () => window.__slopcall?.debugVoice()?.[0]?.connectionState === 'connected',
      undefined,
      { timeout: 15000 }
    );
    assert(true, 'WebRTC peer connection reaches the connected state');

    const volume = alice.page
      .locator('.participant', { hasText: 'Bob' })
      .locator('input[type="range"]');
    await volume.fill('40');
    const storedVolume = await alice.page.evaluate(() => window.__slopcall.debugVoice()[0]?.volume);
    assert(Math.abs(storedVolume - 0.4) < 0.01, `per-user volume applies (${storedVolume})`);

    await alice.page.evaluate(() => {
      window.__soundPlays = [];
    });
    await alice.page.click('button:has-text("Mute microphone")');
    const micMuted = await alice.page.evaluate(() => window.__slopcall.micMuted);
    assert(micMuted === true, 'mute control updates state');
    await waitForSound(alice.page, 'mic-mute');
    assert(true, 'mute sound plays');

    await alice.page.click('button:has-text("Unmute microphone")');
    await waitForSound(alice.page, 'mic-unmute');
    assert(true, 'unmute sound plays');

    await alice.page.fill('textarea[placeholder="Message #general"]', 'Hello ');
    await alice.page.evaluate(() => {
      window.__slopcall.toasts.splice(0);
      const input = document.querySelector('textarea[placeholder="Message #general"]');
      input?.focus();
      input?.setSelectionRange(6, 6);
    });
    await alice.page.click('button[title="Emoji"]');
    await alice.page.waitForSelector('.picker');
    await alice.page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.picker .emoji-button img')];
      return (
        images.length > 0 &&
        images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
      );
    }, { timeout: 5000 });

    const categoryLabels = await alice.page.locator('.picker .section-label').allTextContents();
    const expectedCategories = [
      'Faces & characters',
      'Cats',
      'Hearts',
      'Flags',
      'Buttons',
      'Music & audio',
      'Nature',
      'Objects',
      'Symbols & gestures'
    ];
    assert(
      expectedCategories.every((label) => categoryLabels.includes(label)),
      `emoji picker groups emojis by type (${categoryLabels.join(' | ')})`
    );

    await alice.page.screenshot({
      path: path.join(screenshots, 'step1-emoji-picker.png')
    });

    await alice.page.fill('.picker input[type="search"]', 'smile');
    assert(
      (await alice.page.locator('.picker .section-label').first().textContent())?.trim() === 'Results',
      'emoji search results use a single flat section'
    );
    await alice.page.click('.picker .emoji-button[title=":smile:"]');
    const composed = await alice.page.inputValue('textarea[placeholder="Message #general"]');
    assert(composed === 'Hello :smile:', `emoji picker inserts at the cursor (${composed})`);

    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector('img.inline-emoji[src*="Smile.svg"]', { timeout: 3000 });
    assert(true, 'Contestmoji renders for other clients');

    await bob.page.fill('textarea[placeholder="Message #general"]', 'Party 🎉');
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await alice.page.waitForSelector('text=Party 🎉', { timeout: 3000 });
    assert(true, 'standard Unicode emojis render natively');

    await alice.page.fill(
      'textarea[placeholder="Message #general"]',
      '**Bold** *italic* `code` ~~gone~~ [site](https://example.com)'
    );
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector('.message .md-bold', { timeout: 3000 });
    const markdownMessage = bob.page.locator('.message', { hasText: 'Bold' }).last();
    const markdownHtml = await markdownMessage.locator('.message-text').innerHTML();
    assert(
      ['md-bold', 'md-italic', 'md-code', 'md-strike', 'md-link'].every((name) =>
        markdownHtml.includes(name)
      ) && (await markdownMessage.locator('a.md-link[href^="https://example.com"]').count()) === 1,
      'Markdown renders bold, italic, code, strike, and safe links'
    );

    const attachmentName = `photo-${Date.now()}.png`;
    await alice.page.setInputFiles('input.file-input', {
      name: attachmentName,
      mimeType: 'image/png',
      buffer: AVATAR_PNG
    });
    await alice.page.waitForSelector('.pending-file');
    await alice.page.fill('textarea[placeholder="Message #general"]', 'Photo caption');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector(`.image-attachment img[alt="${attachmentName}"]`, { timeout: 5000 });
    const fileResult = await bob.page.evaluate(async (name) => {
      const image = document.querySelector(`.image-attachment img[alt="${name}"]`);
      if (!(image instanceof HTMLImageElement)) {
        return null;
      }
      const response = await fetch(image.src);
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        size: (await response.arrayBuffer()).byteLength
      };
    }, attachmentName);
    assert(
      fileResult?.status === 200 &&
        fileResult.type === 'image/png' &&
        fileResult.size === AVATAR_PNG.length,
      `file attachments upload, render, and serve (${JSON.stringify(fileResult)})`
    );

    const removedAttachmentName = `remove-${Date.now()}.png`;
    await alice.page.setInputFiles('input.file-input', {
      name: removedAttachmentName,
      mimeType: 'image/png',
      buffer: AVATAR_PNG
    });
    await alice.page.waitForSelector('.pending-file');
    await alice.page.fill('textarea[placeholder="Message #general"]', 'Temporary attachment');
    await alice.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await bob.page.waitForSelector(`.image-attachment img[alt="${removedAttachmentName}"]`, {
      timeout: 5000
    });
    const temporaryMessage = alice.page
      .locator('.message')
      .filter({ has: alice.page.locator(`img[alt="${removedAttachmentName}"]`) })
      .last();
    const temporaryId = await temporaryMessage.getAttribute('data-message-id');
    const temporaryUrl = await temporaryMessage.locator('.image-attachment img').getAttribute('src');
    await temporaryMessage.hover();
    await temporaryMessage.locator('[data-action="delete"]').click();
    await temporaryMessage.locator('[data-action="confirm-delete"]').click();
    await bob.page
      .locator(`[data-message-id="${temporaryId}"] .message-text.deleted`)
      .waitFor({ timeout: 3000 });
    const removedStatus = await bob.page.evaluate(async (url) => {
      if (!url) {
        return 0;
      }
      const response = await fetch(`${url}?deleted=${Date.now()}`, { cache: 'no-store' });
      return response.status;
    }, temporaryUrl);
    assert(removedStatus === 404, 'deleting a message removes its uploaded file');

    await alice.page.evaluate(() => {
      window.__soundPlays = [];
      document.hasFocus = () => false;
    });
    await bob.page.fill('textarea[placeholder="Message #general"]', 'Sound check while unfocused');
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await alice.page.waitForSelector('text=Sound check while unfocused', { timeout: 3000 });
    await waitForSound(alice.page, 'message');
    assert(true, 'message sound plays while the window is unfocused');

    await alice.page.evaluate(() => {
      window.__soundPlays = [];
      document.hasFocus = () => true;
    });
    await bob.page.fill('textarea[placeholder="Message #general"]', 'Sound check while focused');
    await bob.page.press('textarea[placeholder="Message #general"]', 'Enter');
    await alice.page.waitForSelector('text=Sound check while focused', { timeout: 3000 });
    await alice.page.waitForTimeout(400);
    const focusedSound = await alice.page.evaluate(() =>
      (window.__soundPlays ?? []).some((src) => src.includes('/sounds/message.wav'))
    );
    assert(!focusedSound, 'message sound stays silent while the window is focused');

    await alice.page.evaluate(() => {
      window.__slopcall.toasts.splice(0);
    });
    await alice.page.click('button[title="Settings"]');
    await alice.page.waitForSelector('#settings-sounds-enabled');
    assert(
      await alice.page.isChecked('#settings-sounds-enabled'),
      'sound effects are enabled by default'
    );
    await alice.page.screenshot({
      path: path.join(screenshots, 'step1-settings-sounds.png')
    });
    await alice.page.uncheck('#settings-sounds-enabled');
    await alice.page.locator('#settings-sound-volume').evaluate((element) => {
      element.value = '40';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await alice.page.getByRole('button', { name: 'Save', exact: true }).click();
    await alice.page.waitForFunction(() => window.__slopcall?.settingsOpen === false);
    const soundPrefs = await alice.page.evaluate(() => ({
      enabled: window.__slopcall.soundsEnabled,
      volume: window.__slopcall.soundVolume,
      storedEnabled: localStorage.getItem('slopcall.sounds'),
      storedVolume: localStorage.getItem('slopcall.soundVolume')
    }));
    assert(
      soundPrefs.enabled === false &&
        soundPrefs.storedEnabled === '0' &&
        Math.abs(soundPrefs.volume - 0.4) < 0.01 &&
        soundPrefs.storedVolume === '0.4',
      `sound settings persist (${JSON.stringify(soundPrefs)})`
    );

    await alice.page.screenshot({ path: path.join(screenshots, 'chat-voice.png') });

    const ruContext = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 800 } });
    const ruPage = await ruContext.newPage();
    await ruPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await ruPage.waitForSelector('#nickname');
    const ruTitle = await ruPage.locator('h1').first().innerText();
    assert(ruTitle.includes('зовут'), `Russian UI comes from the system locale (${ruTitle})`);
    await ruPage.screenshot({ path: path.join(screenshots, 'onboarding-ru.png') });
    await ruContext.close();

    await bob.page.screenshot({ path: path.join(screenshots, 'chat-voice-bob.png') });

    await alice.context.close();
    await bob.context.close();
  } finally {
    await browser.close();
  }

  console.log(`Screenshots written to ${screenshots}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
