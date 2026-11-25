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
  return (updateCRC32(0xffffffff, data) ^ 0xffffffff) >>> 0;
}

function updateCRC32(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return crc;
}

const ZIP32_MAX_SIZE = 0xfffffffe;
const ZIP32_MAX_FILES = 0xfffe;
const CRC_READ_SIZE = 1024 * 1024;

async function checksumBlob(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += CRC_READ_SIZE) {
    const block = await blob.slice(offset, offset + CRC_READ_SIZE).arrayBuffer();
    crc = updateCRC32(crc, new Uint8Array(block));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uniqueZipPath(path: string, names: Set<string>, suffixes: Map<string, number>): string {
  const normalized = path.replace(/\\/g, '/').split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('/') || 'file';
  const key = normalized.toLowerCase();
  if (!names.has(key)) {
    names.add(key);
    return normalized;
  }

  const slash = normalized.lastIndexOf('/');
  const dot = normalized.lastIndexOf('.');
  const split = dot > slash + 1 ? dot : normalized.length;
  let suffix = suffixes.get(key) ?? 2;
  let candidate: string;
  do {
    candidate = `${normalized.slice(0, split)} (${suffix++})${normalized.slice(split)}`;
  } while (names.has(candidate.toLowerCase()));
  suffixes.set(key, suffix);
  names.add(candidate.toLowerCase());
  return candidate;
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
    if (entries.length > ZIP32_MAX_FILES) throw new Error('This ZIP has too many files. Download them in smaller batches.');
    const fileRecords: {
      nameBytes: Uint8Array;
      size: number;
      crc: number;
      offset: number;
      dosTime: number;
      dosDate: number;
    }[] = [];

    const localParts: BlobPart[] = [];
    const names = new Set<string>();
    const suffixes = new Map<string, number>();
    const encoder = new TextEncoder();
    let currentOffset = 0;
    let centralDirSize = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(uniqueZipPath(entry.name, names, suffixes));
      const size = entry.data instanceof Blob ? entry.data.size : entry.data.byteLength;
      const end = currentOffset + 30 + nameBytes.length + size;
      centralDirSize += 46 + nameBytes.length;
      if (end + centralDirSize + 22 > ZIP32_MAX_SIZE) {
        throw new Error('This ZIP would exceed 4 GB. Download the files individually or in smaller batches.');
      }
      if (nameBytes.length > 0xffff) throw new Error('A file path is too long for ZIP.');

      // Keep File and Blob payloads as parts of the ZIP instead of copying them into the headers.
      const payload = entry.data instanceof Blob ? entry.data : new Blob([entry.data as BlobPart]);
      const crc = await checksumBlob(payload);

      const date = entry.lastModified ? new Date(entry.lastModified) : new Date();
      const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
      const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(localHeader.buffer);

      view.setUint32(0, 0x04034b50, true); // Local file header signature
      view.setUint16(4, 20, true); // Version needed to extract (2.0)
      view.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 filename)
      view.setUint16(8, 0, true); // Compression method (0 = Store / uncompressed)
      view.setUint16(10, dosTime, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true); // CRC-32
      view.setUint32(18, size, true); // Compressed size
      view.setUint32(22, size, true); // Uncompressed size
      view.setUint16(26, nameBytes.length, true); // Filename length
      view.setUint16(28, 0, true); // Extra field length

      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, payload);

      fileRecords.push({
        nameBytes,
        size,
        crc,
        offset: currentOffset,
        dosTime,
        dosDate
      });

      currentOffset = end;
    }

    // Build Central Directory Records
    const centralDirectoryHeaders: Uint8Array[] = [];

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
      view.setUint32(20, record.size, true); // Compressed size
      view.setUint32(24, record.size, true); // Uncompressed size
      view.setUint16(28, record.nameBytes.length, true); // Filename length
      view.setUint16(30, 0, true); // Extra field length
      view.setUint16(32, 0, true); // Comment length
      view.setUint16(34, 0, true); // Disk number start
      view.setUint16(36, 0, true); // Internal file attributes
      view.setUint32(38, 0, true); // External file attributes
      view.setUint32(42, record.offset, true); // Relative offset of local header

      cdRecord.set(record.nameBytes, 46);
      centralDirectoryHeaders.push(cdRecord);
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
      ...localParts,
      ...centralDirectoryHeaders.map((c) => c.buffer as ArrayBuffer),
      eocd.buffer as ArrayBuffer
    ];
    return new Blob(blobParts, { type: 'application/zip' });
  }
}
