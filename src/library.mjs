// TapeForge circuit library — useful circuits built ONLY from NAND + LATCH,
// the two TapeOut primitives, each paired with an executable specification
// so the Lab can prove the netlist implements the spec on every input row.
//
// Naming: a0 is the least significant bit of operand A, etc.

import { Builder, CONST0, CONST1 } from './circuits.mjs';

function fullAdder(b, a, bb, cin) {
  const x = b.xor(a, bb);
  const sum = b.xor(x, cin);
  const cout = b.or(b.and(a, bb), b.and(x, cin));
  return { sum, cout };
}

export const CIRCUITS = [];

// --- XOR from 4 NANDs (sanity / primitive demo) ---------------------------
{
  const b = new Builder('xor2');
  const y = b.xor('a', 'bb');
  CIRCUITS.push({
    netlist: b.build(['a', 'bb'], [y]),
    renameOutputs: { [y]: 'y' },
    spec: (i) => ({ y: i.a ^ i.bb }),
    blurb: 'XOR built from 4 NAND gates — the hello-world of gate-level design.',
  });
}

// --- Half adder ------------------------------------------------------------
{
  const b = new Builder('half_adder');
  const { sum, cout } = fullAdder(b, 'a', 'bb', CONST0);
  CIRCUITS.push({
    netlist: b.build(['a', 'bb'], [sum, cout]),
    renameOutputs: { [sum]: 'sum', [cout]: 'carry' },
    spec: (i) => ({ sum: i.a ^ i.bb, carry: i.a & i.bb }),
    blurb: 'Half adder: sum and carry of two bits.',
  });
}

// --- Full adder ------------------------------------------------------------
{
  const b = new Builder('full_adder');
  const { sum, cout } = fullAdder(b, 'a', 'bb', 'cin');
  CIRCUITS.push({
    netlist: b.build(['a', 'bb', 'cin'], [sum, cout]),
    renameOutputs: { [sum]: 'sum', [cout]: 'carry' },
    spec: (i) => {
      const s = i.a + i.bb + i.cin;
      return { sum: s & 1, carry: (s >> 1) & 1 };
    },
    blurb: 'Full adder: the cell every arithmetic circuit is tiled from.',
  });
}

// --- 4-bit ripple adder ------------------------------------------------------
{
  const b = new Builder('adder4');
  let carry = 'cin';
  const sums = [];
  for (let i = 0; i < 4; i++) {
    const r = fullAdder(b, `a${i}`, `b${i}`, carry);
    sums.push(r.sum); carry = r.cout;
  }
  const outs = [...sums, carry];
  const rename = { [carry]: 'carry' };
  sums.forEach((s, i) => { rename[s] = `s${i}`; });
  CIRCUITS.push({
    netlist: b.build(
      ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'cin'], outs),
    renameOutputs: rename,
    spec: (i) => {
      const a = i.a0 | (i.a1 << 1) | (i.a2 << 2) | (i.a3 << 3);
      const bb = i.b0 | (i.b1 << 1) | (i.b2 << 2) | (i.b3 << 3);
      const s = a + bb + i.cin;
      const o = { carry: (s >> 4) & 1 };
      for (let k = 0; k < 4; k++) o[`s${k}`] = (s >> k) & 1;
      return o;
    },
    blurb: '4-bit ripple-carry adder with carry-in — 9 inputs, 512 rows, proven.',
  });
}

// --- 4-bit ALU: op 0=ADD 1=SUB 2=AND 3=OR, zero flag -------------------------
{
  const b = new Builder('alu4');
  const sub = 'op0';               // op LSB: 1 = subtract (within arithmetic)
  const logic = 'op1';             // op MSB: 1 = logic unit
  let carry = sub;                 // SUB = A + ~B + 1
  const sums = [], logicOuts = [];
  for (let i = 0; i < 4; i++) {
    const bEff = b.xor(`b${i}`, sub);
    const r = fullAdder(b, `a${i}`, bEff, carry);
    sums.push(r.sum); carry = r.cout;
    logicOuts.push(b.mux('op0', b.or(`a${i}`, `b${i}`), b.and(`a${i}`, `b${i}`)));
  }
  const ys = sums.map((s, i) => b.mux(logic, logicOuts[i], s));
  carry = b.and(carry, b.not(logic)); // carry is an arithmetic flag: forced 0 in logic mode
  let anyY = ys[0];
  for (let i = 1; i < 4; i++) anyY = b.or(anyY, ys[i]);
  const zero = b.not(anyY);
  const outs = [...ys, carry, zero];
  const rename = { [carry]: 'carry', [zero]: 'zero' };
  ys.forEach((y, i) => { rename[y] = `y${i}`; });
  CIRCUITS.push({
    netlist: b.build(
      ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'op0', 'op1'], outs),
    renameOutputs: rename,
    spec: (i) => {
      const a = i.a0 | (i.a1 << 1) | (i.a2 << 2) | (i.a3 << 3);
      const bb = i.b0 | (i.b1 << 1) | (i.b2 << 2) | (i.b3 << 3);
      const op = i.op0 | (i.op1 << 1);
      let y, carry = 0;
      if (op === 0) { const s = a + bb; y = s & 15; carry = (s >> 4) & 1; }
      else if (op === 1) { const s = a + ((~bb) & 15) + 1; y = s & 15; carry = (s >> 4) & 1; }
      else if (op === 2) { y = a & bb; }
      else { y = a | bb; }
      const o = { carry, zero: y === 0 ? 1 : 0 };
      for (let k = 0; k < 4; k++) o[`y${k}`] = (y >> k) & 1;
      return o;
    },
    blurb: '4-bit ALU (ADD/SUB/AND/OR + zero flag) — a Behemoth-style arithmetic core, 1,024 rows proven.',
  });
}

