# Vivid Takeoff & Estimate (items 1–2)

- `db/schema.sql`: companies, roles (owner / estimator / viewer), projects, plan sets, sheets with printed vs. two-point
  calibration, takeoff layers, measurements (AI suggestions start unconfirmed and never count), items, assemblies,
  estimates, the approval queue and the audit log. Every row is scoped to one company.
- `src/provider.ts`: the `TakeoffProvider` interface. `VividProvider` is always on. `StackProvider` uses only STACK's
  published API and stays off until `STACK_ENABLED=true` with `STACK_CLIENT_ID` / `STACK_CLIENT_SECRET` (after certification).
- `src/approval.ts`: every write is proposed with a plain preview ("Create 3 takeoffs") and applied only when a user with
  write rights approves it. No auto-approve. Each step is audited.
- `src/measure.ts`: scale parsing (architectural, engineering, ratio), two-point calibration with the 1% warning, linear,
  area with cut-outs, volume, pitched roof, wall area and fence posts.
- `sample/`: the sample plan (C-101, 1/8"=1'-0") and the script that draws it to scale.
- `viewer/takeoff-viewer.html`: the plan viewer (pdf.js): calibrate, linear/area/count tools, layers, fence assembly,
  approve-before-save. Open your own PDF to measure it in the browser.

`npm test` (7 tests) · `npm run demo` prints the fence takeoff. Not yet built: libraries and assemblies with CSV import,
estimate worksheet and proposal PDF, model takeoff from Build Studio, bid intake, the Estimate search chip, analytics.
Uploaded plans stay private per company. Terms of Use for takeoff and estimating: placeholder for legal review.
