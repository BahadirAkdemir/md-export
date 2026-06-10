import * as path from 'node:path';
import * as vscode from 'vscode';

export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export function resolveLocalImagePath(src: string, baseDir: string): string | undefined {
  if (!src || /^(?:data:|https?:)/i.test(src)) return undefined;

  if (/^file:/i.test(src)) {
    try {
      return vscode.Uri.parse(src).fsPath;
    } catch {
      return undefined;
    }
  }

  const withoutHash = src.split('#', 1)[0];
  const withoutQuery = withoutHash.split('?', 1)[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // Keep the original value if it is not valid percent-encoding.
  }

  return path.isAbsolute(decoded) ? decoded : path.resolve(baseDir, decoded);
}

export function imageDimensions(data: Buffer, ext: string): ImageDimensions | undefined {
  const normalized = ext.toLowerCase();
  if (normalized === '.png') return pngDimensions(data);
  if (normalized === '.jpg' || normalized === '.jpeg') return jpegDimensions(data);
  return undefined;
}

function pngDimensions(data: Buffer): ImageDimensions | undefined {
  if (data.length < 24) return undefined;
  const signature = data.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return undefined;
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function jpegDimensions(data: Buffer): ImageDimensions | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = data[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;

    const length = data.readUInt16BE(offset + 2);
    if (length < 2) return undefined;

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return undefined;
}
