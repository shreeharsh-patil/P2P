/**
 * Zero-Knowledge Cryptographic Engine for Shree P2P.
 * - Ephemeral ECDH (P-256) Key Exchange for End-to-End Room Encryption (E2EE)
 * - PBKDF2 Key Derivation for Password-Protected Rooms (100k iterations)
 * - AES-GCM 256-bit authenticated payload encryption/decryption
 * - Cryptographic Transfer Receipts with HMAC-SHA256 signatures
 */

export interface E2EEKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}

export interface TransferReceiptData {
  receiptId: string;
  transferId: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  senderPeerId: string;
  receiverPeerId: string;
  timestamp: number;
  durationMs: number;
  averageSpeedBytesPerSec: number;
  encryptionMode: 'ECDH_AES_GCM_256' | 'PASSWORD_PBKDF2_AES_GCM_256' | 'DTLS_STANDARD';
  signature?: string;
}

export class CryptoEngine {
  /**
   * Generates an ephemeral ECDH (P-256) key pair for the session.
   */
  public static async generateECDHKeyPair(): Promise<E2EEKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    return {
      publicKeyJwk,
      privateKey: keyPair.privateKey
    };
  }

  /**
   * Derives a shared AES-GCM 256-bit encryption key from local private key + remote peer public key.
   */
  public static async deriveSharedKey(
    localPrivateKey: CryptoKey,
    remotePublicKeyJwk: JsonWebKey
  ): Promise<CryptoKey> {
    const remotePublicKey = await crypto.subtle.importKey(
      'jwk',
      remotePublicKeyJwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      false,
      []
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: remotePublicKey
      },
      localPrivateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Derives an AES-GCM 256-bit key from a user passphrase using PBKDF2 with 100,000 iterations.
   */
  public static async deriveKeyFromPassword(password: string, saltString: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const salt = enc.encode(saltString.padEnd(16, '0').slice(0, 16));

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts arbitrary binary payload with AES-GCM 256.
   * Returns Uint8Array with 12-byte IV prepended: [12-byte IV][Ciphertext + 16-byte Auth Tag]
   */
  public static async encryptPayload(payload: Uint8Array | ArrayBuffer, key: CryptoKey): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer: BufferSource = payload instanceof Uint8Array ? (payload.buffer as ArrayBuffer) : payload;
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      dataBuffer
    );

    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedBytes.length);
    combined.set(iv, 0);
    combined.set(encryptedBytes, iv.length);
    return combined;
  }

  /**
   * Decrypts AES-GCM encrypted payload ([12-byte IV][Ciphertext + Auth Tag]).
   */
  public static async decryptPayload(encryptedCombined: Uint8Array | ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    const bytes = encryptedCombined instanceof Uint8Array ? encryptedCombined : new Uint8Array(encryptedCombined);
    if (bytes.length < 12) {
      throw new Error('Encrypted payload too short (missing 12-byte IV)');
    }

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      ciphertext.buffer as ArrayBuffer
    );
  }

  /**
   * Generates a verifiable Cryptographic Transfer Receipt signed with SHA-256 HMAC.
   */
  public static async generateReceipt(
    data: Omit<TransferReceiptData, 'receiptId' | 'signature'>,
    secretKey?: CryptoKey
  ): Promise<TransferReceiptData> {
    const receiptId = `RCPT-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now()}`;
    const payloadToSign = `${receiptId}:${data.transferId}:${data.sha256}:${data.fileSize}:${data.timestamp}`;

    let signature = '';
    if (secretKey) {
      const signBuf = await crypto.subtle.sign(
        'HMAC',
        secretKey,
        new TextEncoder().encode(payloadToSign)
      );
      signature = Array.from(new Uint8Array(signBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      // Use standard SHA-256 hash as verification digest if no HMAC key
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadToSign));
      signature = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    return {
      receiptId,
      ...data,
      signature
    };
  }
}
