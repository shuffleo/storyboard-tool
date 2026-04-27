import type { ProjectFolderHandle } from './fileSystemAccess';
import { readAsset } from './fileSystemAccess';

export type AssetSource = 'companion' | 'fsa' | 'none';

export class AssetResolver {
  private companionBaseUrl: string | null = null;
  private projectHandle: ProjectFolderHandle | null = null;
  private blobUrls: Set<string> = new Set();

  setCompanionUrl(url: string | null): void {
    this.companionBaseUrl = url;
  }

  setProjectHandle(handle: ProjectFolderHandle | null): void {
    this.projectHandle = handle;
  }

  getSource(): AssetSource {
    if (this.companionBaseUrl) return 'companion';
    if (this.projectHandle) return 'fsa';
    return 'none';
  }

  async resolveUrl(relativePath: string): Promise<string> {
    if (this.companionBaseUrl) {
      return `${this.companionBaseUrl}/${relativePath}`;
    }

    if (this.projectHandle) {
      try {
        const blob = await readAsset(this.projectHandle, relativePath);
        const url = URL.createObjectURL(blob);
        this.blobUrls.add(url);
        return url;
      } catch {
        return '';
      }
    }

    return '';
  }

  revokeUrl(url: string): void {
    if (this.blobUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.blobUrls.delete(url);
    }
  }

  revokeAll(): void {
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  }
}

export const assetResolver = new AssetResolver();
