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
});
