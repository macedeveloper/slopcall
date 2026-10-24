export const AVATAR_MAX_LENGTH = 48_000;

const AVATAR_SIZE = 256;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function normalizeAvatar(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const avatar = value.trim();
  if (!avatar || avatar.length > AVATAR_MAX_LENGTH || !DATA_URL_PATTERN.test(avatar)) {
    return '';
  }

  return avatar;
}

async function loadSource(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image_load_failed'));
      element.src = url;
    });

    return { image, revoke: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Reads a user-selected image, crops it to a square, and returns a small data URL
 * that can be sent over the existing WebSocket without changing the server payload budget.
 */
export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('image_too_large');
  }

  const { image: source, revoke } = await loadSource(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const side = Math.min(sourceWidth, sourceHeight);
  if (!side) {
    revoke();
    throw new Error('image_empty');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('canvas_unavailable');
    }

    context.drawImage(
      source,
      (sourceWidth - side) / 2,
      (sourceHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );

    for (const quality of [0.82, 0.65, 0.5]) {
      const avatar = canvas.toDataURL('image/webp', quality);
      if (avatar.length <= AVATAR_MAX_LENGTH) {
        return avatar;
      }
    }
  } finally {
    revoke();
  }

  throw new Error('image_too_large');
}
