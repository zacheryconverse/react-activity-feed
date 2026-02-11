/// <reference types="jest" />

import { buildPreviewFlightStats, chunkItemsForPayload, mergeCsvStatsIntoIgc, normalizeBasename } from './importShared';

describe('importShared', () => {
  it('normalizes basenames across absolute and relative paths', () => {
    expect(normalizeBasename('tracks/Day 1/Flight.IGC')).toBe('flight.igc');
    expect(normalizeBasename('C:\\tracks\\flight.igc')).toBe('flight.igc');
    expect(normalizeBasename('')).toBe('');
  });

  it('chunks items by count and payload size', () => {
    const items = [
      { id: 'a', text: '1111111111' },
      { id: 'b', text: '2222222222' },
      { id: 'c', text: '3333333333' },
    ];

    const byCount = chunkItemsForPayload(items, { maxItems: 2, maxPayloadBytes: Number.POSITIVE_INFINITY });
    expect(byCount).toHaveLength(2);
    expect(byCount[0]).toHaveLength(2);
    expect(byCount[1]).toHaveLength(1);

    const byBytes = chunkItemsForPayload(items, { maxItems: 10, maxPayloadBytes: 60 });
    expect(byBytes.length).toBeGreaterThan(1);
  });

  it('merges consistent CSV metadata into IGC stats', () => {
    const igcStats = {
      date: '2025-02-10',
      duration_s: 3600,
      routeDistance: 50,
      points: [],
      site: null,
    };
    const csvStats = {
      date: '2025-02-10',
      duration_s: 3620,
      routeDistance: 49.8,
      site: 'Sky Ridge',
      points: [{ label: 'Takeoff', latitude: 40, longitude: -105 }],
    };

    const merged = mergeCsvStatsIntoIgc(igcStats, csvStats);
    const mergedStats = merged.merged as Record<string, unknown>;
    expect(merged.consistencyErrors).toHaveLength(0);
    expect(mergedStats.site).toBe('Sky Ridge');
    expect(Array.isArray(mergedStats.points)).toBe(true);
    expect(mergedStats.points as unknown[]).toHaveLength(1);
  });

  it('flags inconsistent CSV/IGC combinations', () => {
    const merged = mergeCsvStatsIntoIgc(
      { date: '2025-02-10', duration_s: 3600, routeDistance: 50 },
      { date: '2025-02-11', duration_s: 1200, routeDistance: 120, site: 'Mismatch' },
    );
    expect(merged.consistencyErrors).toEqual(
      expect.arrayContaining(['date mismatch', 'duration mismatch', 'distance mismatch']),
    );
    const mergedStats = merged.merged as Record<string, unknown>;
    expect(mergedStats.site).toBeUndefined();
  });

  it('builds preview stats and optionally keeps first-point fallback', () => {
    const stats = {
      date: '2025-02-10',
      duration_s: 1200,
      routeDistance: 18.5,
      points: [{ latitude: 1.1, longitude: 2.2, time: '10:00:00' }],
    };
    const withoutFallback = buildPreviewFlightStats(stats, { includeFirstPointFallback: false });
    expect(withoutFallback.points).toBeUndefined();

    const withFallback = buildPreviewFlightStats(stats, {
      includeFirstPointFallback: true,
      maxPreviewPoints: 2,
    });
    expect(withFallback.points).toHaveLength(1);
    expect(withFallback.points?.[0]?.latitude).toBe(1.1);
  });
});
