# TapeForge Studio

**Design it. Prove it. Tape it out.**
The builder's workbench for the **TapeOut protocol** — built for the
**OKX X Layer "TapeOut Accelerate"** hackathon (100,000 USDT pool,
submission deadline **7 Dec 2026, 23:59 UTC**, per the official page —
marked provisional there, re-check before submitting).

TapeOut turns computation itself into on-chain assets: circuits wired from
**NAND** (logic) and **LATCH** (state) components, taped out as circuit
NFTs inside processors, reusable as black-box modules, with whole websites
living in circuit containers on DeWEB (`tape://` names). TapeForge is the
tooling layer builders need around that: **prove a circuit correct before
spending components on it, inspect what is actually on chain, and package
sites that verify byte-for-byte.**

## The three tools

### 1. Circuit Lab — verify before you tape out
- Compose circuits from TapeOut's two primitives only (NAND + LATCH), as
  JSON netlists in TapeOut's own wiring model.
- **Exhaustive verification**: combinational circuits are proven against an
  executable specification on *every* input row; sequential circuits are
  walked cycle-by-cycle. A failed tape-out burns real components — the Lab
  makes failure happen locally, for free, first.
- Library (all passing, see `demo-run.log`): XOR, half/full adder, 4-bit
  ripple adder (512 rows), **4-bit ALU** — ADD/SUB/AND/OR + zero flag
  (1,024 rows), **3-of-5 threshold** approval policy (a multisig as a
  circuit), majority voter, **4-bit LATCH counter** (20 cycles, wraps at 16).
- Every circuit exports a tape-out package (`circuits/*.json`) with an
  exact **component census** — how many NAND/LATCH a tape-out consumes —
  plus the documented protocol-fee reference (0.0002 BNB per tape-out on
  BNB Chain, community beginner's guide 2026-09-25; an estimate for
  planning, never a quote — X Layer fee constants differ).

### 2. Live Chain Lens — TapeOut data, verified, on X Layer + BNB + Base
- Built on the **official open-source TapeKit kernel** (`@tapekit/kernel`,
  MIT, vendored under `vendor/tapekit-kernel/` — zero dependencies).
- Enumerates processors straight from the on-chain factory contracts
  (`cpuAt(i)`), resolves `tape://` names / containers / circuits, reads
  site manifests, and fetches files with the kernel's multi-operator
  agreement + per-file SHA-256 verification — then **re-hashes every file
  independently** with Node's crypto so the evidence doesn't rest on one
  implementation.
- Recorded live run (2026-11-13, `demo-run.log` + `evidence.json`):
  **≥40 processors** enumerated on each of X Layer (factory
  `0x1f09daefa827f02cbb40967cc91b259763760761`), BNB Chain and Base
  (scan capped at 40); three live sites fetched and hash-verified:
  `4246.0.tape` (Genesis CPU, BNB), `2.2.0.tape` and `1.2.2.tape`
  ("Xehemoth", **X Layer**) — every byte matched its on-chain SHA-256.

### 3. Site Packager — DeWEB bundles in the specification's own shape
- Turns a static site folder into a bundle per the **tape:// On-Chain
  Website Specification v0.2**: per-file byte size + SHA-256 manifest
  (`site-bundle/tape-manifest.json`) and a **purity scan** using the
  kernel's own `scanSite` — a site referencing anything off-chain cannot
  claim "100% on-chain". TapeForge's own landing page ships as the sample
  bundle (1 file, 2,556 bytes, purity: YES).
- Publishing (uploading into a container, name activation) stays with the
  owner: `site-bundle/PUBLISH-CHECKLIST.md` walks the official flow.
  **TapeForge never touches keys, seeds, or funds.**

## Run it (one command)

```bash
node --version   # >= 18 (developed on Node 24)
npm run demo     # lab + live lens + packager; writes evidence.json, report.html, demo evidence to stdout
npm test         # offline unit tests (node --test)
npm run lab      # circuit verification only (offline)
node src/cli.mjs lens 1.2.2.tape   # inspect any tape:// site (live, read-only)
node src/cli.mjs pack ./site       # package any static folder
```

The live lens needs only public RPC endpoints (read-only `eth_call`);
the lab and packager work fully offline.

## What's real vs. integration points (honest list)

**Real and exercised in the recorded run**
- All circuit simulation + exhaustive verification (local, deterministic).
- All TapeOut on-chain **reads**: factory enumeration and site resolution/
  file verification on BNB Chain, X Layer and Base mainnet, through the
  official kernel — the same contracts and data any TapeOut user sees.
- Site bundle preparation exactly per the published specification.

**Integration points (marked, by design)**
- **Tape-out & publishing are paid on-chain writes.** They are performed by
  the project owner with their own wallet in the official TapeOut app —
  no wallet connection exists in this codebase at all, so there is nothing
  to audit for key safety and nothing the tool could spend.
- **X Layer circuit tape-out of the library circuits** (ALU4, 3-of-5) is
  milestone 1 of the roadmap: the netlists and censuses are ready; the
  tape-out itself is a user step before/at submission (see SUBMISSION.md).
- LATCH simulation uses synchronous rising-edge capture after
  combinational settle — the standard composition model; combinational
  proofs are exact regardless of latch timing conventions.

## Business model (why this is a product, not a demo)

- **Users**: TapeOut circuit designers (incl. PoD participants), teams
  launching `.tape` DeWEB sites, auditors/integrators who need trustworthy
  reads of on-chain sites.
- **Free**: Lens lookups, Lab verification for small circuits, packager.
- **Pro (USDT subscription)**: signed verification reports for tape-out
  packages, component-cost optimisation (gate-count reduction passes),
  multi-site integrity monitoring with alerts when a container's on-chain
  hashes change, team workspaces and private circuit libraries.
- **Why they stay**: every tape-out and every site update re-enters the
  verify → package → monitor loop; the tool sits on the critical path of
  spending components, where a mistake is irreversible.

## Layout

```
src/         circuits.mjs (engine) · library.mjs (circuits+specs)
             kernel-bridge.mjs (official-kernel lens) · packager.mjs
             report.mjs · cli.mjs
circuits/    exported netlists with component censuses
site/        TapeForge landing site (the packager's sample input)
site-bundle/ tape-manifest.json + PUBLISH-CHECKLIST.md
test/        offline unit tests
vendor/      @tapekit/kernel (official, MIT — see its LICENSE)
evidence.json, report.html, demo-run.log   recorded run artefacts
```

## Licenses & attribution

TapeForge Studio is MIT-licensed (this prototype). The vendored TapeKit
kernel is © its authors, MIT (`vendor/tapekit-kernel/LICENSE`); the
tape:// specification is CC0 upstream. TapeOut, TapeKit, X Layer and OKX
names belong to their respective projects; this is an independent entry.
