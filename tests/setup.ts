// Test setup file for Vitest
// Import fake-indexeddb FIRST before any other imports that use IndexedDB
import 'fake-indexeddb/auto';

import { beforeAll } from 'vitest';

// Mock window/DOM APIs for tests
beforeAll(() => {
  // Mock window object
  (global as any).window = {
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    },
    document: {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 1920,
            height: 1080,
            getContext: () => ({
              fillStyle: '',
              fillRect: () => {},
              drawImage: () => {},
              font: '',
              textAlign: '',
              fillText: () => {},
            }),
            captureStream: () => ({
              getTracks: () => [],
            }),
          };
        }
        if (tag === 'a') {
          return {
            href: '',
            download: '',
            click: () => {},
          };
        }
        return {};
      },
    },
    MediaRecorder: class {
      constructor() {}
      start() {}
      stop() {}
      ondataavailable = null;
      onstop = null;
    },
    Blob: class Blob {
      constructor(public parts: any[], public options?: any) {}
      async arrayBuffer() {
        // If parts contain ArrayBuffer, return it
        if (this.parts.length > 0 && this.parts[0] instanceof ArrayBuffer) {
          return this.parts[0];
        }
        if (this.parts.length > 0 && this.parts[0] instanceof Uint8Array) {
          return this.parts[0].buffer;
        }
        // Otherwise create empty buffer
        return new ArrayBuffer(0);
      }
      stream() {
        return new ReadableStream();
      }
      get size() {
        if (this.parts.length > 0 && this.parts[0] instanceof ArrayBuffer) {
          return this.parts[0].byteLength;
        }
        return 0;
      }
      get type() {
        return this.options?.type || '';
      }
    },
    File: class File {
      name: string;
      type: string;
      constructor(parts: any[], name: string, options?: any) {
        this.name = name;
        this.type = options?.type || '';
      }
      async text() {
        if (this.name.endsWith('.json') && Array.isArray(this.parts)) {
          const blob = this.parts[0];
          if (blob instanceof Blob) {
            const ab = await blob.arrayBuffer();
            return new TextDecoder().decode(ab);
          }
        }
        return '';
      }
    },
    FileReader: class FileReader {
      onload: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      result: any = null;
      
      readAsDataURL(blob: Blob) {
        // Mock implementation - resolve with data URL
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,test' } } as any);
          }
        }, 0);
      }
      
      readAsArrayBuffer(blob: Blob) {
        // Mock implementation - resolve with ArrayBuffer synchronously for JSZip
        // JSZip expects this to work, so we need to make it work properly
        (async () => {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            this.result = arrayBuffer;
            if (this.onload) {
              this.onload({ target: { result: arrayBuffer } } as any);
            }
          } catch (e) {
            if (this.onerror) {
              this.onerror({ target: { error: e } } as any);
            }
          }
        })();
      }
    },
    atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
  };
  
  // Make File and Blob available globally
  (global as any).File = (global as any).window.File;
  (global as any).Blob = (global as any).window.Blob;
});
