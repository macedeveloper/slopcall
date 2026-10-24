import { decodeQoi } from './qoi';

export type ImagePreviewKind = 'native' | 'jxl' | 'qoi';

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'jxl',
  'png',
  'qoi',
  'webp'
]);

const MAX_DECODE_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isPreviewableImage(name: string, contentType: string): boolean {
  if (contentType === 'image/svg+xml') {
    return false;
  }

  return contentType.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(name));
}

export function imagePreviewKind(name: string, contentType: string): ImagePreviewKind {
  const type = contentType.toLowerCase();
  const extension = extensionOf(name);

  if (type === 'image/jxl' || extension === 'jxl') {
    return 'jxl';
  }
  if (type === 'image/qoi' || extension === 'qoi') {
    return 'qoi';
  }

  return 'native';
}

function imageDataToDataUrl(image: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Native browser formats can be used directly. JPEG XL and QOI are decoded in
 * the client and converted to PNG data URLs for a consistent preview.
 */
export async function loadImagePreview(
  url: string,
  name: string,
  contentType: string
): Promise<string> {
  const kind = imagePreviewKind(name, contentType);

  if (kind === 'native') {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_DECODE_BYTES) {
    throw new Error('Image is too large to preview');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_DECODE_BYTES) {
    throw new Error('Image is too large to preview');
  }

  const image =
    kind === 'jxl'
      ? await (await import('./jxl')).decodeJxl(new Uint8Array(buffer))
      : decodeQoi(new Uint8Array(buffer));

  if (image.width * image.height > MAX_PIXELS) {
    throw new Error('Image is too large to preview');
  }

  return imageDataToDataUrl(image);
}
