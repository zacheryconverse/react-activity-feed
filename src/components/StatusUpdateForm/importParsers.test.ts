/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';
import { hashIgcContent, normalizeCsvRows, normalizeIgcForHash } from './importParsers';

type ParsedCsvRow = {
  flightStats?: {
    classification?: string;
    duration_s?: number | null;
  };
  igcFileName?: string | null;
  summary?: {
    date?: string | null;
    distanceKm?: number | null;
  };
};

describe('importParsers', () => {
  it('normalizes CSV rows from fixture with row-level errors', () => {
    const fixturePath = path.join(__dirname, '__fixtures__', 'basic-flight-export.csv');
    const csvContent = fs.readFileSync(fixturePath, 'utf8');

    const parsed = normalizeCsvRows(csvContent, 'basic-flight-export.csv') as {
      errors: string[];
      rows: ParsedCsvRow[];
    };
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.errors).toContain('Row 4: missing or invalid date');

    const firstRow = parsed.rows[0];
    expect(firstRow).toBeTruthy();
    expect(firstRow.summary?.date).toBe('2025-01-02');
    expect(firstRow.summary?.distanceKm).toBe(85.2);
    expect(firstRow.flightStats?.duration_s).toBe(5400);
    expect(firstRow.igcFileName).toBe('track-a.igc');

    const secondRow = parsed.rows[1];
    expect(secondRow).toBeTruthy();
    expect(secondRow.summary?.date).toBe('2025-01-03');
    expect(secondRow.flightStats?.classification).toBe('FAI Triangle');
  });

  it('hashes equivalent IGC content to the same value', async () => {
    const igcA = [
      'AXXX',
      'HFPLTPILOT:Jane',
      'HFDTE010125',
      'B1000001234567N12345678EA0123401234',
      'B1001001234568N12345679EA0123501235',
    ].join('\n');
    const igcB = [
      'AYYY',
      'HFPLTPILOT:Another Pilot',
      'HFDTEDATE:010125',
      'B1000001234567N12345678EA0123401234',
      'B1001001234568N12345679EA0123501235',
    ].join('\r\n');

    expect(normalizeIgcForHash(igcA)).toBe(normalizeIgcForHash(igcB));
    await expect(hashIgcContent(igcA)).resolves.toEqual(await hashIgcContent(igcB));
  });
});
