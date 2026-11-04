/**
 * OPFS files written during a transfer are kept around so the finished blob
 * stays downloadable for the lifetime of the page. They are not automatically
 * deleted by the browser, so stale entries accumulate and eventually consume
 * the origin's storage quota. Prune entries that are no longer plausibly in
 * use whenever the app starts.
 */

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupOrphanedOPFS(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<number> {
  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) return 0;

  let removed = 0;
  try {
    const root = await navigator.storage.getDirectory();
    const entries = (root as any).entries?.();
    if (!entries) return 0;

    for await (const [name, handle] of entries) {
      if (handle?.kind !== 'file') continue;
      try {
        const file: File = await (handle as FileSystemFileHandle).getFile();
        if (Date.now() - file.lastModified > maxAgeMs) {
          await root.removeEntry(name);
          removed++;
        }
      } catch {
        // A single unreadable entry must not abort the sweep.
      }
    }
  } catch {
    // OPFS is unavailable (private mode, unsupported browser): nothing to do.
  }
  return removed;
}
