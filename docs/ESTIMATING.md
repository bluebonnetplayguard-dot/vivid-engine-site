# Estimating engine

```
Takeoff (docs/TAKEOFFS.md) ──► cost table match ──► line pricing ──► totals ──► versioned estimate ──► proposal (next PR)
                                starter or contractor   material / labor / sub     overhead, contingency,
                                + per-estimate overrides                            margin or markup, tax
```

Code: `backend/src/estimating/`. `engine.ts` is pure; `estimating.service.ts` stores versions; migration `011_estimates.sql`.

## Starter prices are placeholders

`starter-costs.ts` ships a complete **starter** table so a new account sees a full estimate. Those numbers are
placeholders, **not a quote and not market research**. Every line priced from them has `priceSource: 'starter'`,
and every estimate that uses one carries the warning "N of M lines use starter placeholder prices". Save your
own table (`POST /api/cost-tables`) with your supplier and subcontractor prices, or override per estimate.

## Cost tables

```json
{ "name": "Bluebonnet 2026", "laborRatePerHour": 62,
  "items": [ { "match": "exterior.siding.vinyl-lap", "unit": "squares",
               "material": { "unitCost": 150, "source": "supplier" },
               "sub": { "unitCost": 190, "trade": "Siding" } } ] }
```

- `match` is a takeoff line key, or a pattern with `*` (e.g. `framing.studs-2x6-*`, `cabinets.*.walnut-cabinet`).
  The most specific item wins: an exact key beats patterns, then fewer wildcards and more literal characters.
- `unit` must equal the takeoff line's unit; a matching item in another unit leaves the line unpriced (flagged).
- An item can have a **material** cost ($/unit), **labor** (crew hours/unit at the table's rate) and/or a
  **sub** cost ($/installed unit, with trade name).
- A contractor table keeps the starter items it doesn't replace, so nothing goes unpriced; those lines stay
  flagged as starter prices.

## Pricing

| | Formula |
|---|---|
| Material | unit cost × **order** quantity (waste included) × regional material factor |
| Labor | hours/unit × **net** quantity × labor rate × regional labor factor |
| Sub | sub unit cost × **net** quantity × regional labor factor |
| Direct | material + sales tax on material + labor + sub |
| Cost | direct + overhead % + contingency % (both on direct) |
| Price | margin: cost ÷ (1 − profit %), or markup: cost × (1 + profit %) |

Defaults: overhead 10 %, contingency 5 %, 20 % gross margin, sales tax 0 % (set it when the contract calls for it),
regional factors 1.0. `overrides` (by takeoff line key) replace a material, sub or hours figure for one estimate
(`priceSource: 'override'`); `exclude` leaves lines out.

Each estimate has line items, totals by category, `pricePerSqFt`, and flags for starter prices, unverified
quantities, unpriced lines and unit mismatches.

## Alternates

`alternates: [designId, ...]` prices other designs in the same project (for example the "Brick version" the
studio creates) with the same cost table and settings, and stores for each one the price, the difference from the
base, the difference by category, and the 25 largest line changes (brick added, vinyl removed...).

## Versions and staleness

Estimates are numbered per project (`/api/projects/:id/estimates/1`, `/2`, ...). Each stores the design version,
the takeoff it used (an existing run for that design version, or one computed and saved on the spot), the cost
table id, settings and the full result. `stale: true` means the design was saved after the estimate.

## API (owner of the 3D Studio project)

| Method | Path | |
|---|---|---|
| POST | `/api/projects/:id/estimates` | `{ designId, alternates?, settings?, note? }` → `201` new version |
| GET | `/api/projects/:id/estimates` | versions with price, $/sq ft, alternates count, stale |
| GET | `/api/projects/:id/estimates/:version` | full estimate |
| GET | `/api/cost-tables` | starter + your tables |
| GET | `/api/cost-tables/:id` | a table (`starter` included) |
| POST / PUT | `/api/cost-tables[/:id]` | save your table (validated: units, patterns, non-negative prices) |

Estimates are computed in the request (milliseconds for a house); takeoffs run as background jobs (see TAKEOFFS.md).
