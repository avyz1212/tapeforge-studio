// TapeForge Site Packager — turns a static site folder into a TapeOut
// DeWEB-ready bundle, in exactly the shape the tape:// specification
// (SPEC.md in the TapeKit repo) expects on chain:
//   - every file listed with its byte size and SHA-256 (the values a
//     circuit container records on chain and kernels verify against),
//   - a purity scan (kernel's own scanSite): a site that references
//     anything off-chain cannot claim the "100% on-chain" property.
// Publishing itself (uploading bytes into a container, binding a name)
// is a paid on-chain action the SITE OWNER performs with their own
// wallet through the official tools — TapeForge prepares and verifies
// the bundle; it never touches keys or funds.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { scanSite, safeContentType } from '../vendor/tapekit-kernel/src/index.js';

const sha256hex = (bytes) => '0x' + createHash('sha256').update(bytes).digest('hex');

const CONTENT_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.md': 'text/markdown', '.wasm': 'application/wasm',
};

function contentTypeOf(path) {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : '';
  return safeContentType(CONTENT_TYPES[ext] || 'application/octet-stream');
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join('/'));
  }
  return out.sort();
}

/** Build the bundle manifest for a site folder. */
export async function packageSite(dir) {
  const paths = await walk(dir);
  const files = new Map();
  const manifestFiles = [];
  let totalBytes = 0;
  for (const p of paths) {
    const bytes = new Uint8Array(await readFile(join(dir, p)));
    const ct = contentTypeOf(p);
    files.set(p, { bytes, contentType: ct });
    totalBytes += bytes.length;
    manifestFiles.push({ path: p, bytes: bytes.length, sha256: sha256hex(bytes), contentType: ct });
  }
  const purity = scanSite(files);
  return {
    format: 'tapeforge-site-bundle/1',
    spec: 'tape:// On-Chain Website Specification v0.2 (TapeKit SPEC.md)',
    fallback: paths.includes('index.html') ? 'index.html' : null,
    fileCount: paths.length,
    totalBytes,
    files: manifestFiles,
    pure: purity.pure,
    externalRefs: purity.external,
  };
}
