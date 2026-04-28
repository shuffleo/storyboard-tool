import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import mime from 'mime-types';

export interface AssetServerOptions {
  port: number;
  projectPath: string;
}

export function startAssetServer(options: AssetServerOptions) {
  const { port, projectPath } = options;
  const assetsDir = resolve(projectPath);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const urlPath = decodeURIComponent(req.url || '/').replace(/^\/+/, '');
    if (!urlPath) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const filePath = resolve(join(assetsDir, urlPath));
    const rel = relative(assetsDir, filePath);
    if (rel.startsWith('..') || rel.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      createReadStream(filePath).pipe(res);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Asset server: http://127.0.0.1:${port}`);
  });

  return {
    close: () => {
      server.close();
    },
  };
}
