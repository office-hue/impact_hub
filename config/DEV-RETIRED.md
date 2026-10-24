# Historical DEV metadata

The approved 2026-10-24 retirement makes dev-v4/* and dev-delivery-v2*.json
historical provenance only. Their former active/pinned/selector fields are not
current source-admission policy. No installed controller consumes them through
the current entrypoints or CI. Existing task state and engine packages are not
rewritten, removed or claimed migrated.

Current source guidance: ../AGENTS.md and ../docs/dev-retirement-2026-10-24.md.
Source checks and actual product/release boundaries remain independent.
