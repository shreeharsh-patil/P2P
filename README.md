# SHREE — Private. Direct. Simple.

> Production-Grade Peer-to-Peer File & Text Transfer Platform

![License](https://img.shields.io/badge/License-MIT-emerald.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-DataChannel-indigo.svg)
![Build](https://img.shields.io/badge/Build-Passing-brightgreen.svg)

**Shree** is a high-performance, privacy-first peer-to-peer platform designed to transfer files (including **10GB+ large files**) and instant text snippets directly between web browsers.

---

## ⚡ Core Principles

1. **SERVER DOES NOT HANDLE PAYLOADS**:
   The signaling backend only facilitates session handshake & SDP/ICE candidate exchange. Zero file chunks or text content pass through or touch the server.
2. **10GB+ ARCHITECTURE**:
   Employs `File.slice()` progressive reading, WebRTC DataChannel backpressure control, and native disk streaming (`FileSystemWritableFileStream` / OPFS) to ensure memory usage remains strictly bounded (typically <5MB RAM) regardless of file size.
3. **AUTOMATIC INTEGRITY VERIFICATION**:
   Computes and verifies SHA-256 cryptographic hashes on-the-fly using the Web Crypto API.
4. **RESUME & RECONNECT**:
   Tracks received chunk bitsets in IndexedDB to automatically resume interrupted transfers without re-sending completed chunks.

---

## 🏗️ System Architecture

```
                                  ┌───────────────────────────┐
                                  │  SHREE SIGNALING BACKEND  │
                                  │   (Node.js / WebSockets)  │
                                  └─────────────┬─────────────┘
                                                │
                                    Handshake & ICE Exchange
                                                │
                                                ▼
  ┌────────────────────────┐                                     ┌────────────────────────┐
  │      DEVICE A          │  ◄═══════════════════════════════►  │      DEVICE B          │
  │  (Sender Browser)      │        WebRTC DataChannels          │  (Receiver Browser)    │
  └───────────┬────────────┘     (Control, Text, File)           └───────────┬────────────┘
              │                                                              │
     [Backpressure Ctrl]                                            [Progressive Writer]
              │                                                              │
    [File.slice() 256KB]                                            [Direct FS / OPFS]
              │                                                              │
     [36-Byte Binary Framing] ═════════════════════════════════════► [SHA-256 Verify]
```

---

## 📦 Binary Data Channel Framing Protocol

File chunks sent over `RTCDataChannel` use a zero-overhead **36-byte framed binary header**:

| Byte Offset | Field Name | Data Type | Description |
|---|---|---|---|
| `0 .. 3` | Magic | ASCII (`SHRE`) | Protocol identifier (`0x53 0x48 0x52 0x45`) |
| `4 .. 19` | Transfer ID | 16-byte String | Unique ID of the transfer item |
| `20 .. 23` | Chunk Index | `Uint32` (Big-Endian) | Sequential chunk index (supports up to 4B chunks) |
| `24 .. 31` | Byte Offset | `BigUint64` (Big-Endian) | 64-bit file byte position (supports >50GB files) |
| `32 .. 35` | Payload Length | `Uint32` (Big-Endian) | Size of binary chunk payload in bytes |
| `36 .. N` | Payload | `Uint8Array` | Raw binary slice data |

---

## 🛠️ Engine Architecture

The core transfer engine in `src/engine/` is completely decoupled from the UI:

- **`BackpressureController`**: Monitors `dataChannel.bufferedAmount` against low/high watermarks to pause slice reading when the send buffer fills up.
- **`ChunkReader`**: Asynchronously reads 256KB slices using `File.slice()` and safe `BigInt` offset arithmetic.
- **`StorageAdapter`**:
  - *Strategy 1*: Direct Disk Streaming via File System Access API (`showSaveFilePicker`).
  - *Strategy 2*: Origin Private File System (`OPFS`).
  - *Strategy 3*: IndexedDB progressive chunk assembly fallback.
- **`IntegrityManager`**: Incremental Web Crypto SHA-256 hashing.
- **`ResumeManager`**: Maintains received chunk bitsets and syncs missing ranges on reconnect.

---

## 🚀 Running Locally

### 1. Prerequisites
- Node.js `v18+` or `v24+`
- npm `v9+`

### 2. Install & Start Development Servers

```bash
# Clone repository
cd D:/P2P

# Install dependencies
npm install

# Run unit tests
npm run test

# Start Signaling Server (Port 4000)
npm run server

# In another terminal, start Vite Dev Server (Port 3000)
npm run dev
```

Visit `http://localhost:3000` in two browser tabs or devices.

---

## 🐳 Docker Deployment

```bash
# Build and run containerized stack using docker-compose
docker-compose up --build -d
```

The application will be accessible on `http://localhost:4000`.

---

## 🧪 Testing & Verification

Run the engine unit test suite:
```bash
npm run test
```

Tests cover:
- Binary header encoding/decoding and BigInt offset preservation (`transferProtocol.test.ts`).
- Progressive `File.slice()` chunking (`chunkReader.test.ts`).

---

## 📄 License
MIT © Shree Platform
