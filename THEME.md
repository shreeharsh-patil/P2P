# SHREE: Doomsday Green UI

The new visual theme is a restrained cinematic take on a radioactive-green network interface.

## Color tokens

| Purpose | Hex |
| --- | --- |
| Obsidian background | `#050A07` |
| Deep forest surfaces | `#0B2919` |
| Emerald borders | `#075F36` |
| Active green | `#00E676` |
| Pale mint | `#B7FFCB` |

## Interaction and UX safeguards

- Green is used for primary calls to action, connection state, and transfer progress.
- Rose/red error, destructive and disconnect states are intentionally preserved.
- QR codes remain high contrast on white backgrounds for reliable camera scanning.
- Particle counts are mobile-aware; motion follows `prefers-reduced-motion`.
- No network, signaling, file-transfer, storage, or encryption implementation was changed.

## Review checklist

- Run `npm ci`, `npm test`, `npm run build`.
- Test create/join, QR scanning, code entry, text and large file transfers.
- Verify modal keyboard focus, transfer progress, failures and mobile layout.
- Review PWA favicon and color update with a fresh service-worker cache.
