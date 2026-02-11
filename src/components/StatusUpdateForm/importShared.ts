// @ts-nocheck

const estimateJsonBytes = (value) => {
  try {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }
    return serialized.length;
  } catch (error) {
    return 0;
  }
};

export const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseDurationSeconds = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const hms = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2]);
    const seconds = Number(hms[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const hmWords = raw.match(/(?:(\d+)\s*h)?\s*(\d+)\s*m/i);
  if (hmWords) {
    const hours = Number(hmWords[1] || 0);
    const minutes = Number(hmWords[2] || 0);
    return hours * 3600 + minutes * 60;
  }

  return null;
};

const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const iso = value.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
};

export const normalizeBasename = (value) => {
  const raw = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  if (!raw) return '';
  const parts = raw.split('/');
  return (parts[parts.length - 1] || '').toLowerCase();
};

const isDateCompatible = (left, right) => {
  const leftDate = normalizeDateOnly(left);
  const rightDate = normalizeDateOnly(right);
  if (!leftDate || !rightDate) return true;
  return leftDate === rightDate;
};

const isNumberCompatible = (left, right, maxRatio = 0.2, maxAbs = Number.POSITIVE_INFINITY) => {
  const leftNum = toNumberOrNull(left);
  const rightNum = toNumberOrNull(right);
  if (!leftNum || !rightNum) return true;
  const diff = Math.abs(leftNum - rightNum);
  if (diff <= maxAbs) return true;
  const ratio = diff / Math.max(leftNum, rightNum);
  return ratio <= maxRatio;
};

export const mergeCsvStatsIntoIgc = (igcStats = {}, csvStats = {}) => {
  const merged = { ...(igcStats || {}) };
  const consistencyErrors = [];

  if (!isDateCompatible(igcStats?.date || igcStats?.flight_date, csvStats?.date || csvStats?.flight_date)) {
    consistencyErrors.push('date mismatch');
  }

  const igcDuration =
    toNumberOrNull(igcStats?.duration_s) || parseDurationSeconds(igcStats?.flightDuration || igcStats?.duration);
  const csvDuration =
    toNumberOrNull(csvStats?.duration_s) || parseDurationSeconds(csvStats?.flightDuration || csvStats?.duration);
  if (!isNumberCompatible(igcDuration, csvDuration, 0.25, 20 * 60)) {
    consistencyErrors.push('duration mismatch');
  }

  const igcDistance =
    toNumberOrNull(igcStats?.routeDistance) ||
    toNumberOrNull(igcStats?.route_distance_km) ||
    toNumberOrNull(igcStats?.freeDistance);
  const csvDistance =
    toNumberOrNull(csvStats?.routeDistance) ||
    toNumberOrNull(csvStats?.route_distance_km) ||
    toNumberOrNull(csvStats?.freeDistance);
  if (!isNumberCompatible(igcDistance, csvDistance, 0.2, 5)) {
    consistencyErrors.push('distance mismatch');
  }

  if (!consistencyErrors.length) {
    if (!merged.site && csvStats?.site) merged.site = csvStats.site;
    if (!merged.pilot && csvStats?.pilot) merged.pilot = csvStats.pilot;
    if (!merged.start_time && csvStats?.start_time) merged.start_time = csvStats.start_time;
    if (!merged.end_time && csvStats?.end_time) merged.end_time = csvStats.end_time;
    if (!merged.maxAltitude && csvStats?.maxAltitude) merged.maxAltitude = csvStats.maxAltitude;
    if (
      (!Array.isArray(merged.points) || merged.points.length === 0) &&
      Array.isArray(csvStats?.points) &&
      csvStats.points.length > 0
    ) {
      merged.points = csvStats.points;
    }
  }

  return {
    merged,
    consistencyErrors,
  };
};

export const chunkItemsForPayload = (
  items,
  {
    maxItems = Number.POSITIVE_INFINITY,
    maxPayloadBytes = Number.POSITIVE_INFINITY,
  }: { maxItems?: number; maxPayloadBytes?: number } = {},
) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const chunks = [];
  let currentChunk = [];
  let currentBytes = 2;

  items.forEach((item) => {
    const itemBytes = Math.max(1, estimateJsonBytes(item));
    const exceedsItems = currentChunk.length >= maxItems;
    const exceedsBytes = currentChunk.length > 0 && currentBytes + itemBytes + 1 > maxPayloadBytes;

    if (exceedsItems || exceedsBytes) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 2;
    }

    currentChunk.push(item);
    currentBytes += itemBytes + 1;
  });

  if (currentChunk.length) {
    chunks.push(currentChunk);
  }

  return chunks;
};

export const buildPreviewFlightStats = (
  flightStats = {},
  {
    includeFirstPointFallback = false,
    maxPreviewPoints = 2,
  }: { includeFirstPointFallback?: boolean; maxPreviewPoints?: number } = {},
) => {
  const stats = flightStats || {};
  const points = Array.isArray(stats.points)
    ? stats.points
        .filter(
          (point, index) =>
            point &&
            (point.label === 'First Fix' || point.label === 'Takeoff' || (includeFirstPointFallback && index === 0)),
        )
        .slice(0, maxPreviewPoints)
        .map((point) => ({
          label: point?.label || null,
          latitude: toNumberOrNull(point?.latitude),
          longitude: toNumberOrNull(point?.longitude),
          time: point?.time || null,
        }))
    : [];

  return {
    date: stats.date || stats.flight_date || null,
    duration_s: toNumberOrNull(stats.duration_s),
    duration: stats.duration || null,
    flightDuration: stats.flightDuration || null,
    maxAltitude: toNumberOrNull(stats.maxAltitude || stats.max_altitude_m),
    routeDistance: toNumberOrNull(
      stats.routeDistance || stats.route_distance_km || stats.distance_km || stats.freeDistance,
    ),
    site: stats.site || stats.site_name || stats.takeoff || null,
    start_time: stats.start_time || null,
    totalDistance: toNumberOrNull(stats.totalDistance || stats.tracklogDistance),
    ...(points.length ? { points } : {}),
  };
};
