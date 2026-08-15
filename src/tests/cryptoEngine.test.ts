import { describe, it, expect } from 'vitest';
import { CryptoEngine } from '../engine/CryptoEngine';

describe('CryptoEngine (Zero-Knowledge E2EE & Passphrase)', () => {
  it('performs ECDH key agreement and encrypts/decrypts payloads with AES-GCM 256', async () => {
    // 1. Peer A generates ephemeral ECDH keypair
    const aliceKeys = await CryptoEngine.generateECDHKeyPair();
    // 2. Peer B generates ephemeral ECDH keypair
    const bobKeys = await CryptoEngine.generateECDHKeyPair();

    // 3. Both derive symmetric AES-GCM session key
    const aliceDerivedKey = await CryptoEngine.deriveSharedKey(aliceKeys.privateKey, bobKeys.publicKeyJwk);
    const bobDerivedKey = await CryptoEngine.deriveSharedKey(bobKeys.privateKey, aliceKeys.publicKeyJwk);

    // 4. Encrypt sample payload on Alice's side
    const secretMessage = 'Confidential Peer-to-Peer Zero-Knowledge Payload';
    const plaintextBytes = new TextEncoder().encode(secretMessage);

    const ciphertextWithIV = await CryptoEngine.encryptPayload(plaintextBytes, aliceDerivedKey);
    expect(ciphertextWithIV.length).toBeGreaterThan(plaintextBytes.length + 12);

    // 5. Decrypt on Bob's side
    const decryptedBuffer = await CryptoEngine.decryptPayload(ciphertextWithIV, bobDerivedKey);
    const decryptedMessage = new TextDecoder().decode(decryptedBuffer);

    expect(decryptedMessage).toBe(secretMessage);
  });

  it('derives identical AES-GCM keys from matching passphrases with PBKDF2', async () => {
    const password = 'ultra-secure-transfer-key-12345';
    const salt = 'shree-session-99';

    const key1 = await CryptoEngine.deriveKeyFromPassword(password, salt);
    const key2 = await CryptoEngine.deriveKeyFromPassword(password, salt);

    const message = 'Password protected content';
    const encrypted = await CryptoEngine.encryptPayload(new TextEncoder().encode(message), key1);
    const decrypted = await CryptoEngine.decryptPayload(encrypted, key2);

    expect(new TextDecoder().decode(decrypted)).toBe(message);
  });

  it('generates a cryptographic transfer receipt with signature', async () => {
    const receipt = await CryptoEngine.generateReceipt({
      transferId: 'tr-987654',
      fileName: 'large_dataset.bin',
      fileSize: 10485760,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      senderPeerId: 'peer-alice',
      receiverPeerId: 'peer-bob',
      timestamp: Date.now(),
      durationMs: 1540,
      averageSpeedBytesPerSec: 6808935,
      encryptionMode: 'ECDH_AES_GCM_256'
    });

    expect(receipt.receiptId).toMatch(/^RCPT-/);
    expect(receipt.signature).toBeDefined();
    expect(receipt.signature!.length).toBeGreaterThan(16);
    expect(receipt.fileName).toBe('large_dataset.bin');
  });
});
