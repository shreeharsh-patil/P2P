import { describe, it, expect } from 'vitest';
import { IntegrityManager } from '../engine/IntegrityManager';
import { TransferProtocol, HEADER_SIZE } from '../engine/TransferProtocol';
import { ResumeManager } from '../engine/ResumeManager';

describe('IntegrityManager.calculateFileHash', () => {
  it('matches a one-shot SHA-256 for small files', async () => {
    const content = new TextEncoder().encode('shree-p2p-small-file');
    const file = new File([content], 'small.txt', { type: 'text/plain' });
    const reference = await crypto.subtle.digest('SHA-256', content.buffer);
    const referenceHex = Array.from(new Uint8Array(reference))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    expect(await IntegrityManager.calculateFileHash(file)).toBe(referenceHex);
  });

  it('is deterministic and detects corruption anywhere in large files', async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;

    const original = new File([bytes], 'big.bin');
    const hashA = await IntegrityManager.calculateFileHash(original);
    const hashAAgain = await IntegrityManager.calculateFileHash(new File([bytes], 'big.bin'));
    expect(hashA).toBe(hashAAgain);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);

    // Flip a byte in the middle section that the old sampled scheme missed.
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    const corrupted = new File([bytes], 'big.bin');
    const hashCorrupted = await IntegrityManager.calculateFileHash(corrupted);
    expect(hashCorrupted).not.toBe(hashA);
  });
});

describe('TransferProtocol.decodePacket', () => {
  it('rejects packets whose header length does not match the buffer', () => {
    const packed = TransferProtocol.encodePacket(
      'tx_abc12345',
      0,
      0n,
      new TextEncoder().encode('payload').buffer
    );
    const view = new DataView(packed);
    view.setUint32(32, view.getUint32(32, false) + 1, false);

    expect(() => TransferProtocol.decodePacket(packed)).toThrow('Packet length mismatch');
  });

  it('accepts well-formed packets and round-trips the payload', () => {
    const payload = new TextEncoder().encode('hello').buffer;
    const packed = TransferProtocol.encodePacket('tx_ok99', 7, 42n, payload);
    const decoded = TransferProtocol.decodePacket(packed);

    expect(decoded.transferId).toBe('tx_ok99');
    expect(decoded.chunkIndex).toBe(7);
    expect(decoded.offset).toBe(42n);
    expect(decoded.payloadLength).toBe(new TextEncoder().encode('hello').byteLength);
    expect(packed.byteLength).toBe(HEADER_SIZE + 5);
  });
});

describe('ResumeManager', () => {
  it('ignores out-of-range chunk indexes from a misbehaving peer', async () => {
    const manager = new ResumeManager('tx_test', 3);

    await manager.markChunkReceived(-1);
    await manager.markChunkReceived(3);
    await manager.markChunkReceived(1.5);
    await manager.markChunkReceived(Number.MAX_SAFE_INTEGER);
    expect(manager.getReceivedCount()).toBe(0);

    await manager.markChunkReceived(0);
    await manager.markChunkReceived(2);
    expect(manager.getReceivedCount()).toBe(2);
    expect(manager.isComplete()).toBe(false);
  });
});
