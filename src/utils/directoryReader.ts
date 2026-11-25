/**
 * Directory traversal utility for folder uploads in browsers.
 * Extracts nested files preserving relative paths across drag-and-drop and folder picker.
 */

export interface ScannedFile {
  file: File;
  relativePath: string;
}

export async function scanDataTransferItems(items: DataTransferItemList): Promise<{
  files: ScannedFile[];
  unreadablePaths: string[];
}> {
  const files: ScannedFile[] = [];
  const unreadablePaths: string[] = [];

  const traverseEntry = async (entry: FileSystemEntry, parent: string = ''): Promise<void> => {
    const path = parent ? `${parent}/${entry.name}` : entry.name;

    try {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.push({ file, relativePath: path });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        while (true) {
          const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          });
          if (batch.length === 0) break;

          for (const child of batch) await traverseEntry(child, path);
        }
      }
    } catch {
      unreadablePaths.push(path);
    }
  };

  const entryPromises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;

    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entryPromises.push(traverseEntry(entry));
    } else {
      const file = item.getAsFile();
      if (file) {
        files.push({ file, relativePath: file.name });
      }
    }
  }

  await Promise.all(entryPromises);
  return { files, unreadablePaths };
}

export function extractFromFolderInput(fileList: FileList): ScannedFile[] {
  const result: ScannedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // In webkitdirectory, file.webkitRelativePath contains the full relative path
    const relativePath = (file as any).webkitRelativePath || file.name;
    result.push({ file, relativePath });
  }
  return result;
}
