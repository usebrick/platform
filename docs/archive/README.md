# Documentation archive

This directory is the recoverable home for superseded planning narratives.
Archiving preserves history without allowing old plans to compete with the
current roadmap and execution index.

## Rules

- Move or delete nothing without explicit path-level owner approval.
- Preserve each archived file byte-for-byte.
- Record the original path, archive path, Git blob ID, SHA-256, date, reason,
  and superseding plan in [`MANIFEST.json`](MANIFEST.json).
- Leave a short compatibility redirect at a high-inbound legacy path when
  needed.
- Keep frozen contracts and immutable evidence at their original paths when
  hashes or audit links depend on those paths.
- Never edit an archived original to add a notice; place the notice in the
  redirect or manifest.
- Restore an item by verifying its hash and moving it back to its original
  path in an ordinary reviewed change.

Each `MANIFEST.json#entries` item uses `from`, `to`, `sha256`, `gitBlob`,
`archivedAt`, `reason`, and `supersededBy`. The validator recomputes both hashes
from the archived bytes and rejects missing audit metadata.

An empty manifest means no archive migration has been performed yet. It does
not mean old documentation has been approved for deletion.
