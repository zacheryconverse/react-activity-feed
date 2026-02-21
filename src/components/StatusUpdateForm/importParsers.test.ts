/// <reference types="jest" />

import { hashIgcContent, inferImportFileType, normalizeIgcForHash } from './importParsers';

describe('importParsers', () => {
  it('does not classify CSV as an import type', () => {
    expect(inferImportFileType('flight.csv')).toBeNull();
    expect(inferImportFileType('flight.igc')).toBe('igc');
    expect(inferImportFileType('bundle.zip')).toBe('zip');
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
