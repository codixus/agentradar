# Changelog

All notable changes to `agentradar` and `agentradar-core` are documented here.
The two packages are versioned in lockstep and follow semantic versioning.

## 0.2.0 - 2026-07-04

Scoring rebalance and a structured audit trail.

This is a data-shape change for consumers of `agentradar-core` and the CLI
`--json` output. No existing field changes meaning or type, but the scoring
numbers move and every check now carries additional fields. Consumers that pin
exact scores or grades should re-baseline.

### Changed

- The composite score is now a tier-weighted pass ratio across every verifiable
  check: error 4, warning 2, notice 1. Notice-tier checks were previously
  excluded from the score entirely; they now carry real but low weight, so
  adopting emerging standards is what lifts a site from a B into an A.
- Grade bands are now A>=90, B>=72, C>=50, D>=30, else F.
- Any failing non-inferred error-tier check caps the grade at C. The score
  number is unchanged; only the letter is capped, and only downward.
- Under the old error-tier-only model a site serving every established signal but
  no emerging ones scored A/100; under the new model it lands at C.
- README scoring descriptions updated to describe the weighted model and the C
  cap.

### Added

- `HttpStep` and `CheckResource` types, exported from `agentradar-core`.
- `CheckMeta` gains `goal` and `resources`. `CheckResult` gains `goal`, `issue`,
  `resources`, and `transcript`. All are additive; `evidence` is unchanged.
- Every check now reports a plain-language `goal`, one or two authoritative
  `resources` links (RFCs and spec sites), a one-line `issue` on a verified
  failure, and a `transcript` of the HTTP requests it made (redirect hops,
  statuses, and network errors are all recorded).

## 0.1.1

### Fixed

- The composite score is weighted by severity tier (error 2, warning 1) instead
  of counting every check equally, and soft-404 responses (200 + an HTML
  catch-all) no longer read as malformed JSON.
- `agentradar-core` is packaged as a publishable, Bun-native library that ships
  TypeScript source; release scripts were added.

## 0.1.0

Initial public release.

### Added

- Scan engine with 20 agent-visibility checks grouped by outcome (can agents
  find, read, reach, and trust you).
- The `agentradar` CLI with human-readable and `--json` output.
- Outbound-fetch hardening: a manual redirect cap and a response body-size cap.
