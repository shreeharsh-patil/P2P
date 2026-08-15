/**
 * Lightweight Zero-Dependency Client-Side ZIP Generator
 * Generates standard PKZIP (.zip) archives from blobs/files with directory structures.
 */

// Precomputed CRC32 Lookup Table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c;
}

export function calculateCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string; // Relative path (e.g. "photos/vacation.jpg" or "data.csv")
  data: Uint8Array | ArrayBuffer | Blob;
  lastModified?: number;
}

export class ZipStreamer {
  /**
   * Creates a downloadable ZIP Blob from an array of file entries.
   */
  public static async createZip(entries: ZipEntryInput[]): Promise<Blob> {
    const fileRecords: {
      nameBytes: Uint8Array;
      dataBytes: Uint8Array;
      crc: number;
      offset: number;
      dosTime: number;
      dosDate: number;
    }[] = [];

    const localHeaders: Uint8Array[] = [];
    let currentOffset = 0;

    for (const entry of entries) {
      let dataBytes: Uint8Array;
      if (entry.data instanceof Blob) {
        dataBytes = new Uint8Array(await entry.data.arrayBuffer());
      } else if (entry.data instanceof ArrayBuffer) {
        dataBytes = new Uint8Array(entry.data);
      } else {
        dataBytes = entry.data;
      }

      // Normalize path to use forward slashes and remove leading slashes
      const normalizedPath = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const nameBytes = new TextEncoder().encode(normalizedPath);
      const crc = calculateCRC32(dataBytes);

      const date = entry.lastModified ? new Date(entry.lastModified) : new Date();
      const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
      const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

      // Local File Header (30 bytes + name length + data length)
      const localHeader = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const view = new DataView(localHeader.buffer);

      view.setUint32(0, 0x04034b50, true); // Local file header signature
      view.setUint16(4, 20, true); // Version needed to extract (2.0)
      view.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 filename)
      view.setUint16(8, 0, true); // Compression method (0 = Store / uncompressed)
      view.setUint16(10, dosTime, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true); // CRC-32
      view.setUint32(18, dataBytes.length, true); // Compressed size
      view.setUint32(22, dataBytes.length, true); // Uncompressed size
      view.setUint16(26, nameBytes.length, true); // Filename length
      view.setUint16(28, 0, true); // Extra field length

      localHeader.set(nameBytes, 30);
      localHeader.set(dataBytes, 30 + nameBytes.length);

      localHeaders.push(localHeader);

      fileRecords.push({
        nameBytes,
        dataBytes,
        crc,
        offset: currentOffset,
        dosTime,
        dosDate
      });

      currentOffset += localHeader.length;
    }

    // Build Central Directory Records
    const centralDirectoryHeaders: Uint8Array[] = [];
    let centralDirSize = 0;

    for (const record of fileRecords) {
      const cdRecord = new Uint8Array(46 + record.nameBytes.length);
      const view = new DataView(cdRecord.buffer);

      view.setUint32(0, 0x02014b50, true); // Central directory header signature
      view.setUint16(4, 20, true); // Version made by (2.0)
      view.setUint16(6, 20, true); // Version needed (2.0)
      view.setUint16(8, 0x0800, true); // General purpose bit flag (UTF-8)
      view.setUint16(10, 0, true); // Compression method (Store)
      view.setUint16(12, record.dosTime, true);
      view.setUint16(14, record.dosDate, true);
      view.setUint32(16, record.crc, true);
      view.setUint32(20, record.dataBytes.length, true); // Compressed size
      view.setUint32(24, record.dataBytes.length, true); // Uncompressed size
      view.setUint16(28, record.nameBytes.length, true); // Filename length
      view.setUint16(30, 0, true); // Extra field length
      view.setUint16(32, 0, true); // Comment length
      view.setUint16(34, 0, true); // Disk number start
      view.setUint16(36, 0, true); // Internal file attributes
      view.setUint32(38, 0, true); // External file attributes
      view.setUint32(42, record.offset, true); // Relative offset of local header

      cdRecord.set(record.nameBytes, 46);
      centralDirectoryHeaders.push(cdRecord);
      centralDirSize += cdRecord.length;
    }

    // End of Central Directory Record (22 bytes)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
    eocdView.setUint16(4, 0, true); // Disk number
    eocdView.setUint16(6, 0, true); // Disk with central directory
    eocdView.setUint16(8, fileRecords.length, true); // Number of entries on this disk
    eocdView.setUint16(10, fileRecords.length, true); // Total entries
    eocdView.setUint32(12, centralDirSize, true); // Size of central directory
    eocdView.setUint32(16, currentOffset, true); // Offset of start of central directory
    eocdView.setUint16(20, 0, true); // Comment length

    // Assemble final parts
    const blobParts: BlobPart[] = [
      ...localHeaders.map((h) => h.buffer as ArrayBuffer),
      ...centralDirectoryHeaders.map((c) => c.buffer as ArrayBuffer),
      eocd.buffer as ArrayBuffer
    ];
    return new Blob(blobParts, { type: 'application/zip' });
  }
}
