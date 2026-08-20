import { describe, it, expect } from 'vitest';
import { ChunkReader } from '../engine/ChunkReader.js';

describe('ChunkReader', () => {
  it('should slice a File into chunks correctly without loading entire file', async () => {
    const sampleData = new Uint8Array(1024 * 1024 * 2); // 2 MB test file
    for (let i = 0; i < sampleData.length; i++) {
      sampleData[i] = i % 256;
    }

    const testFile = new File([sampleData], 'test_large_file.bin', { type: 'application/octet-stream' });
    const chunkSize = 256 * 1024; // 256 KB
    const reader = new ChunkReader(testFile, chunkSize);

    expect(reader.getTotalChunks()).toBe(8);

    const chunk0 = await reader.readChunk(0);
    expect(chunk0.chunkIndex).toBe(0);
    expect(chunk0.offset).toBe(0n);
    expect(chunk0.length).toBe(chunkSize);

    const chunk0Bytes = new Uint8Array(chunk0.buffer);
    expect(chunk0Bytes[0]).toBe(0);
    expect(chunk0Bytes[1]).toBe(1);

    const lastChunk = await reader.readChunk(7);
    expect(lastChunk.chunkIndex).toBe(7);
    expect(lastChunk.offset).toBe(BigInt(7 * chunkSize));
    expect(lastChunk.length).toBe(chunkSize);
  });

  it('creates one empty chunk for a zero-byte file', async () => {
    const emptyFile = new File([], 'empty.zip', { type: 'application/zip' });
    const reader = new ChunkReader(emptyFile, 60 * 1024);

    expect(reader.getTotalChunks()).toBe(1);
    const chunk = await reader.readChunk(0);
    expect(chunk.offset).toBe(0n);
    expect(chunk.length).toBe(0);
  });
});
