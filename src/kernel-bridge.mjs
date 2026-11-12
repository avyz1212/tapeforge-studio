// TapeForge Live Chain Lens — reads REAL TapeOut on-chain data through the
// official open-source TapeKit kernel (@tapekit/kernel, MIT, vendored in
// ../vendor/tapekit-kernel). Read-only eth_call against public nodes.
// No accounts, no keys, no transactions — the kernel requires agreement of
// independent node operators and verifies every file byte against the
// SHA-256 recorded on chain; we additionally re-hash with node:crypto.

import { createHash } from 'node:crypto';
import {
  createKernel, createChainKernel, formatName,
  BSC_MAINNET, XLAYER_MAINNET, BASE_MAINNET,
} from '../vendor/tapekit-kernel/src/index.js';

const sha256hex = (bytes) => '0x' + createHash('sha256').update(bytes).digest('hex');
const ZERO = '0x0000000000000000000000000000000000000000';

export const NETS = { bnb: BSC_MAINNET, xlayer: XLAYER_MAINNET, base: BASE_MAINNET };

/** Enumerate a chain's TapeOut processors straight from the factory contract. */
export async function scanProcessors(netKey, { max = 40 } = {}) {
  const net = NETS[netKey];
  const k = createChainKernel({ network: { ...net }, locale: 'en' });
  const processors = [];
  for (let i = 0; i < max; i++) {
    let addr;
    try { addr = await k.cpuAt(i); } catch { break; }
    if (!addr || addr.toLowerCase() === ZERO) break;
    processors.push({ index: i, address: addr });
  }
  return { chain: net.name, chainId: net.chainId, factory: net.factory, processors };
}

/**
 * Resolve one tape:// site and fetch + verify its files.
 * Returns a plain evidence object (never throws on chain-side states).
 */
export async function inspectSite(name, { maxFiles = 8, maxBytes = 2_000_000 } = {}) {
  const kernel = createKernel({ locale: 'en' });
  const ev = { name, status: null };
  let r;
  try {
    r = await kernel.resolve(name);
  } catch (e) {
    ev.status = 'error';
    ev.error = `${e.code || 'resolve'}: ${e.message}`;
    return ev;
  }
  ev.status = r.status;
  ev.chain = r.network?.name || null;
  ev.container = r.container || null;
  ev.cpu = r.cpu !== undefined ? String(r.cpu) : null;
  ev.cpuName = r.cpuName || null;
  ev.tokenId = r.tokenId !== undefined ? String(r.tokenId) : null;
  ev.holder = r.holder || null;
  ev.block = r.block !== undefined ? String(BigInt(r.block)) : null;
  if (r.status !== 'ok' && r.status !== 'unpaid') return ev;

  const man = await kernel.manifest(r);
  ev.paths = man.paths;
  ev.fallback = man.fallback;
  ev.files = [];
  let total = 0;
  for (const p of man.paths.slice(0, maxFiles)) {
    const f = await kernel.getFile(r, man, p);
    if (!f) { ev.files.push({ path: p, status: 'missing' }); continue; }
    total += f.bytes.length;
    if (total > maxBytes) { ev.files.push({ path: p, status: 'skipped-size' }); continue; }
    ev.files.push({
      path: f.path,
      bytes: f.bytes.length,
      kernelVerified: f.verified === true,
      declaredSha256: f.declaredSha,
      independentSha256: sha256hex(f.bytes),
      independentMatch: sha256hex(f.bytes) === f.declaredSha,
    });
  }
  ev.allVerified = ev.files.length > 0
    && ev.files.every((f) => f.kernelVerified && f.independentMatch);
  return ev;
}

/** Human name for a (tokenId, cpu, area) triple, via the kernel's formatter. */
export function siteName(tokenId, cpu, area) {
  return formatName(BigInt(tokenId), BigInt(cpu), 'tape', area ?? null);
}
