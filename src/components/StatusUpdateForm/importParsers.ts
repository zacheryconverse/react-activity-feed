// @ts-nocheck
import { inflateRaw } from 'pako';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

const DEFAULT_ZIP_LIMITS = {
  maxEntries: 2000,
  maxUncompressedBytes: 250 * 1024 * 1024,
};

const CSV_FIELD_ALIASES = {
  date: ['date', 'flight_date', 'flight date', 'day'],
  distance: ['distance', 'distance_km', 'distance km', 'route_distance', 'route_distance_km'],
  duration: ['duration', 'duration_s', 'duration_sec', 'flight_duration', 'flight duration', 'time'],
  endTime: ['end_time', 'landing_time', 'end', 'time_end'],
  igcFileName: ['igc', 'igc_file', 'igc_filename', 'igc_file_name', 'track_file', 'track_filename'],
  landing: ['landing', 'landing_name', 'landing site', 'ldg'],
  landingLat: ['landing_lat', 'landing_latitude', 'ldg_lat', 'landing latitude'],
  landingLng: ['landing_lng', 'landing_longitude', 'ldg_lng', 'landing longitude'],
  maxAltitude: ['max_altitude', 'max_altitude_m', 'max altitude', 'altitude_max'],
  pilot: ['pilot', 'pilot_name', 'name'],
  routeType: ['route_type', 'route', 'type'],
  site: ['site', 'site_name', 'takeoff_site', 'launch_site'],
  startTime: ['start_time', 'takeoff_time', 'launch_time', 'start', 'time_start'],
  takeoff: ['takeoff', 'takeoff_name', 'launch', 'launch_name', 'to'],
  takeoffLat: ['takeoff_lat', 'takeoff_latitude', 'launch_lat', 'takeoff latitude'],
  takeoffLng: ['takeoff_lng', 'takeoff_longitude', 'launch_lng', 'takeoff longitude'],
};

function decodeUtf8(uint8Array: Uint8Array) {
  return new TextDecoder('utf-8').decode(uint8Array);
}

function toLowerTrim(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isSupportedFlightFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.igc') || lower.endsWith('.csv');
}

