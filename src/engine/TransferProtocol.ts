/**
 * Binary Protocol Framing for Shree WebRTC DataChannel
 * Header Layout (36 bytes):
 * - [0..3]: Magic 'SHRE' (4 bytes)
 * - [4..19]: Transfer ID (16 bytes ASCII padded with zeros)
 * - [20..23]: Chunk Index (Uint32, 4 bytes)
 * - [24..31]: Offset (BigUint64, 8 bytes)
 * - [32..35]: Payload Length (Uint32, 4 bytes)
 * - [36..36+N]: Payload bytes
 */

export interface ParsedChunkPacket {
  magic: string;
  transferId: string;
  chunkIndex: number;
  offset: bigint;
  payloadLength: number;
  payload: Uint8Array;
}

export const HEADER_SIZE = 36;
const MAGIC_BYTES = new Uint8Array([0x53, 0x48, 0x52, 0x45]); // 'SHRE'

export class TransferProtocol {
  /**
   * Encodes a chunk buffer into a framed binary ArrayBuffer with 36-byte header.
   */
  public static encodePacket(
    transferId: string,
    chunkIndex: number,
    offset: bigint,
    payloadBuffer: ArrayBuffer
  ): ArrayBuffer {
    const payloadBytes = new Uint8Array(payloadBuffer);
    const totalLength = HEADER_SIZE + payloadBytes.byteLength;
    const packet = new Uint8Array(totalLength);

    // 1. Magic
    packet.set(MAGIC_BYTES, 0);

    // 2. Transfer ID (16 bytes string)
    const idEncoder = new TextEncoder();
    const idBytes = idEncoder.encode(transferId.slice(0, 16));
    packet.set(idBytes, 4);

    // 3. DataView for numbers
    const view = new DataView(packet.buffer);
    view.setUint32(20, chunkIndex, false); // Big-endian
    view.setBigUint64(24, offset, false);
    view.setUint32(32, payloadBytes.byteLength, false);

    // 4. Payload
    packet.set(payloadBytes, HEADER_SIZE);

    return packet.buffer;
  }

  /**
   * Decodes a binary ArrayBuffer packet into a parsed header & payload.
   */
  public static decodePacket(buffer: ArrayBuffer): ParsedChunkPacket {
    if (buffer.byteLength < HEADER_SIZE) {
      throw new Error(`Invalid packet length: ${buffer.byteLength} (min ${HEADER_SIZE})`);
    }

    const view = new DataView(buffer);

    // 1. Verify Magic
    const magic0 = view.getUint8(0);
    const magic1 = view.getUint8(1);
    const magic2 = view.getUint8(2);
    const magic3 = view.getUint8(3);

    if (magic0 !== 0x53 || magic1 !== 0x48 || magic2 !== 0x52 || magic3 !== 0x45) {
      throw new Error('Invalid magic bytes in packet header');
    }

    // 2. Transfer ID
    const idBytes = new Uint8Array(buffer, 4, 16);
    const decoder = new TextDecoder();
    const rawId = decoder.decode(idBytes);
    // Strip trailing null characters (\0)
    const transferId = rawId.replace(/\0/g, '');

    // 3. Numbers
    const chunkIndex = view.getUint32(20, false);
    const offset = view.getBigUint64(24, false);
    const payloadLength = view.getUint32(32, false);

    // 4. Payload
    const payload = new Uint8Array(buffer, HEADER_SIZE, payloadLength);

    return {
      magic: 'SHRE',
      transferId,
      chunkIndex,
      offset,
      payloadLength,
      payload
    };
  }
}
