import createJxlModule from './jxl/codec/dec/jxl_dec.js';
import wasmUrl from './jxl/codec/dec/jxl_dec.wasm?url';

type JxlDecoder = {
  decode(source: BufferSource): ImageData | null;
};

let decoderPromise: Promise<JxlDecoder> | null = null;

async function getDecoder(): Promise<JxlDecoder> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`JPEG XL decoder failed to load: ${response.status}`);
      }

      const wasm = await WebAssembly.compile(await response.arrayBuffer());
      const module = await createJxlModule({
        noInitialRun: true,
        instantiateWasm(
          imports: WebAssembly.Imports,
          receiveInstance: (instance: WebAssembly.Instance) => void
        ) {
          const instance = new WebAssembly.Instance(wasm, imports);
          receiveInstance(instance);
          return instance.exports;
        }
      });

      return module as JxlDecoder;
    })();
  }

  return decoderPromise;
}

/** Decodes a JPEG XL file to raw RGBA pixels using a bundled WASM decoder. */
export async function decodeJxl(bytes: Uint8Array): Promise<ImageData> {
  const decoder = await getDecoder();
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const image = decoder.decode(source.buffer);

  if (!image) {
    throw new Error('JPEG XL decoding failed');
  }

  return image;
}
