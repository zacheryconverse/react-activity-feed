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
