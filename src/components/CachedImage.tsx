import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { readAsset } from '../sync/fileSystemAccess';
import { db } from '../db/indexeddb';

const memoryCache = new Map<string, string>();

const PASSTHROUGH_RE = /^(data:|blob:|https?:\/\/)/;

export function useAssetUrl(path: string | undefined): { url: string; loading: boolean } {
  const projectSource = useStore((s) => s.projectSource);
  const syncClient = useStore((s) => s.syncClient);
  const projectHandle = useStore((s) => s.projectHandle);

  const [url, setUrl] = useState<string>(() => {
    if (!path) return '';
    if (PASSTHROUGH_RE.test(path)) return path;
    return memoryCache.get(path) ?? '';
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!path || PASSTHROUGH_RE.test(path) || memoryCache.has(path ?? '')) return false;
    return true;
  });
  const createdUrls = useRef<string[]>([]);

  useEffect(() => {
    if (!path) {
      setUrl('');
      setLoading(false);
      return;
    }
    if (PASSTHROUGH_RE.test(path)) {
      setUrl(path);
      setLoading(false);
      return;
    }
    if (memoryCache.has(path)) {
      setUrl(memoryCache.get(path)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1) Try companion server
      if (projectSource === 'companion' && syncClient) {
        try {
          const companionUrl = `${syncClient.assetBaseUrl}/${path}`;
          const res = await fetch(companionUrl);
          if (res.ok) {
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            createdUrls.current.push(objUrl);
            memoryCache.set(path, objUrl);
            if (!cancelled) { setUrl(objUrl); setLoading(false); }
            db.cacheImage(path, blob).catch(() => {});
            return;
          }
        } catch { /* fall through */ }
      }

      // 2) Try FSA
      if (projectHandle) {
        try {
          const blob = await readAsset(projectHandle, path);
          const objUrl = URL.createObjectURL(blob);
          createdUrls.current.push(objUrl);
          memoryCache.set(path, objUrl);
          if (!cancelled) { setUrl(objUrl); setLoading(false); }
          db.cacheImage(path, blob).catch(() => {});
          return;
        } catch { /* fall through */ }
      }

      // 3) IDB cache fallback
      try {
        const cachedBlob = await db.getCachedImage(path);
        if (cachedBlob) {
          const objUrl = URL.createObjectURL(cachedBlob);
          createdUrls.current.push(objUrl);
          memoryCache.set(path, objUrl);
          if (!cancelled) { setUrl(objUrl); setLoading(false); }
          return;
        }
      } catch { /* fall through */ }

      if (!cancelled) { setUrl(''); setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [path, projectSource, syncClient, projectHandle]);

  return { url, loading };
}

export function clearAssetCache(): void {
  for (const blobUrl of memoryCache.values()) {
    if (blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  memoryCache.clear();
}

interface CachedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | undefined;
}

export const CachedImage = React.memo(function CachedImage({ src, alt, className, style, ...rest }: CachedImageProps) {
  const { url, loading } = useAssetUrl(src);

  if (loading) {
    return (
      <div
        className={className}
        style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgb(30 41 59)' }}
      >
        <div style={{
          width: '16px', height: '16px',
          border: '2px solid rgba(148,163,184,0.3)',
          borderTopColor: '#94a3b8',
          borderRadius: '50%',
          animation: 'asset-spin 0.6s linear infinite',
        }} />
        <style>{`@keyframes asset-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!url) return null;

  return <img src={url} alt={alt} className={className} style={style} {...rest} />;
});
