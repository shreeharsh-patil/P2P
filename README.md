<div align="center">

# ⚡ SHREE — Private. Direct. Simple.

### Production-Grade Peer-to-Peer File & Text Transfer Platform, Zero-Server Memory Bounded WebRTC Engine

**Shree** is an enterprise-grade, high-performance, privacy-first peer-to-peer data streaming platform designed to transfer files (including **10GB+ large files**) and instant text snippets directly between web browsers. By leveraging WebRTC DataChannels, `File.slice()` progressive chunk reading, Web Crypto SHA-256 integrity verification, and zero-server payload routing, Shree guarantees high-throughput browser transfers while keeping RAM usage strictly bounded under 5MB.

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/WebRTC-DataChannel-indigo.svg?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC DataChannels" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/IndexedDB_/_OPFS-4169E1?style=for-the-badge" alt="OPFS & IndexedDB" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready" />
</p>

<p align="center">
  <a href="https://github.com/shreeharsh-patil/P2P/stargazers"><img alt="Stars" src="https://badgen.net/github/stars/shreeharsh-patil/P2P?color=00B894&icon=github"></a>
  <a href="https://github.com/shreeharsh-patil/P2P/issues"><img alt="Issues" src="https://badgen.net/github/issues/shreeharsh-patil/P2P?color=00B894&icon=github"></a>
  <a href="LICENSE"><img alt="License" src="https://badgen.net/badge/license/MIT/00B894"></a>
</p>

</div>

---

## ⚡ Core Principles & Zero-Server Philosophy

1. **SERVER DOES NOT HANDLE PAYLOADS**:
   The signaling backend only facilitates session handshake & SDP/ICE candidate exchange. Zero file chunks or text content pass through or touch the server.
2. **10GB+ ARCHITECTURE**:
   Employs `File.slice()` progressive reading, WebRTC DataChannel backpressure control, and native disk streaming (`FileSystemWritableFileStream` / OPFS) to ensure memory usage remains strictly bounded (typically <5MB RAM) regardless of file size.
3. **AUTOMATIC INTEGRITY VERIFICATION**:
   Computes and verifies SHA-256 cryptographic hashes on-the-fly using the Web Crypto API.
4. **RESUME & RECONNECT**:
   Tracks received chunk bitsets in IndexedDB to automatically resume interrupted transfers without re-sending completed chunks.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph "Signaling & Handshake Gateway"
        A["SHREE SIGNALING BACKEND<br><i>(Node.js / WebSockets / Port 4000)</i>"]
    end

    subgraph "Sender Architecture - Device A"
        B1["Source File Access"]
        B2["ChunkReader<br><i>(File.slice() 256KB Slices)</i>"]
        B3["BackpressureController<br><i>(Monitors bufferedAmount)</i>"]
        B4["36-Byte Binary Framing Protocol"]
    end

    subgraph "Receiver Architecture - Device B"
        C1["Binary Frame Parser"]
        C2["IntegrityManager<br><i>(Web Crypto SHA-256 Hash)</i>"]
        C3["StorageAdapter<br><i>(OPFS / Direct FS / IndexedDB)</i>"]
        C4["ResumeManager<br><i>(Chunk Bitsets & Reconnect Sync)</i>"]
    end

    A <-->|Handshake & ICE Exchange| B1
    A <-->|Handshake & ICE Exchange| C1

    B1 --> B2
    B2 --> B3
    B3 --> B4

    rect rgb(20, 30, 20)
        note over B4,C1: Direct P2P WebRTC DataChannel Stream
        B4 == Encrypted RTCDataChannel Stream ==> C1
    end

    C1 --> C2
    C2 --> C3
    C3 <--> C4

    style A fill:#000000,stroke:#fff,stroke-width:2px,color:#fff
    style B1 fill:#007ACC,stroke:#005999,stroke-width:2px,color:#fff
    style B2 fill:#339933,stroke:#236623,stroke-width:2px,color:#fff
    style B3 fill:#e74c3c,stroke:#c0392b,stroke-width:2px,color:#fff
    style B4 fill:#f1c40f,stroke:#f39c12,stroke-width:2px,color:#333
    style C1 fill:#34B7F1,stroke:#209CEE,stroke-width:2px,color:#fff
    style C2 fill:#9b59b6,stroke:#8e44ad,stroke-width:2px,color:#fff
    style C3 fill:#4169E1,stroke:#27438e,stroke-width:2px,color:#fff
    style C4 fill:#22314E,stroke:#121a2b,stroke-width:2px,color:#fff
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

