import { describe, it, expect } from 'vitest';
import { ZipStreamer, calculateCRC32 } from '../utils/zipStreamer';

describe('ZipStreamer & CRC32', () => {
  it('calculates accurate CRC32 for known strings', () => {
    const text = '123456789';
    const bytes = new TextEncoder().encode(text);
    const crc = calculateCRC32(bytes);
    // Standard CRC-32 for "123456789" is 0xcbf43926 (3421780262)
    expect(crc).toBe(0xcbf43926);
  });

  it('generates a valid ZIP blob with directory structure', async () => {
    const file1 = new TextEncoder().encode('Hello World');
    const file2 = new TextEncoder().encode('Nested File Content');

    const zipBlob = await ZipStreamer.createZip([
      { name: 'hello.txt', data: file1 },
      { name: 'folder/subfolder/nested.txt', data: file2 }
    ]);

    expect(zipBlob).toBeDefined();
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(file1.length + file2.length);

    const buffer = await zipBlob.arrayBuffer();
    const view = new DataView(buffer);
    // Check PK local header signature (0x04034b50)
    expect(view.getUint32(0, true)).toBe(0x04034b50);
  });

  it('keeps duplicate names separate and preserves their data, sizes and checksums', async () => {
    const text = new TextEncoder();
    const first = text.encode('first');
    const second = new Uint8Array(1024 * 1024 + 3).fill(42);
    const third = text.encode('third');
    const zip = await ZipStreamer.createZip([
      { name: 'folder/report.txt', data: first },
      { name: 'folder/report.txt', data: new Blob([second]) },
      { name: 'folder\\REPORT.txt', data: third },
    ]);

    const bytes = await zip.arrayBuffer();
    const view = new DataView(bytes);
    const decoder = new TextDecoder();
    let offset = 0;
    const names = ['folder/report.txt', 'folder/report (2).txt', 'folder/REPORT (3).txt'];
    [first, second, third].forEach((payload, index) => {
      expect(view.getUint32(offset, true)).toBe(0x04034b50);
      expect(view.getUint32(offset + 14, true)).toBe(calculateCRC32(payload));
      expect(view.getUint32(offset + 18, true)).toBe(payload.length);
      const nameLength = view.getUint16(offset + 26, true);
      expect(decoder.decode(new Uint8Array(bytes, offset + 30, nameLength))).toBe(names[index]);
      const dataAt = offset + 30 + nameLength;
      expect(calculateCRC32(new Uint8Array(bytes, dataAt, payload.length))).toBe(calculateCRC32(payload));
      offset = dataAt + payload.length;
    });
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
  });

  it('rejects an oversized ZIP before reading the payload', async () => {
    class OversizedFile extends Blob {
      override get size() { return 2 ** 32; }
    }
    await expect(ZipStreamer.createZip([{ name: 'large.bin', data: new OversizedFile() }]))
      .rejects.toThrow('exceed 4 GB');
  });
});
