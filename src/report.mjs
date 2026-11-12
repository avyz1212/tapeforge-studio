// Renders evidence.json into a single self-contained report.html
// (no external references — the page itself passes the DeWEB purity scan).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function renderReport(ev) {
  const labRows = (ev.lab || []).map((r) => `
    <tr><td>${esc(r.name)}</td><td>${r.nand}</td><td>${r.latch}</td>
    <td>${esc(r.check.kind)}</td><td>${r.check.rows}</td>
    <td>${r.check.ok ? '✅ PASS' : '❌ FAIL'}</td></tr>`).join('');
  const procRows = Object.values(ev.lens?.processors || {}).map((p) => `
    <tr><td>${esc(p.chain || '')}</td><td>${esc(p.chainId ?? '')}</td>
    <td>${esc(p.factory || p.error || '')}</td><td>${p.processors ? p.processors.length : '—'}</td></tr>`).join('');
  const siteRows = (ev.lens?.sites || []).map((s) => `
    <tr><td>${esc(s.name)}</td><td>${esc(s.status)}</td><td>${esc(s.cpuName || '')}</td>
    <td>${esc(s.container || '')}</td>
    <td>${(s.files || []).map((f) => `${esc(f.path)} (${f.bytes}B, sha256 ${f.independentMatch ? 'match ✓' : '—'})`).join('<br>')}</td></tr>`).join('');
  const packFiles = (ev.pack?.files || []).map((f) => `
    <tr><td>${esc(f.path)}</td><td>${f.bytes}</td><td class="mono">${esc(f.sha256)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>TapeForge Studio — evidence report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 960px; padding: 0 1rem; color: #14213d; }
  h1 { font-size: 1.6rem; } h2 { margin-top: 2rem; font-size: 1.15rem; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; font-size: .9rem; }
  th, td { border: 1px solid #ccd; padding: .35rem .5rem; text-align: left; vertical-align: top; }
  th { background: #eef2ff; } .mono { font-family: ui-monospace, monospace; font-size: .75rem; word-break: break-all; }
  .tag { background:#14213d; color:#fff; border-radius:.4rem; padding:.1rem .5rem; font-size:.8rem; }
</style></head><body>
<h1>🔩 TapeForge Studio <span class="tag">evidence report</span></h1>
<p>Generated ${esc(ev.generatedAt)} by TapeForge v${esc(ev.version)}. All on-chain reads are
read-only, performed with the official open-source TapeKit kernel, and every file
byte is checked against the SHA-256 recorded on chain (and re-hashed independently).</p>

<h2>Circuit Lab — NAND/LATCH netlists, exhaustively verified</h2>
<table><tr><th>Circuit</th><th>NAND</th><th>LATCH</th><th>Check</th><th>Rows</th><th>Result</th></tr>${labRows}</table>

<h2>Live Chain Lens — TapeOut processors (factory scan)</h2>
<table><tr><th>Chain</th><th>Chain ID</th><th>Factory</th><th>Processors</th></tr>${procRows}</table>

<h2>Live Chain Lens — on-chain sites resolved &amp; verified</h2>
<table><tr><th>Name</th><th>Status</th><th>Processor</th><th>Container</th><th>Files</th></tr>${siteRows}</table>

<h2>Site Packager — this studio's own DeWEB bundle</h2>
<p>${ev.pack ? `${ev.pack.fileCount} files, ${ev.pack.totalBytes} bytes, 100% on-chain purity: <strong>${ev.pack.pure ? 'YES' : 'NO'}</strong>` : 'not run'}</p>
<table><tr><th>Path</th><th>Bytes</th><th>SHA-256 (as recorded on chain at publish)</th></tr>${packFiles}</table>

<p><em>TapeForge never signs, sends, or pays. Publishing a bundle or taping out a
circuit is done by the owner with their own wallet through the official TapeOut tools.</em></p>
</body></html>`;
}
