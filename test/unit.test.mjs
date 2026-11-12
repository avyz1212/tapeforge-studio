// TapeForge offline unit tests — no network, no chain access needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, verifyTruthTable, step, settle, renameNets, census } from '../src/circuits.mjs';
import { CIRCUITS } from '../src/library.mjs';
import { packageSite } from '../src/packager.mjs';

test('every combinational library circuit matches its spec on all rows', () => {
  for (const c of CIRCUITS) {
    if (c.sequential) continue;
    const renamed = renameNets(c.netlist, c.renameOutputs || {});
    const r = verifyTruthTable(renamed, c.spec);
    assert.equal(r.ok, true, `${c.netlist.name} failed: ${JSON.stringify(r.counterexample)}`);
  }
});

test('counter4 counts 0..15 and wraps, driven only by LATCH state', () => {
  const c = CIRCUITS.find((x) => x.sequential);
  let state = {};
  for (let cycle = 1; cycle <= 20; cycle++) {
    state = step(c.netlist, state, {}).nextState;
    const values = settle(c.netlist, {}, state);
    assert.equal(c.sequential.readState(values), cycle % 16, `cycle ${cycle}`);
  }
  assert.equal(census(c.netlist).latch, 4);
});

test('alu4 spot checks: 9+7=0 carry1, 5-9 wraps, zero flag', () => {
  const alu = CIRCUITS.find((x) => x.netlist.name === 'alu4');
  const renamed = renameNets(alu.netlist, alu.renameOutputs);
  const bits = (n, p) => Object.fromEntries([0, 1, 2, 3].map((i) => [`${p}${i}`, (n >> i) & 1]));
  let out = evaluate(renamed, { ...bits(9, 'a'), ...bits(7, 'b'), op0: 0, op1: 0 });
  assert.equal(out.y0 | (out.y1 << 1) | (out.y2 << 2) | (out.y3 << 3), 0);
  assert.equal(out.carry, 1);
  out = evaluate(renamed, { ...bits(5, 'a'), ...bits(9, 'b'), op0: 1, op1: 0 });
  assert.equal(out.y0 | (out.y1 << 1) | (out.y2 << 2) | (out.y3 << 3), 12); // -4 mod 16
  out = evaluate(renamed, { ...bits(0, 'a'), ...bits(0, 'b'), op0: 0, op1: 0 });
  assert.equal(out.zero, 1);
});

test('threshold_3of5 boundary rows', () => {
  const t = CIRCUITS.find((x) => x.netlist.name === 'threshold_3of5');
  const renamed = renameNets(t.netlist, t.renameOutputs);
  const run = (arr) => evaluate(renamed, Object.fromEntries(arr.map((v, i) => [`v${i}`, v]))).approved;
  assert.equal(run([1, 1, 0, 0, 0]), 0);
  assert.equal(run([1, 1, 1, 0, 0]), 1);
  assert.equal(run([1, 1, 1, 1, 1]), 1);
  assert.equal(run([0, 0, 0, 0, 0]), 0);
});

test('packager hashes match the well-known sha256 of "hello"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf-'));
  await writeFile(join(dir, 'index.html'), 'hello'); // no newline
  const bundle = await packageSite(dir);
  const f = bundle.files.find((x) => x.path === 'index.html');
  // sha256("hello") — the canonical test vector
  assert.equal(f.sha256, '0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.equal(f.bytes, 5);
  assert.equal(bundle.fallback, 'index.html');
});
