# Market Pricing (Admin > Market Pricing)

AI-assisted market price intelligence for the products and services you choose to monitor.
It starts in **Manual** mode with **automatic adjustments off**.

## What it changes, and what it doesn't

Approved prices are saved on the item in the central database (every phone and computer sees the same
value, with live updates) and recorded in the price history, where any change can be restored.

They do **not** change your website's published price list (`site/src/config/pricing.js`) or the amounts
Stripe checkout charges (`backend/src/shared/pricing.ts`). Charging a price that differs from what the
website shows would mislead customers, so connecting the two is a separate decision. When you want it,
the change is: the website and checkout read the approved price for linked items. Ask and I'll wire it up.

## Daily use

1. **Add item**: name, current price, and your costs (unit, operating, delivery), plus region and a search phrase.
2. **Refresh competitor prices**: searches the configured providers and stores every price found, with source URL,
   time, currency, location, provider, price type and confidence. You can also **Add price** by hand from a page you checked.
3. **Generate recommendations**: computes the market statistics and a recommended price for each item, with a written explanation.
   **Analyze market** runs steps 2 and 3 together.
4. **Approve** or **Reject** each recommendation, tick the approved items, then **Apply selected**.
5. **Restore** any earlier price from the item's history. **Export report** downloads a CSV of all items.

Status colors (thresholds are configurable under *Pricing rules*):

| Color | Meaning |
|---|---|
| Green | Within the deadband of the verified market average (competitive) |
| Yellow | Moderately off the market: review recommended |
| Red | Above the market average by more than the red threshold |
| Blue | Below the market with room to raise margin |
| Gray | No verified market data. Nothing is estimated |

## How prices are verified

| Source | How it's treated |
|---|---|
| Tavily, Exa (page text) | A price counts as **verified** only when the exact quoted text containing the number appears in the page content the provider returned for that URL |
| Perplexity | Its answer is AI-written, so its prices are stored as `ai_suggestion`, **never verified** and never used in averages |
| No Claude key | Prices are pulled from page text by pattern only and kept **unverified** for you to confirm |
| Manual entry | Verified only if you tick "I confirmed this price on the source page today" |

The market average, median, low and high use only prices that are all of the following:
- verified, and of type `advertised` or `transaction`
- in the item's currency
- fresh (newer than *market data counts as fresh for*)
- not promotional (unless enabled)
- not marked as including shipping or tax

They also use only the newest price per source, with outliers more than 3× from the median dropped.
Every excluded price is counted and listed with a reason.

## The formula

```
total cost       = unit cost + operating cost + delivery cost
gross margin %   = (price - total cost) / price × 100
markup %         = (price - total cost) / total cost × 100
margin floor     = total cost / (1 - minimum margin)

if |current - average| ≤ deadband      -> keep the price
if current is above the average        -> target = average × (1 + market position %)        (default 2% under)
if current is below the average        -> target = current + (average - current) × capture % (default 60%)
demand "high" softens decreases and speeds increases; "low" does the opposite
target is held at or above the margin floor and at or below the maximum price / margin, then rounded
```

Example with the defaults:
- $150 current price, $135 verified average, $90 cost and a 25% minimum margin give **$132**: -12%, 31.82% gross margin, 46.67% markup.
- $100 against a $120 average gives **$112** (+12%).

## Automatic mode safeguards

Automatic adjustments need **all** of these:
- Mode set to Automatic and the switch turned on, confirmed by typing `ENABLE AUTOMATIC PRICING`
- At least *N* distinct verified sources, with average confidence above the minimum
- Fresh data
- Change within the max automatic increase/decrease and the daily limit, and under the approval threshold
- Outside the cooldown since the last change
- Market average hasn't jumped more than the volatility limit since the last analysis
- Within the min/max selling price

Anything else becomes a recommendation waiting for approval. Recommendations never go below the margin floor.
A manual price below it needs an explicit override, which is logged.

## Schedule

Choose: only on demand, hourly, every 6/12 hours, daily, weekly or monthly. The scheduler runs inside the app
(no browser needed) and keeps one run per window, even across restarts. Each provider is capped at 120 calls an hour,
and failed calls are retried once. Duplicate prices (same URL and amount within 24 hours) are skipped. Failures raise alerts.
More frequent runs cost more provider and Claude usage; daily or weekly is plenty for service pricing.

## Alerts

In-app alerts cover:
- New recommendations
- Market rises and falls
- Prices below the minimum margin
- Unverified sources
- Provider failures
- Automatic adjustments
- Unusual volatility

Scheduled runs that produce recommendations also email the admins (needs SMTP).

## Setting up providers (all optional, server-side only)

| Provider | Get a key | Variable |
|---|---|---|
| Tavily | tavily.com | `TAVILY_API_KEY` |
| Exa | exa.ai | `EXA_API_KEY` |
| Perplexity | perplexity.ai (API) | `PERPLEXITY_API_KEY` |
| Claude (price extraction) | console.anthropic.com | `ANTHROPIC_API_KEY` |

Put them in `/opt/vivid/infra/.env` (or App Platform secrets), then `docker compose up -d app`. Keys never reach the browser.
Supplier or competitor price feeds you're licensed to use can be loaded through the `pricingImportPrices` function
(rows with `pricing_item_id`, `price`, `source_url`, ...). Use only sources whose terms allow it.

## Fair-pricing notes

The system compares against publicly advertised prices from sources you choose. It doesn't contact competitors,
share your prices, or use personal characteristics of customers. Set prices independently.

## Tested so far (simulated data only)

14 unit tests of the formula plus 22 end-to-end workflow checks:
- your worked examples
- margin protection and rounding
- cost components
- exclusion of unverified, stale, promotional, foreign-currency, outlier and duplicate prices
- every automatic-mode safeguard
- approval-before-apply
- apply, history and restore
- below-margin override
- the confirmation phrase
- admin-only access
- CSV export
- research with no providers configured

The page was also driven in a browser on desktop and phone.

**Not yet tested:** live Tavily, Exa and Perplexity calls and Claude price extraction, which need your API keys.
