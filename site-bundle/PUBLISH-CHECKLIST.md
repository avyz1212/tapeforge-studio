# Publishing this bundle to TapeOut (owner steps — official tools only)

The bundle in this folder (`tape-manifest.json`) is **prepared and verified**,
but not yet on chain. Putting bytes on chain is a paid action that only the
site owner performs, with their own wallet, through TapeOut's official
tooling. TapeForge never asks for keys, seed phrases, or funds.

1. **Get a circuit container.** In the official TapeOut app (tapeout.net),
   with your own wallet, tape out any circuit on your chosen processor
   (this bundle's companion circuits are in `../circuits/`) — a circuit NFT
   comes with a bound container. Tape-out consumes the circuit's NAND/LATCH
   components plus the protocol fee shown by the app.
2. **Upload the site files** into that container with the official
   container uploader / TapeKit site-owner flow, file by file, exactly as
   listed in `tape-manifest.json` (paths are case-sensitive; `index.html`
   is the fallback page).
3. **Verify with TapeForge:** `node src/cli.mjs lens <your-name>` — the
   Lens re-reads your site from multiple independent nodes and checks every
   file's SHA-256 against the values in `tape-manifest.json`.
4. **(Optional) Activate the short name.** A container that has paid the
   name fee via the DomainBinding contract (see TapeKit GUIDE.md) answers
   to its `<#ID>.<processor>.tape` name in every spec-compliant kernel.
5. **X Layer note:** the same contracts exist on X Layer mainnet
   (factory `0x1f09daefa827f02cbb40967cc91b259763760761`). Use the official
   app's X Layer flow when available; fees there are OKB-denominated.
