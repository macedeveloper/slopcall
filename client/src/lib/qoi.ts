const QOI_MAGIC = 0x716f6966; // "qoif"
const QOI_HEADER_SIZE = 14;
const QOI_END_SIZE = 8;

/**
 * Decodes the Quite OK Image format into raw RGBA pixels.
 * Spec: https://qoiformat.org/qoi-specification.pdf
 */
export function decodeQoi(bytes: Uint8Array): ImageData {
  if (bytes.length < QOI_HEADER_SIZE + QOI_END_SIZE) {
    throw new Error('QOI file is too short');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== QOI_MAGIC) {
    throw new Error('QOI magic is invalid');
  }

  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const channels = bytes[12];

  if (width === 0 || height === 0 || width > 16384 || height > 16384) {
    throw new Error('QOI dimensions are invalid');
  }
  if (channels !== 3 && channels !== 4) {
    throw new Error('QOI channel count is invalid');
  }

  const pixelCount = width * height;
  if (pixelCount > 40_000_000) {
    throw new Error('QOI image is too large');
  }
  const pixels = new Uint8ClampedArray(pixelCount * 4);
  const index = new Uint32Array(64);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let run = 0;
  let offset = QOI_HEADER_SIZE;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (run > 0) {
      run -= 1;
    } else {
      if (offset >= bytes.length - QOI_END_SIZE) {
        throw new Error('QOI data ended unexpectedly');
      }

      const first = bytes[offset];
      offset += 1;

      if (first === 0xfe) {
        if (offset + 3 > bytes.length) {
          throw new Error('QOI RGB chunk is truncated');
        }
        r = bytes[offset];
        g = bytes[offset + 1];
        b = bytes[offset + 2];
        offset += 3;
      } else if (first === 0xff) {
        if (offset + 4 > bytes.length) {
          throw new Error('QOI RGBA chunk is truncated');
        }
        r = bytes[offset];
        g = bytes[offset + 1];
        b = bytes[offset + 2];
        a = bytes[offset + 3];
        offset += 4;
      } else {
        const tag = first & 0xc0;

        if (tag === 0x00) {
          const color = index[first];
          r = (color >>> 24) & 0xff;
          g = (color >>> 16) & 0xff;
          b = (color >>> 8) & 0xff;
          a = color & 0xff;
        } else if (tag === 0x40) {
          r = (r + ((first >>> 4) & 0x03) - 2) & 0xff;
          g = (g + ((first >>> 2) & 0x03) - 2) & 0xff;
          b = (b + (first & 0x03) - 2) & 0xff;
        } else if (tag === 0x80) {
          if (offset >= bytes.length) {
            throw new Error('QOI luma chunk is truncated');
          }

          const second = bytes[offset];
          offset += 1;
          const dg = (first & 0x3f) - 32;
          r = (r + dg + ((second >>> 4) & 0x0f) - 8) & 0xff;
          g = (g + dg) & 0xff;
          b = (b + dg + (second & 0x0f) - 8) & 0xff;
        } else {
          run = first & 0x3f;
        }
      }

      index[(r * 3 + g * 5 + b * 7 + a * 11) & 63] =
        ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    }

    const target = pixel * 4;
    pixels[target] = r;
    pixels[target + 1] = g;
    pixels[target + 2] = b;
    pixels[target + 3] = a;
  }

  return new ImageData(pixels, width, height);
}
