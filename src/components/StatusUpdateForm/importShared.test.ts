/// <reference types="jest" />

import { buildPreviewFlightStats, chunkItemsForPayload } from './importShared';

describe('importShared', () => {
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
