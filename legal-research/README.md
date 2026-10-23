# Vivid Engine Legal Research

Search and answers built **only** on public, properly licensed legal data. This package powers the public Legal Help section and Research mode (Search Pro and Max).

## Rule 0

Content from Thomson Reuters, Westlaw, CoCounsel, Harvey, LexisNexis, Bloomberg Law or any other licensed research service is never ingested, indexed, embedded, cached or sent to a model, even if a connector to it exists.

| Piece | Where it's enforced |
|---|---|
| Allowlist of approved sources, each with its license and terms link | `config/legal-sources.ts` |
| Every passage checked before it's stored (source, domain, license, `retrieved_at`, terms reviewed, production flag) | `src/allowlist.ts` → `assertIngestible` |
| Build fails if anything non-allowlisted is in the index | `test/index-guard.test.ts`, `npm run check:index` |
| Database refuses rows from other sources | `db/schema.sql` CHECK constraint |
| No code calls a licensed research connector | `test/allowlist.test.ts` |

Sources stay **link-only** until their terms are read and recorded (`termsReviewed: true`). Today only CAP (CC0) is cleared for full ingestion.

## Commands

Node 22.6+ is required. These are run from `legal-research/`.

```
npm install
npm test                      # allowlist, index guard, CAP parsing, citation links
npm run ingest:cap:tx:dry     # confirm the static.case.law layout (prints the first case's fields)
npm run ingest:cap:tx         # Texas opinions → data/index/cap/*.jsonl (resumable)
npm run check:index           # guard the ingested data
npm run db:schema             # needs DATABASE_URL and the pgvector extension
npm run db:load               # load passages into Postgres
```

CourtListener stays development-only until `COURTLISTENER_COMMERCIAL=true`, which you set after signing a Free Law Project agreement. Put `COURTLISTENER_API_TOKEN` in `.env`, never in code.

## What's built and what's next

- [x] Allowlist with licenses and terms links, and the enforcement tests
- [x] CAP ingestion for Texas: opinion text only, head_matter skipped, per-case jurisdiction filter for regional reporters
- [x] Citation recognizer with official links for Texas statutes; Louisiana, federal and case citations recognized
- [x] Postgres + pgvector schema with full-text index
- [ ] Embedding job and hybrid search (BM25 + vector + re-rank) API in the NestJS backend
- [ ] Citation checker (index + CourtListener lookup) and answer format with source cards
- [ ] CourtListener adapter (development flag), Louisiana and SCOTUS / 5th Circuit ingestion
- [ ] Legal Help and Research mode pages in `site/`
