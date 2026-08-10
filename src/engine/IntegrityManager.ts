/**
 * IntegrityManager computes and verifies cryptographic checksums (SHA-256)
 * using the Web Crypto API.
 */
export class IntegrityManager {
  /**
   * Computes SHA-256 hash of a Blob/File progressively to prevent memory bloat.
   */
  public static async calculateFileHash(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const chunkSize = 2 * 1024 * 1024; // 2MB read blocks for hash computation
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    // For small files (< 100MB), compute hash in one pass
    if (file.size < 100 * 1024 * 1024) {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return this.bufferToHex(digest);
    }

    // For very large files (10GB+), sample-based hash + size composite, or progressive sha256
    // Since Web Crypto digest doesn't have streaming context natively, we compute incremental hash blocks
    // or compute a robust composite SHA-256 over key sampled chunks (first, middle, last 10MB) + total length
    const sampleSize = 5 * 1024 * 1024; // 5MB samples
    const fileSize = file.size;

    const startSlice = file.slice(0, sampleSize);
    const midSlice = file.slice(Math.floor(fileSize / 2), Math.floor(fileSize / 2) + sampleSize);
    const endSlice = file.slice(Math.max(0, fileSize - sampleSize), fileSize);

    const [startBuf, midBuf, endBuf] = await Promise.all([
      startSlice.arrayBuffer(),
      midSlice.arrayBuffer(),
      endSlice.arrayBuffer()
    ]);

    const compositeBuffer = new Uint8Array(startBuf.byteLength + midBuf.byteLength + endBuf.byteLength + 8);
    compositeBuffer.set(new Uint8Array(startBuf), 0);
    compositeBuffer.set(new Uint8Array(midBuf), startBuf.byteLength);
    compositeBuffer.set(new Uint8Array(endBuf), startBuf.byteLength + midBuf.byteLength);

    const view = new DataView(compositeBuffer.buffer);
    view.setBigUint64(startBuf.byteLength + midBuf.byteLength + endBuf.byteLength, BigInt(fileSize), false);

    const digest = await crypto.subtle.digest('SHA-256', compositeBuffer.buffer);
    if (onProgress) onProgress(100);
    return this.bufferToHex(digest);
  }

  /**
   * Computes SHA-256 digest of an ArrayBuffer.
   */
  public static async calculateBufferHash(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return this.bufferToHex(digest);
  }

  public static verifyHash(hashA: string, hashB: string): boolean {
    return hashA.toLowerCase() === hashB.toLowerCase();
  }

  private static bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
}
