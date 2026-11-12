#!/usr/bin/env node
// TapeForge Studio — CLI
//
//   node src/cli.mjs demo           full evidence run (lens + lab + pack)
//   node src/cli.mjs lens <name>    resolve + verify one tape:// site (live)
//   node src/cli.mjs lab            circuit library verification (offline)
//   node src/cli.mjs pack <dir>     package a site folder into a DeWEB bundle
//
// Everything on-chain here is READ-ONLY (eth_call via public nodes through
// the official TapeKit kernel). Nothing is signed, sent, or paid.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSite, scanProcessors } from './kernel-bridge.mjs';
import { verifyTruthTable, step, settle, census, renameNets } from './circuits.mjs';
import { CIRCUITS } from './library.mjs';
import { packageSite } from './packager.mjs';
import { renderReport } from './report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Tape-out consumes one component token per gate. Reference protocol fee:
// 0.0002 BNB per tape-out (BNB Chain, community beginner's guide, 2026-09-25).
// A documented estimate for planning — never a quote; X Layer fee constants differ.
const TAPEOUT_FEE_REF_BNB = 0.0002;

const say = (...a) => console.log(...a);
const section = (t) => say(`\n=== ${t} ===`);

// ---------------------------------------------------------------- LAB
async function runLab(evidence) {
  section('CIRCUIT LAB — NAND/LATCH netlists, exhaustively verified');
  const results = [];
  for (const c of CIRCUITS) {
    const nl = c.netlist;
    const cen = census(nl);
    let check;
    if (c.sequential) {
      // walk the state machine: after each clock step the state must match
      let state = {};
      let ok = true;
      for (let cycle = 1; cycle <= c.sequential.cycles; cycle++) {
        state = step(nl, state, {}).nextState;
        const after = settle(nl, {}, state);
        if (c.sequential.readState(after) !== c.sequential.expect(cycle)) { ok = false; break; }
      }
      check = { ok, rows: c.sequential.cycles, kind: 'sequence' };
    } else {
      const renamed = renameNets(nl, c.renameOutputs || {});
      check = { ...verifyTruthTable(renamed, c.spec), kind: 'truth-table' };
    }
    const est = {
      components: cen,
      tapeoutFeeRefBNB: TAPEOUT_FEE_REF_BNB,
      note: 'components are consumed at tape-out; fee is a documented BNB reference, not a quote',
    };
    results.push({ name: nl.name, blurb: c.blurb, ...cen, check, est });
    say(`${check.ok ? 'PASS' : 'FAIL'}  ${nl.name.padEnd(16)} NAND×${cen.nand} LATCH×${cen.latch}  (${check.kind}, ${check.rows} rows)`);
    if (!check.ok) say('      counterexample:', JSON.stringify(check.counterexample));
    await mkdir(join(ROOT, 'circuits'), { recursive: true });
    await writeFile(join(ROOT, 'circuits', `${nl.name}.json`),
      JSON.stringify(exportNetlist(c), null, 2));
  }
  evidence.lab = results;
  return results.every((r) => r.check.ok);
}

function exportNetlist(c) {
  const nl = c.netlist;
  const cen = census(nl);
  return {
    format: 'tapeforge-netlist/1',
    name: nl.name,
    blurb: c.blurb,
    inputs: nl.inputs,
    outputs: nl.outputs.map((o) => c.renameOutputs?.[o] || o),
    outputNets: Object.fromEntries(nl.outputs.map((o) => [c.renameOutputs?.[o] || o, o])),
    gates: nl.gates,
    census: cen,
  };
}

// ---------------------------------------------------------------- LENS
async function runLens(evidence) {
  section('LIVE CHAIN LENS — real TapeOut data via the official TapeKit kernel');
  const lens = { processors: {}, sites: [] };

  for (const key of ['xlayer', 'bnb', 'base']) {
    try {
      const scan = await scanProcessors(key, { max: 40 });
      lens.processors[key] = scan;
      say(`${scan.chain} (chainId ${scan.chainId}) factory ${scan.factory}: ${scan.processors.length} processors found`);
      for (const p of scan.processors.slice(0, 4)) say(`   cpu ${p.index}: ${p.address}`);
      if (scan.processors.length > 4) say(`   … and ${scan.processors.length - 4} more`);
    } catch (e) {
      lens.processors[key] = { error: String(e.message || e) };
      say(`${key}: processor scan failed — ${e.message}`);
    }
  }

  // Canonical live sites (found on chain at build time; statuses reported as-is)
  for (const name of ['4246.0.tape', '2.2.0.tape', '1.2.2.tape']) {
    const ev = await inspectSite(name);
    lens.sites.push(ev);
    say(`${name} -> ${ev.status}` +
      (ev.container ? ` container ${ev.container}` : '') +
      (ev.cpuName ? ` (${ev.cpuName})` : '') +
      (ev.block !== null && ev.block !== undefined ? ` @block ${ev.block}` : ''));
    for (const f of ev.files || []) {
      say(`   ${f.path}: ${f.bytes} bytes, kernelVerified=${f.kernelVerified}, independentSHA256 match=${f.independentMatch}`);
    }
  }
  evidence.lens = lens;
  const anyVerified = lens.sites.some((s) => s.allVerified);
  const anyMismatch = lens.sites.some((s) => (s.files || []).some((f) => f.independentMatch === false));
  return { ok: !anyMismatch, anyVerified };
}

// ---------------------------------------------------------------- PACK
async function runPack(evidence, dir = join(ROOT, 'site')) {
  section('SITE PACKAGER — DeWEB bundle per the tape:// specification');
  const bundle = await packageSite(dir);
  const outDir = join(ROOT, 'site-bundle');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'tape-manifest.json'), JSON.stringify(bundle, null, 2));
  say(`packaged ${bundle.fileCount} files, ${bundle.totalBytes} bytes, fallback=${bundle.fallback}`);
  say(`100% on-chain purity: ${bundle.pure ? 'YES — no external references' : 'NO — see externalRefs'}`);
  for (const f of bundle.files) say(`   ${f.path}  ${f.bytes}B  sha256 ${f.sha256}`);
  evidence.pack = bundle;
  return bundle.pure === true;
}

// ---------------------------------------------------------------- main
const cmd = process.argv[2] || 'demo';
const evidence = { generatedAt: new Date().toISOString(), tool: 'TapeForge Studio', version: '0.1.0' };
let ok = true;

if (cmd === 'lab') {
  ok = await runLab(evidence);
} else if (cmd === 'pack') {
  ok = await runPack(evidence, process.argv[3] || join(ROOT, 'site'));
} else if (cmd === 'lens') {
  const ev = await inspectSite(process.argv[3]);
  console.log(JSON.stringify(ev, null, 2));
  ok = ev.status !== 'error';
} else if (cmd === 'demo') {
  const labOk = await runLab(evidence);
  const lens = await runLens(evidence);
  const packOk = await runPack(evidence);
  await writeFile(join(ROOT, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await writeFile(join(ROOT, 'report.html'), renderReport(evidence));
  section('SUMMARY');
  say(`circuit lab: ${labOk ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  say(`live lens:   ${lens.anyVerified ? 'live TapeOut sites fetched & SHA-256 verified on BNB Chain / X Layer' : 'no verified site read (network?)'}; hash mismatches: ${lens.ok ? 'none' : 'FOUND'}`);
  say(`site bundle: ${packOk ? 'pure, DeWEB-ready' : 'external references present'}`);
  say(`evidence:    evidence.json + report.html written`);
  ok = labOk && lens.ok && packOk;
} else {
  say('unknown command:', cmd);
  ok = false;
}
process.exit(ok ? 0 : 1);
