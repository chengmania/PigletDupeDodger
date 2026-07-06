import { join } from 'node:path';

const PUBLIC_DIR = join(import.meta.dir, '..', '..', 'public');

export async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  if (pathname.includes('..')) return new Response('Not found', { status: 404 });

  const filePath = join(PUBLIC_DIR, pathname);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  return new Response('Not found', { status: 404 });
}
