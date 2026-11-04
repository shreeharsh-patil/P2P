/**
 * IntegrityManager computes and verifies cryptographic checksums (SHA-256)
 * using the Web Crypto API.
 *
 * The Web Crypto API has no streaming digest, so large files are hashed with
 * a chunk-tree construction:
 *
 *   digest = SHA-256( SHA-256(chunk_0) || ... || SHA-256(chunk_n) || uint64(size) )
 *
 * Every byte of the file contributes to the result, so any corruption in any
 * chunk changes the final digest. This keeps memory bounded (a few MB at a
 * time) without sampling, which would let corruption in unsampled regions
 * pass verification.
 */

const HASH_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB read blocks
const CHUNK_DIGEST_SIZE = 32; // SHA-256 output

export class IntegrityManager {
  /**
   * Computes the SHA-256 content digest of a Blob/File with bounded memory.
   * Every byte is hashed; the result is deterministic for a given file.
   */
  public static async calculateFileHash(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const size = file.size;
    const totalChunks = Math.max(1, Math.ceil(size / HASH_CHUNK_SIZE));

    // A single chunk is hashed directly to keep small files cheap.
    if (size <= HASH_CHUNK_SIZE) {
      const buffer = await file.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
      onProgress?.(100);
      return this.bufferToHex(digest.buffer as ArrayBuffer);
    }

    const tree = new Uint8Array(totalChunks * CHUNK_DIGEST_SIZE + 8);

    for (let index = 0; index < totalChunks; index++) {
      const start = index * HASH_CHUNK_SIZE;
      const end = Math.min(size, start + HASH_CHUNK_SIZE);
      const slice = file.slice(start, end);
      const chunkBuffer = await slice.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', chunkBuffer));
      tree.set(digest, index * CHUNK_DIGEST_SIZE);
      onProgress?.(Math.round(((index + 1) / totalChunks) * 100));
    }

    // Bind the chunk count/size into the digest so truncation is detectable.
    new DataView(tree.buffer).setBigUint64(totalChunks * CHUNK_DIGEST_SIZE, BigInt(size), false);
    const finalDigest = await crypto.subtle.digest('SHA-256', tree.buffer as ArrayBuffer);
    return this.bufferToHex(finalDigest);
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
