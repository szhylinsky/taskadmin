/**
 * Dev-only static file server. The app itself is 100% client-side; this exists
 * because ES modules cannot be loaded from file:// URLs.
 * Not used in production — any static host will do.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

// Only the files the app actually needs are served; everything else is 404.
const PUBLIC_FILES = new Set(['/index.html', '/styles.css']);
const PUBLIC_DIRECTORIES = ['/js/'];

function isPublic(pathname) {
  return (
    PUBLIC_FILES.has(pathname) ||
    PUBLIC_DIRECTORIES.some((prefix) => pathname.startsWith(prefix))
  );
}

function sendText(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  if (!isPublic(pathname)) {
    sendText(response, 404, 'Not Found');
    return;
  }

  const filePath = resolve(ROOT, `.${pathname}`);

  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let stats;
  try {
    stats = await stat(filePath);
  } catch {
    sendText(response, 404, 'Not Found');
    return;
  }

  if (!stats.isFile()) {
    sendText(response, 404, 'Not Found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'content-length': stats.size,
    'cache-control': 'no-store',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`TaskAdmin running at http://${HOST}:${PORT}`);
});
