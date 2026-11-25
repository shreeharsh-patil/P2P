import { describe, expect, it } from 'vitest';
import { scanDataTransferItems } from '../utils/directoryReader';

describe('Dropped folder scanning', () => {
  it('returns readable files when a sibling and a later directory batch are unreadable', async () => {
    const kept = new File(['ok'], 'kept.txt');
    const fallback = new File(['direct'], 'direct.txt');
    const children = [
      { name: 'missing.txt', isFile: true, file: (_done: unknown, fail: (error: Error) => void) => fail(new Error('Unreadable')) },
      { name: kept.name, isFile: true, file: (done: (file: File) => void) => done(kept) },
    ];
    let reads = 0;
    const directory = {
      name: 'folder',
      isDirectory: true,
      createReader: () => ({
        readEntries: (done: (entries: unknown[]) => void, fail: (error: Error) => void) => {
          if (reads++ === 0) done(children);
          else fail(new Error('Directory changed'));
        }
      })
    };
    const items = [
      { kind: 'file', webkitGetAsEntry: () => directory },
      { kind: 'file', webkitGetAsEntry: () => null, getAsFile: () => fallback },
    ] as unknown as DataTransferItemList;

    const result = await scanDataTransferItems(items);
    expect(result.files.map((item) => item.relativePath).sort()).toEqual(['direct.txt', 'folder/kept.txt']);
    expect(result.unreadablePaths).toEqual(['folder/missing.txt', 'folder']);
  });
});