export function inferImportFileType(fileName: string) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.igc')) return 'igc';
  if (lower.endsWith('.csv')) return 'csv';
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
    const mimeType = safePath.toLowerCase().endsWith('.csv') ? 'text/csv' : 'text/plain';
    const file = new File([outputBytes], baseName, { type: mimeType });

    parsed.push({
      file,
      inferredType: inferImportFileType(safePath),
      path: `${zipFile.name}/${safePath}`,
    });
  }

  return parsed;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  if (!headers.length) return -1;
  const normalizedHeaders = headers.map((header) => toLowerTrim(header));
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(toLowerTrim(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function parseCsvDuration(raw: string) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return asNum;
  }

  const hms = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2]);
    const seconds = Number(hms[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const hmWords = trimmed.match(/(?:(\d+)\s*h)?\s*(\d+)\s*m/i);
  if (hmWords) {
    const hours = Number(hmWords[1] || 0);
    const minutes = Number(hmWords[2] || 0);
    return hours * 3600 + minutes * 60;
  }

  return null;
}

function parseTime(raw: string) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;

  const h = String(hh).padStart(2, '0');
  const m = String(mm).padStart(2, '0');
  const s = String(ss).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function normalizeDate(raw: string) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (slash) {
    const day = String(Number(slash[1])).padStart(2, '0');
    const month = String(Number(slash[2])).padStart(2, '0');
    const yearRaw = Number(slash[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (year >= 2000 && year < 2200) return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function toNumber(raw: string) {
  if (raw === null || raw === undefined) return null;
  const normalized = String(raw).replace(',', '.').trim();
  if (!normalized) return null;
  const numeric = Number(normalized.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDuration(durationS: number | null) {
  if (!durationS || durationS <= 0) return null;
  const hours = Math.floor(durationS / 3600);
  const minutes = Math.floor((durationS % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function normalizeRowValue(row: string[], index: number) {
  if (index < 0 || index >= row.length) return '';
  return String(row[index] || '').trim();
}

function buildCsvFieldMap(headers: string[]) {
  const mapping = {};
  Object.entries(CSV_FIELD_ALIASES).forEach(([field, aliases]) => {
    mapping[field] = findHeaderIndex(headers, aliases);
  });
  return mapping;
}

export function parseCsvContent(content: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((value) => String(value || '').trim() !== ''));
  if (!nonEmptyRows.length) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRows[0].map((header) => String(header || '').trim());
  const dataRows = nonEmptyRows.slice(1);

  return { headers, rows: dataRows };
}

// Domain CSV mappings are intentionally flexible and branchy in v1.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizeCsvRows(content: string, sourceFileName: string) {
  const { headers, rows } = parseCsvContent(content);
  if (!headers.length) {
    return { errors: ['CSV appears empty'], rows: [] };
  }

  const fieldMap = buildCsvFieldMap(headers);
  const normalizedRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const dateValue = normalizeDate(normalizeRowValue(row, fieldMap.date));
    if (!dateValue) {
      errors.push(`Row ${rowNumber}: missing or invalid date`);
      return;
    }

    const startTime = parseTime(normalizeRowValue(row, fieldMap.startTime));
    const endTime = parseTime(normalizeRowValue(row, fieldMap.endTime));
    const explicitDurationS = parseCsvDuration(normalizeRowValue(row, fieldMap.duration));
    let durationS = explicitDurationS;

    if (!durationS && startTime && endTime) {
      const [startH, startM, startS] = startTime.split(':').map(Number);
      const [endH, endM, endS] = endTime.split(':').map(Number);
      const startSeconds = startH * 3600 + startM * 60 + startS;
      const endSeconds = endH * 3600 + endM * 60 + endS;
      let diff = endSeconds - startSeconds;
      if (diff < 0) diff += 24 * 3600;
      if (diff > 0) durationS = diff;
    }

    const distanceKm = toNumber(normalizeRowValue(row, fieldMap.distance));
    const maxAltitude = toNumber(normalizeRowValue(row, fieldMap.maxAltitude));
    const takeoff = normalizeRowValue(row, fieldMap.takeoff) || normalizeRowValue(row, fieldMap.site);
    const landing = normalizeRowValue(row, fieldMap.landing);
    const pilot = normalizeRowValue(row, fieldMap.pilot);
    const routeType = normalizeRowValue(row, fieldMap.routeType);

    const takeoffLat = toNumber(normalizeRowValue(row, fieldMap.takeoffLat));
    const takeoffLng = toNumber(normalizeRowValue(row, fieldMap.takeoffLng));
    const landingLat = toNumber(normalizeRowValue(row, fieldMap.landingLat));
    const landingLng = toNumber(normalizeRowValue(row, fieldMap.landingLng));

    const igcFileName = normalizeRowValue(row, fieldMap.igcFileName) || null;

    const points = [];
    if (Number.isFinite(takeoffLat) && Number.isFinite(takeoffLng)) {
      points.push({
        label: 'Takeoff',
        latitude: takeoffLat,
        longitude: takeoffLng,
        time: startTime || null,
      });
    }
    if (Number.isFinite(landingLat) && Number.isFinite(landingLng)) {
      points.push({
        label: 'Landing',
        latitude: landingLat,
        longitude: landingLng,
        time: endTime || null,
      });
    }

    const classification =
      routeType && /fai/i.test(routeType)
        ? 'FAI Triangle'
        : routeType && /flat|triangle/i.test(routeType)
        ? 'Free Triangle'
        : routeType && /free/i.test(routeType)
        ? 'Free Flight'
        : null;

    normalizedRows.push({
      csvSourceFile: sourceFileName,
      csvRowIndex: rowNumber,
      flightStats: {
        classification,
        csvIgcFileName: igcFileName,
        date: dateValue,
        duration_s: durationS || null,
        end_time: endTime || null,
        flightDuration: formatDuration(durationS),
        freeDistance: distanceKm,
        maxAltitude,
        pilot: pilot || null,
        points,
        routeDistance: distanceKm,
        site: takeoff || null,
        start_time: startTime || null,
        totalDistance: distanceKm,
      },
      igcFileName: igcFileName ? igcFileName.split('/').pop() : null,
      rawRow: row,
      summary: {
        date: dateValue,
        distanceKm,
        duration: formatDuration(durationS),
        landing: landing || null,
        takeoff: takeoff || null,
      },
    });
  });

  return { errors, rows: normalizedRows };
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