## 🛠️ Decoupled Engine Architecture

The core transfer engine in `src/engine/` is completely decoupled from the presentation interface:

- **`BackpressureController`**: Monitors `dataChannel.bufferedAmount` against low/high watermarks to pause slice reading when the send buffer fills up.
- **`ChunkReader`**: Asynchronously reads 256KB slices using `File.slice()` and safe `BigInt` offset arithmetic.
- **`StorageAdapter`**:
  - *Strategy 1*: Direct Disk Streaming via File System Access API (`showSaveFilePicker`).
  - *Strategy 2*: Origin Private File System (`OPFS`).
  - *Strategy 3*: IndexedDB progressive chunk assembly fallback.
- **`IntegrityManager`**: Incremental Web Crypto SHA-256 hashing.
- **`ResumeManager`**: Maintains received chunk bitsets and syncs missing ranges on reconnect.

---

## 🎨 Interface Showcase

## 🚀 Deployment & Local Initialization

### Prerequisites

- **Runtime Sandbox**: Node.js `v18+` or `v24+`
- **Package Manager**: npm `v9+`

### Step-by-Step Local Setup

#### 1. Repository Instantiation & Installation

```bash
# Clone the repository
git clone https://github.com/shreeharsh-patil/P2P.git
cd P2P

# Install project dependencies
npm install
```

#### 2. Run Engine Unit Test Suite

```bash
npm run test
```

#### 3. Launch Development Servers

```bash
# Terminal 1: Start Signaling Server (Port 4000)
npm run server

# Terminal 2: Start Vite Dev Client (Port 3000)
npm run dev
```

Access interface via: `http://localhost:3000` (Open in two separate tabs or devices to test WebRTC DataChannel connection)

---

## 🐳 Containerized Deployment (Docker)

Launch the complete P2P signaling stack using Docker Compose:

```bash
# Build and run containerized service stack
docker-compose up --build -d
```

Application accessible live at: `http://localhost:4000`

---

## 🧪 Testing & Engine Verification

Run the engine unit test suite to verify binary parsing and file slicing rules:

```bash
npm run test
```

**Unit Test Scope:**

- Binary header encoding/decoding and BigInt offset preservation (`transferProtocol.test.ts`).
- Progressive `File.slice()` chunking and backpressure control (`chunkReader.test.ts`).

---

## 📁 Repository Directory Architecture

```
P2P/
├─ src/                             (Core WebRTC Application & Engine Architecture)
│  ├─ engine/                       (Decoupled P2P Engine Components)
│  │  ├─ BackpressureController.ts  (WebRTC buffer threshold watcher)
│  │  ├─ ChunkReader.ts             (256KB File.slice() streaming reader)
│  │  ├─ IntegrityManager.ts        (Web Crypto SHA-256 calculation manager)
│  │  ├─ ResumeManager.ts           (IndexedDB bitset tracker for interrupted transfers)
│  │  ├─ StorageAdapter.ts          (Direct FS Access, OPFS, and IndexedDB adapter)
│  │  └─ transferProtocol.ts        (36-byte binary header encoder and parser)
│  ├─ components/                   (UI elements: file dropzones, text editors, progress bars)
│  ├─ hooks/                        (WebRTC connection state hooks and signals)
│  └─ main.ts                       (Frontend application entrypoint)
├─ server/                          (Signaling Backend Core)
│  └─ index.js                      (Node.js WebSocket signaling server for SDP/ICE exchange)
├─ tests/                           (Unit tests for binary framing protocols and slice readers)
├─ docker-compose.yml               (Containerized deployment configuration)
├─ package.json                     (Dependencies, scripts, and build manifest)
└─ README.md                        (Unified platform documentation)
```

---

## ⚖️ Legal Guidelines & License

> [!WARNING]
> This platform is distributed under the terms of the MIT License. It is an independent engineering project built for peer-to-peer streaming research, browser data channel evaluations, and software portfolio benchmarks. Users assume absolute responsibility regarding data transfer compliance, local encryption key handling, and network utilization policies.

---

## 👤 Project Author

Developed and Maintained by **Shreeharsh Patil**.

Feel free to contact me or submit issues via:

- **Email**: [shreeharsh.dev@gmail.com](mailto:shreeharsh.dev@gmail.com)
- **GitHub Profile**: [github.com/shreeharsh-patil](https://github.com/shreeharsh-patil)
