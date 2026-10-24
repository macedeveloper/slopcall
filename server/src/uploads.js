import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const UPLOAD_LIMITS = {
  maxBytes: 256 * 1024 * 1024,
  largeFileBytes: 32 * 1024 * 1024,
  largeRetentionMs: 7 * 24 * 60 * 60 * 1000,
  retentionMs: 30 * 24 * 60 * 60 * 1000
};

export class UploadTooLargeError extends Error {
  constructor() {
    super('File is larger than 256 MB');
    this.name = 'UploadTooLargeError';
  }
}

export class EmptyUploadError extends Error {
  constructor() {
    super('File is empty');
    this.name = 'EmptyUploadError';
  }
}

function isValidId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

function sanitizeName(value) {
  const name = path
    .basename(typeof value === 'string' ? value : 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);

  return name || 'file';
}

function sanitizeContentType(value) {
  const type =
    typeof value === 'string'
      ? value.split(';')[0].trim().toLowerCase()
      : '';

  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : 'application/octet-stream';
}

const EXTENSION_CONTENT_TYPES = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  jxl: 'image/jxl',
  png: 'image/png',
  qoi: 'image/qoi',
  webp: 'image/webp'
};

function inferContentType(name, value) {
  const contentType = sanitizeContentType(value);
  if (contentType !== 'application/octet-stream') {
    return contentType;
  }

  const extension = path.extname(name).slice(1).toLowerCase();
  return EXTENSION_CONTENT_TYPES[extension] ?? contentType;
}

function validMeta(meta, id) {
  return (
    meta &&
    meta.id === id &&
    typeof meta.name === 'string' &&
    Number.isFinite(meta.size) &&
    typeof meta.contentType === 'string' &&
    Number.isFinite(meta.expiresAt)
  );
}

/**
 * Stores uploaded files as opaque UUID blobs plus a small JSON sidecar.
 * Files above 32 MB expire after 7 days; everything else expires after 30 days.
 */
export class UploadStore {
  constructor(directory) {
    this.dir = directory;
    this.meta = new Map();
    fs.mkdirSync(directory, { recursive: true });
    this.load();
  }

  fileFor(id) {
    return path.join(this.dir, id);
  }

  metaFor(id) {
    return path.join(this.dir, `${id}.json`);
  }

  load() {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch (error) {
      console.error('[uploads] failed to read directory:', error.message);
      return;
    }

    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }

      const id = name.slice(0, -'.json'.length);
      const meta = this.readMeta(id);
      if (meta) {
        this.meta.set(id, meta);
      }
    }

    this.cleanup();
  }

  readMeta(id) {
    if (!isValidId(id)) {
      return null;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(this.metaFor(id), 'utf8'));
      if (!validMeta(meta, id)) {
        return null;
      }
      if (meta.expiresAt <= Date.now()) {
        this.remove(meta);
        return null;
      }
      return meta;
    } catch {
      return null;
    }
  }

  async save(request, name, contentType) {
    const id = crypto.randomUUID();
    const temporary = path.join(this.dir, `.${id}.tmp`);
    let bytes = 0;

    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > UPLOAD_LIMITS.maxBytes) {
          callback(new UploadTooLargeError());
          return;
        }
        callback(null, chunk);
      }
    });

    try {
      await pipeline(request, limiter, fs.createWriteStream(temporary));

      if (bytes === 0) {
        throw new EmptyUploadError();
      }

      const now = Date.now();
      const retention =
        bytes > UPLOAD_LIMITS.largeFileBytes
          ? UPLOAD_LIMITS.largeRetentionMs
          : UPLOAD_LIMITS.retentionMs;

      const safeName = sanitizeName(name);
      const meta = {
        id,
        name: safeName,
        size: bytes,
        contentType: inferContentType(safeName, contentType),
        uploadedAt: now,
        expiresAt: now + retention
      };

      fs.renameSync(temporary, this.fileFor(id));
      fs.writeFileSync(this.metaFor(id), JSON.stringify(meta));
      this.meta.set(id, meta);
      return meta;
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  get(id) {
    if (!isValidId(id)) {
      return null;
    }

    const cached = this.meta.get(id);
    if (cached) {
      if (cached.expiresAt <= Date.now()) {
        this.remove(cached);
        return null;
      }
      return cached;
    }

    const meta = this.readMeta(id);
    if (meta) {
      this.meta.set(id, meta);
    }
    return meta;
  }

  pathFor(meta) {
    return this.fileFor(meta.id);
  }

  publicInfo(meta) {
    return {
      id: meta.id,
      name: meta.name,
      size: meta.size,
      contentType: meta.contentType,
      url: `/files/${meta.id}`,
      expiresAt: meta.expiresAt
    };
  }

  remove(meta) {
    this.meta.delete(meta.id);
    fs.rmSync(this.fileFor(meta.id), { force: true });
    fs.rmSync(this.metaFor(meta.id), { force: true });
  }

  cleanup() {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }

    const now = Date.now();
    for (const name of names) {
      const file = path.join(this.dir, name);

      if (name.endsWith('.json')) {
        const id = name.slice(0, -'.json'.length);
        const meta = this.readMeta(id);
        if (meta) {
          this.meta.set(id, meta);
        }
        continue;
      }

      if (name.startsWith('.')) {
        try {
          if (now - fs.statSync(file).mtimeMs > 60 * 60 * 1000) {
            fs.rmSync(file, { force: true });
          }
        } catch {
          // Best-effort cleanup.
        }
        continue;
      }

      if (isValidId(name) && !fs.existsSync(this.metaFor(name))) {
        try {
          if (now - fs.statSync(file).mtimeMs > 60 * 60 * 1000) {
            fs.rmSync(file, { force: true });
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  }
}
