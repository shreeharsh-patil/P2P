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
      const file: File = await new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });
      const relativePath = path ? `${path}/${file.name}` : file.name;
      files.push({ file, relativePath });
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

  await Promise.all(entryPromises);
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
