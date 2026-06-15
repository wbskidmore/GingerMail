# GingerMail intellectual-property program

This directory holds GingerMail's **invention disclosure records (IDRs)**: an
internal capture of the technically distinctive mechanisms in the product, in a
form suitable for evaluating patent, trade-secret, or defensive-publication
protection.

Each record documents one invention: the problem it solves, how it works (with
citations to the exact code that implements it), what is novel about it relative
to conventional email clients, the closest known prior approaches, a
plain-language sketch of independent and dependent claims, and a recommended
protection strategy.

## Important: what these documents are and are not

- These are **disclosure records, not filed patent applications.** No
  application has been filed with any patent office on the basis of these
  documents, and creating them confers no patent rights.
- They are **not legal advice.** Patentability, novelty, and freedom-to-operate
  are determinations for qualified patent counsel after a formal prior-art
  search. The "recommended protection" notes here are engineering opinions to
  brief counsel, nothing more.
- **Public disclosure starts clocks and can destroy rights.** In the United
  States a public disclosure starts a 12-month grace period to file; in most
  other jurisdictions public disclosure before filing is an immediate bar.
  Treat the contents of this directory as confidential until counsel advises
  otherwise. Do **not** publish a disclosure record (or ship the feature in a
  way that publicly teaches it) before deciding whether to file.
- They are written to be **evidence-accurate**: every mechanism described is
  linked to the file that actually implements it, mirroring the discipline used
  in [docs/compliance/](../compliance/README.md). If the code changes, update
  the record.

This caveat is intentional and is repeated in each record so the artifacts are
never mistaken for filed applications or for legal advice.

## Invention register

| ID                                                | Title                                                            | Primary subsystem           | Recommended protection                    | Priority |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- | ----------------------------------------- | -------- |
| [GM-IP-01](01-nl-search-fts5-compilation.md)      | LLM-mediated natural-language to SQLite FTS5 query compilation   | `packages/ai`, `storage`    | Patent (method) + trade secret (prompts)  | High     |
| [GM-IP-02](02-cross-channel-detection-agents.md)  | Cross-channel actionable-detection agent with safe auto modes    | `apps/main/src/ai`          | Patent (method)                           | High     |
| [GM-IP-03](03-behavioral-unsubscribe-pipeline.md) | Behavioral unsubscribe pipeline with metadata-only AI + RFC 8058 | `apps/main/src/unsubscribe` | Patent (method) + defensive publication   | High     |
| [GM-IP-04](04-bundled-local-ai-sidecar.md)        | Bundled local-LLM sidecar with reuse + curated onboarding        | `apps/main/src/ai`          | Trade secret + defensive publication      | Medium   |
| [GM-IP-05](05-dual-layer-ai-egress-control.md)    | Mode-aware dual-layer AI egress control                          | `apps/main/src/security`    | Defensive publication (+ patent if novel) | Medium   |

## Record template

Every record in this directory follows the same structure so they can be
compared side by side and handed to counsel as a batch:

1. Title and invention ID
2. Inventors / date / status (to be completed before any filing)
3. Technical field
4. Problem addressed (background)
5. Summary of the invention
6. Detailed description (with file citations and snippets)
7. Novel / distinguishing features
8. Known / prior approaches and how this differs
9. Claim sketches (independent + dependent, plain language)
10. Enablement pointers
11. Recommended protection strategy

## Candidates for a future pass

This pass documents the five strongest (Tier-1) inventions only. The following
mechanisms were identified as notable during review and are candidates for a
later disclosure pass; they are intentionally **not** yet documented here:

- Energy-based inbox prioritization for cognitive accessibility (`prioritizeInbox`).
- Transparent SQLCipher migration via dual-driver `sqlcipher_export()` with
  crash-safe backup (`packages/storage/src/openEncryptedDb.ts`).
- Crash-resilient mail outbox with idempotent `client_id` and stale-send
  recovery (`pending_sends` table).
- Sync body-preservation policy (never overwrite a cached body with an empty
  stub).
- Sender-trust-gated remote image loading with element-aware DOMPurify hooks.
- Focus Mode as cross-subsystem notification suppression.
- OAuth loopback hardening (state CSRF + URL-bar scrubbing) and the
  plaintext-refusing `TokenVault`.

## How to maintain

1. When the implementation of a documented invention changes, update the
   affected record's "Detailed description" and "Enablement pointers" so the
   cited files and line ranges stay accurate.
2. When a new distinctive mechanism ships, add a row to the register and write a
   record using the template above (promote one from "Candidates" where
   applicable).
3. Before any public disclosure, demo, blog post, or store listing that would
   teach one of these mechanisms, confirm with counsel whether a filing should
   precede it.
4. Keep records evidence-accurate: do not describe a mechanism as implemented
   unless the cited file actually implements it.
