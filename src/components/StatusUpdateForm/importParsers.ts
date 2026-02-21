// @ts-nocheck
import { inflateRaw } from 'pako';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

const DEFAULT_ZIP_LIMITS = {
  maxEntries: 2000,
  maxUncompressedBytes: 250 * 1024 * 1024,
};

function decodeUtf8(uint8Array: Uint8Array) {
  return new TextDecoder('utf-8').decode(uint8Array);
}

function isSupportedFlightFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.igc');
}

export function inferImportFileType(fileName: string) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.igc')) return 'igc';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}

function sanitizeZipPath(entryName: string) {
  const normalized = String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) return null;
  if (normalized.includes('../')) return null;
  if (/^[A-Za-z]:\//.test(normalized)) return null;
  return normalized;
}

function findEocdOffset(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

export async function extractFilesFromZip(zipFile: File, limits = DEFAULT_ZIP_LIMITS) {
  const { maxEntries, maxUncompressedBytes } = {
    ...DEFAULT_ZIP_LIMITS,
    ...(limits || {}),
  };

  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocdOffset = findEocdOffset(bytes);
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP: missing end of central directory');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > maxEntries) {
    throw new Error(`ZIP contains too many entries (${totalEntries} > ${maxEntries})`);
  }
  if (centralDirOffset + centralDirSize > bytes.length) {
    throw new Error('Invalid ZIP: central directory out of range');
  }

  const parsed = [];
  let cursor = centralDirOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > bytes.length) throw new Error('Invalid ZIP: truncated central directory entry');
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('Invalid ZIP: malformed central directory signature');
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > bytes.length) throw new Error('Invalid ZIP: file name out of range');

    const rawName = decodeUtf8(bytes.slice(fileNameStart, fileNameEnd));
    const safePath = sanitizeZipPath(rawName);

    cursor = fileNameEnd + extraLength + commentLength;

    if (!safePath || !isSupportedFlightFile(safePath)) {
      continue;
    }

    if (uncompressedSize > maxUncompressedBytes) {
      throw new Error(`ZIP entry too large: ${safePath}`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxUncompressedBytes) {
      throw new Error(`ZIP exceeds uncompressed limit (${maxUncompressedBytes} bytes)`);
    }

    if (localHeaderOffset + 30 > bytes.length) {
      throw new Error('Invalid ZIP: local header out of range');
    }
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP: malformed local header for ${safePath}`);
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Invalid ZIP: compressed data out of range for ${safePath}`);
    }

    const compressedBytes = bytes.slice(dataStart, dataEnd);
    let outputBytes: Uint8Array;
    if (compressionMethod === 0) {
      outputBytes = compressedBytes;
    } else if (compressionMethod === 8) {
      outputBytes = inflateRaw(compressedBytes);
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${safePath}`);
    }

    const baseName = safePath.split('/').pop() || safePath;
    const file = new File([outputBytes], baseName, { type: 'text/plain' });

    parsed.push({
      file,
      inferredType: inferImportFileType(safePath),
      path: `${zipFile.name}/${safePath}`,
    });
  }

  return parsed;
}

export function normalizeIgcForHash(igcContent: string) {
  const normalized = String(igcContent || '').replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dateLine =
    lines.find((line) => line.startsWith('HFDTE')) || lines.find((line) => line.startsWith('HFDTEDATE')) || null;
  const normalizedDateLine = dateLine ? dateLine.replace(/^HFDTEDATE:/, 'HFDTE') : '';

  const bLines = lines.filter((line) => line.startsWith('B'));
  if (bLines.length === 0) return normalizedDateLine;

  return [normalizedDateLine, ...bLines].filter(Boolean).join('\n');
}

function fallbackHashHex(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

export async function hashIgcContent(igcContent: string) {
  const normalized = normalizeIgcForHash(igcContent);
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return fallbackHashHex(normalized);
  }
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
