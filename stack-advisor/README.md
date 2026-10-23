# Vivid Stack Advisor (items 1–3: schema, trust logic, search/get/check_edge/check_stack)
Evidence-based AI tool intelligence. Our own data, design and names.

- **Trust tiers:** Verified (our lab ran both tools together in the last 30 days, public log) → Checked (automated cross-check) → Indexed (registry/docs, not cross-checked) → Unknown ("No evidence these connect").
- **Expiry:** Verified older than 30 days shows as Checked until re-run. Failures are shown, and a newer lab failure overrides an older pass.
- **Neutrality:** rankings/tiers are never for sale; no schema column or function input can change them. Ads, if ever, go in a separate "Sponsored" block.
- **Sources:** `config/stack-sources.ts`. Other directories are disabled.
- **Mock data:** `src/seed.ts` is development data, flagged `mock` in every result. Not real test results.

`npm test` (10+ tests) · `npm run demo` prints check_edge and check_stack. Not yet built: collectors, lab, compare_tools, find_routes, chip UI, App Builder handoff, "How it works" page.
