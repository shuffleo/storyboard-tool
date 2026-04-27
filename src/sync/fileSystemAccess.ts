import { nanoid } from 'nanoid';

export interface ProjectFolderHandle {
  directoryHandle: FileSystemDirectoryHandle;
  projectFilePath: string;
}

export interface FSACapabilities {
  supported: boolean;
  persistentPermissions: boolean;
}

export function detectFSACapabilities(): FSACapabilities {
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  return {
    supported,
    persistentPermissions: supported,
  };
}

export async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const status = await (handle as any).queryPermission({ mode: 'readwrite' });
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const status = await (handle as any).requestPermission({ mode: 'readwrite' });
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function openProjectFolder(): Promise<ProjectFolderHandle> {
  const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });

  try {
    await directoryHandle.getFileHandle('project.md');
  } catch {
    throw new Error('Selected folder does not contain a project.md file. Please select a valid storyboard project folder.');
  }

  return { directoryHandle, projectFilePath: 'project.md' };
}

export async function createProjectFolder(title: string): Promise<ProjectFolderHandle> {
  const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });

  const projectMd = [
    '---',
    `id: ${nanoid()}`,
    'fps: 24',
    'aspect_ratio: "16:9"',
    `created_at: ${new Date().toISOString()}`,
    `updated_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Style Notes',
    '',
    '',
    '',
    '## Reference Links',
    '',
    '',
    '',
    '## Global Notes',
    '',
    '',
    '',
  ].join('\n');

  const projectFile = await directoryHandle.getFileHandle('project.md', { create: true });
  const writable = await projectFile.createWritable();
  await writable.write(projectMd);
  await writable.close();

  await directoryHandle.getDirectoryHandle('assets', { create: true });

  return { directoryHandle, projectFilePath: 'project.md' };
}

export async function readProjectFiles(handle: ProjectFolderHandle): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for await (const entry of (handle.directoryHandle as any).values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const file = await entry.getFile();
      const text = await file.text();
      files.set(entry.name, text);
    }
  }

  return files;
}

export async function writeProjectFile(
  handle: ProjectFolderHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await handle.directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function deleteProjectFile(
  handle: ProjectFolderHandle,
  filename: string
): Promise<void> {
  try {
    await (handle.directoryHandle as any).removeEntry(filename);
  } catch {
    // File may not exist, ignore
  }
}

export async function readAsset(
  handle: ProjectFolderHandle,
  relativePath: string
): Promise<Blob> {
  const parts = relativePath.split('/');
  let current: FileSystemDirectoryHandle = handle.directoryHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName);
  return await fileHandle.getFile();
}

export async function writeAsset(
  handle: ProjectFolderHandle,
  relativePath: string,
  blob: Blob
): Promise<void> {
  const parts = relativePath.split('/');
  let current: FileSystemDirectoryHandle = handle.directoryHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function listSceneFiles(handle: ProjectFolderHandle): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of (handle.directoryHandle as any).values()) {
    if (entry.kind === 'file' && /^scene-\d+\.md$/.test(entry.name)) {
      files.push(entry.name);
    }
  }
  return files.sort();
}
