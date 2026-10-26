# Proposal generator

```
Estimate version ──► phases (site · structure · envelope · interior) ──► wording ──► guard ──► proposal + Markdown ──► proposal_exports
                     sell prices that add up to the total                 Claude or      rejects numbers,
                     scope bullets from takeoff lines                     template       claims, links
```

Code: `backend/src/proposal/`. `builder.ts` is pure; `proposal-ai.ts` asks Claude for wording; migration
`012_proposals.sql` stores every generated proposal.

## Where each part comes from

| Part | Source |
|---|---|
| Phase prices | Each phase's share of the estimate's direct cost × (price ÷ direct), rounded; the last phase absorbs rounding so the phases add up to the total exactly |
| Scope bullets | Estimate lines in plain words with rounded quantities (accessories folded into their main item); never prices |
| Total, $/sq ft, options | The estimate's totals and alternates (`add $X` / `deduct $X`, new total, what changes) |
| "About these quantities" | Counts of verified vs. unverified lines, in plain words |
| Not included | Standard exclusions (permits, MEP, site work, change orders) |
| Company, customer, terms | Exactly what the contractor enters; nothing is added |
| Introduction, phase descriptions, closing | Claude (when `ANTHROPIC_API_KEY` is set) or the built-in template |

## AI wording guard

Claude gets the scope with **every digit masked** and is told to write sentences only. `checkWording()` then
rejects any field that contains a digit, `$` or `%`, a link or markup, or a claim the estimate can't support
(licensed, insured, bonded, certified, warranty/guarantee, years of experience, awards, code compliance,
engineered, permits). A rejected field uses the template wording, and a contractor-facing notice says why.
Claude calls are logged to the Billing Monitor (`workflow = proposal`) and respect its budgets.

## Contractor notices (never in the customer document)

- the estimate still uses starter placeholder prices
- how many lines rest on unverified sizes
- AI wording was off, unavailable, or partly replaced
- the design was saved after the estimate (create a new estimate first)
- unpriced lines or unit mismatches from the estimate

## API (owner of the project)

| Method | Path | |
|---|---|---|
| POST | `/api/projects/:id/estimates/:version/proposal` | `{ company: { name, phone?, email?, address?, license? }, customer?, projectAddress?, validDays?, includeAlternates?, showLineItems?, tone?: friendly \| formal, terms?, useAi? }` → `201 { id, proposal }` |
| GET | `/api/projects/:id/proposals` | saved proposals (version, wording, total, customer) |
| GET | `/api/projects/:id/proposals/:proposalId` | one proposal with its options |
| GET | `/api/projects/:id/proposals/:proposalId/markdown` | the customer document as a `.md` download |

Text the contractor enters is Markdown-escaped, so names or terms can't inject links or HTML.
