/**
 * ChunkReader progressively slices a File using File.slice() and reads only
 * individual chunks into memory as ArrayBuffers.
 */
export class ChunkReader {
  private file: File;
  private chunkSize: number;
  private totalChunks: number;
  private fileSizeBigInt: bigint;

  constructor(file: File, chunkSize: number = 256 * 1024) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.fileSizeBigInt = BigInt(file.size);
    // Send one empty framed packet for a zero-byte file so it can complete.
    this.totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  }

  public getChunkSize(): number {
    return this.chunkSize;
  }

  public getTotalChunks(): number {
    return this.totalChunks;
  }

  public getFileSize(): number {
    return this.file.size;
  }

  /**
   * Reads a single chunk by index asynchronously.
   */
  public async readChunk(chunkIndex: number): Promise<{
    buffer: ArrayBuffer;
    chunkIndex: number;
    offset: bigint;
    length: number;
  }> {
    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      throw new Error(`Chunk index ${chunkIndex} out of bounds (0..${this.totalChunks - 1})`);
    }

    const start = BigInt(chunkIndex) * BigInt(this.chunkSize);
    const end = start + BigInt(this.chunkSize) > this.fileSizeBigInt 
      ? this.fileSizeBigInt 
      : start + BigInt(this.chunkSize);

    // Number(start) and Number(end) are safe for File.slice because browser File.slice takes numbers
    const blobSlice = this.file.slice(Number(start), Number(end));
    const buffer = await blobSlice.arrayBuffer();

    return {
      buffer,
      chunkIndex,
      offset: start,
      length: buffer.byteLength
    };
  }
}
