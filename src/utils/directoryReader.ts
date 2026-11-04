/**
 * Directory traversal utility for folder uploads in browsers.
 * Extracts nested files preserving relative paths across drag-and-drop and folder picker.
 */

export interface ScannedFile {
  file: File;
  relativePath: string;
}

export async function scanDataTransferItems(items: DataTransferItemList): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];

  const traverseEntry = async (entry: any, path: string = ''): Promise<void> => {
    if (!entry) return;

    if (entry.isFile) {
      try {
        const file: File = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });
        const relativePath = path ? `${path}/${file.name}` : file.name;
        files.push({ file, relativePath });
      } catch (error) {
        // Skip entries that cannot be read rather than failing the batch.
        console.warn(`[directoryReader] Skipping unreadable file in ${path || '/'}`, error);
      }
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const newPath = path ? `${path}/${entry.name}` : entry.name;

      const readEntries = async (): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
      };

      let entries: any[] = [];
      let batch: any[] = [];
      do {
        batch = await readEntries();
        entries = entries.concat(batch);
      } while (batch.length > 0);

      for (const childEntry of entries) {
        await traverseEntry(childEntry, newPath);
      }
    }
  };

  const entryPromises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entryPromises.push(traverseEntry(entry));
      }
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        files.push({ file, relativePath: file.name });
      }
    }
  }

  const results = await Promise.allSettled(entryPromises);
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[directoryReader] ${failed} item(s) could not be read and were skipped`);
  }
  return files;
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
