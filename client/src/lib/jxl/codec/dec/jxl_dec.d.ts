type JxlModule = {
  decode(source: BufferSource): ImageData | null;
};

declare function createJxlModule(options?: Record<string, unknown>): Promise<JxlModule>;

export default createJxlModule;
