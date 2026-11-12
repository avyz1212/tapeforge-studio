// TapeForge Circuit Lab — a simulator for TapeOut-style netlists.
//
// TapeOut builds everything from two on-chain primitives:
//   NAND  — combinational logic (NOT(a AND b))
//   LATCH — state storage (the protocol's memory primitive)
//
// A netlist is plain JSON, mirroring how a TapeOut circuit is a fixed wiring
// of components inside a processor:
//   { name, inputs: [net...], outputs: [net...],
//     gates: [ {type:'NAND', in:[a,b], out} | {type:'LATCH', d, out} ] }
//
// Simulation model (documented, deterministic):
//   - Combinational parts are settled to a fixpoint.
//   - A LATCH contributes its stored bit as a source net during settling;
//     `step()` then captures each latch's D net as the next state
//     (synchronous, rising-edge semantics — the standard way TapeOut
//     builders compose sequential logic from latches).
// Combinational verification (truth tables) is exact under this model.

export const CONST0 = '1\'b0';
export const CONST1 = '1\'b1';

function bit(v) { return v ? 1 : 0; }

/** Settle all combinational nets. latchState: { latchOutNet: 0|1 }. */
export function settle(netlist, inputValues = {}, latchState = {}) {
  const values = new Map();
  values.set(CONST0, 0);
  values.set(CONST1, 1);
  for (const name of netlist.inputs) {
    if (!(name in inputValues)) throw new Error(`missing input ${name}`);
    values.set(name, bit(inputValues[name]));
  }
  for (const g of netlist.gates) {
    if (g.type === 'LATCH') values.set(g.out, bit(latchState[g.out] ?? 0));
  }
  const nands = netlist.gates.filter((g) => g.type === 'NAND');
  const maxPasses = nands.length * 2 + 16;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const g of nands) {
      const a = values.get(g.in[0]);
      const b = values.get(g.in[1]);
      if (a === undefined || b === undefined) continue;
      const out = a & b ? 0 : 1;
      if (values.get(g.out) !== out) { values.set(g.out, out); changed = true; }
    }
    if (!changed) break;
  }
  for (const name of netlist.outputs) {
    if (!values.has(name)) {
      throw new Error(`net ${name} never settled (combinational loop or missing driver)`);
    }
  }
  return values;
}

/** One synchronous step: settle, then capture latch D nets as next state. */
export function step(netlist, state, inputValues) {
  const values = settle(netlist, inputValues, state);
  const nextState = {};
  for (const g of netlist.gates) {
    if (g.type === 'LATCH') {
      const d = values.get(g.d);
      if (d === undefined) throw new Error(`latch D net ${g.d} never settled`);
      nextState[g.out] = d;
    }
  }
  return { values, nextState };
}

/** Evaluate a combinational netlist once. Returns { outputName: 0|1 }. */
export function evaluate(netlist, inputValues) {
  const values = settle(netlist, inputValues, {});
  const out = {};
  for (const name of netlist.outputs) out[name] = values.get(name);
  return out;
}

/**
 * Exhaustive truth-table verification.
 * spec: (inputsObj) -> outputsObj (only listed outputs are compared).
 */
export function verifyTruthTable(netlist, spec, { maxInputs = 20 } = {}) {
  const n = netlist.inputs.length;
  if (n > maxInputs) throw new Error(`refusing to enumerate 2^${n} rows`);
  const rows = 2 ** n;
  for (let row = 0; row < rows; row++) {
    const inputs = {};
    netlist.inputs.forEach((name, i) => { inputs[name] = (row >> (n - 1 - i)) & 1; });
    const got = evaluate(netlist, inputs);
    const want = spec(inputs);
    for (const [k, v] of Object.entries(want)) {
      if (got[k] !== v) {
        return { ok: false, rows, counterexample: { inputs, want: v, got: got[k], output: k } };
      }
    }
  }
  return { ok: true, rows };
}

/** Return a copy of the netlist with nets renamed (e.g. friendly output names). */
export function renameNets(netlist, map) {
  const rn = (n) => map[n] || n;
  return {
    ...netlist,
    inputs: netlist.inputs.map(rn),
    outputs: netlist.outputs.map(rn),
    gates: netlist.gates.map((g) => g.type === 'NAND'
      ? { ...g, in: g.in.map(rn), out: rn(g.out) }
      : { ...g, d: rn(g.d), out: rn(g.out) }),
  };
}

/** Component census: what a tape-out of this netlist consumes on-chain. */
export function census(netlist) {
  let nand = 0, latch = 0;
  for (const g of netlist.gates) {
    if (g.type === 'NAND') nand++;
    else if (g.type === 'LATCH') latch++;
  }
  return { nand, latch, total: nand + latch };
}

/** Tiny builder so library circuits read like schematics, not wiring lists. */
export class Builder {
  constructor(name) { this.name = name; this.gates = []; this.n = 0; this.inputs = []; this.outputs = []; }
  fresh(tag = 'n') { return `${tag}${this.n++}`; }
  nand(a, b) { const out = this.fresh('n'); this.gates.push({ type: 'NAND', in: [a, b], out }); return out; }
  not(a) { return this.nand(a, a); }
  and(a, b) { return this.not(this.nand(a, b)); }
  or(a, b) { return this.nand(this.not(a), this.not(b)); }
  xor(a, b) { const d = this.nand(a, b); return this.nand(this.nand(a, d), this.nand(b, d)); }
  mux(sel, a, b) { // sel ? a : b
    return this.or(this.and(sel, a), this.and(this.not(sel), b));
  }
  latch(d) { const out = this.fresh('q'); this.gates.push({ type: 'LATCH', d, out }); return out; }
  build(inputs, outputs) {
    return { name: this.name, inputs, outputs, gates: this.gates };
  }
}