// --- 3-of-5 threshold (multisig policy circuit) ------------------------------
{
  const b = new Builder('threshold_3of5');
  const ins = ['v0', 'v1', 'v2', 'v3', 'v4'];
  // count ones with a small adder tree -> 3-bit count
  const s1 = fullAdder(b, 'v0', 'v1', 'v2');            // sum bit + carry (weight2)
  const s2 = fullAdder(b, 'v3', 'v4', s1.sum);          // low bit + carry
  const low = s2.sum;
  const twos = [s1.cout, s2.cout];
  const c1 = b.xor(twos[0], twos[1]);                   // count bit1
  const c2 = b.and(twos[0], twos[1]);                   // count bit2
  const ge3 = b.or(c2, b.and(c1, low));                 // >=3  <=>  c2 | (c1 & c0)
  CIRCUITS.push({
    netlist: b.build(ins, [ge3]),
    renameOutputs: { [ge3]: 'approved' },
    spec: (i) => ({ approved: (i.v0 + i.v1 + i.v2 + i.v3 + i.v4) >= 3 ? 1 : 0 }),
    blurb: '3-of-5 approval policy: pays out / unlocks only when at least 3 of 5 signers agree — governance as a circuit.',
  });
}

// --- Majority voter (triple-modular redundancy) ------------------------------
{
  const b = new Builder('majority3');
  const y = b.or(b.or(b.and('a', 'bb'), b.and('a', 'c')), b.and('bb', 'c'));
  CIRCUITS.push({
    netlist: b.build(['a', 'bb', 'c'], [y]),
    renameOutputs: { [y]: 'y' },
    spec: (i) => ({ y: (i.a + i.bb + i.c) >= 2 ? 1 : 0 }),
    blurb: 'Majority voter: masks any single faulty input — the classic fault-tolerance cell.',
  });
}

// --- 4-bit counter (sequential, LATCH state) ---------------------------------
{
  const b = new Builder('counter4');
  // state latches are created first so their q nets exist
  const dNets = [];
  const qNets = [];
  // build increment logic against placeholder q names, then wire latches
  const qs = ['q0s', 'q1s', 'q2s', 'q3s'];
  let carry = CONST1;
  const nexts = [];
  for (let i = 0; i < 4; i++) {
    nexts.push(b.xor(qs[i], carry));
    carry = b.and(qs[i], carry);
  }
  for (let i = 0; i < 4; i++) {
    const q = b.latch(nexts[i]);       // LATCH out net
    qNets.push(q); dNets.push(nexts[i]);
    // rename latch source: the increment logic reads qs[i]; alias latch out to qs[i]
    // (netlist uses plain names — we simply name the latch output qs[i] below)
  }
  // Rebuild cleanly: gates reference nets by name; set latch outs to qs[i]
  let li = 0;
  for (const g of b.gates) if (g.type === 'LATCH') g.out = qs[li++];
  CIRCUITS.push({
    netlist: b.build([], qs),
    sequential: {
      cycles: 20,
      expect: (cycle) => cycle % 16,   // value shown on q3..q0 after `cycle` steps
      readState: (values) => qs.reduce((acc, q, i) => acc | ((values.get(q) ?? 0) << i), 0),
    },
    blurb: '4-bit binary counter: 4 LATCHes of state, +1 per clock — sequential logic, verified over 20 cycles (wraps at 16).',
  });
}

export { CONST0, CONST1 };
