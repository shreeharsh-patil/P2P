import { describe, it, expect } from 'vitest';
import { TransferProtocol, HEADER_SIZE } from '../engine/TransferProtocol.js';

describe('TransferProtocol', () => {
  it('should correctly encode and decode a binary packet with 36-byte header', () => {
    const transferId = 'tx_abc12345';
    const chunkIndex = 42;
    const offset = 1048576n; // 1 MB as BigInt
    
    const payloadText = 'Hello Shree P2P Protocol!';
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payloadText);

    const packedBuffer = TransferProtocol.encodePacket(
      transferId,
      chunkIndex,
      offset,
      payloadBytes.buffer
    );

    expect(packedBuffer.byteLength).toBe(HEADER_SIZE + payloadBytes.byteLength);

    const unpacked = TransferProtocol.decodePacket(packedBuffer);

    expect(unpacked.magic).toBe('SHRE');
    expect(unpacked.transferId).toBe(transferId);
    expect(unpacked.chunkIndex).toBe(chunkIndex);
    expect(unpacked.offset).toBe(offset);
    expect(unpacked.payloadLength).toBe(payloadBytes.byteLength);

    const decoder = new TextDecoder();
    const decodedText = decoder.decode(unpacked.payload);
    expect(decodedText).toBe(payloadText);
  });

  it('should handle large BigInt offset (> 4GB)', () => {
    const transferId = 'large_tx_9999999';
    const chunkIndex = 125000;
    const largeOffset = 32212254720n; // 32 GB as BigInt

    const payload = new Uint8Array([1, 2, 3, 4, 5]);

    const packedBuffer = TransferProtocol.encodePacket(
      transferId,
      chunkIndex,
      largeOffset,
      payload.buffer
    );

    const unpacked = TransferProtocol.decodePacket(packedBuffer);
    expect(unpacked.offset).toBe(largeOffset);
  });

  it('should throw an error for invalid magic header', () => {
    const invalidBuffer = new ArrayBuffer(HEADER_SIZE + 10);
    const view = new DataView(invalidBuffer);
    view.setUint32(0, 0x12345678, false); // Wrong magic bytes

    expect(() => TransferProtocol.decodePacket(invalidBuffer)).toThrow('Invalid magic bytes');
  });
});
