# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/BillWGong/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/BillWGong/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: every protocol that records no token, ranked by what
its token would be worth, with a concrete plan to farm each one.

## The board

250 protocols ranked by implied value. The board holds the snapshot's
watchlist (40 protocols at or above $50M TVL that record no token) plus
every protocol that records no token and sits below that floor — the early
ones the radar exists to find. Protocols above the floor that the watchlist
leaves out are the giants that already trade in another form (centralised
exchanges, wrapped and staked products of tokens that trade, bridges) and
are not ranked as launches. Protocols whose token already trades are set
aside in the dashboard's own list, never on the board.

## The value model

```
implied = TVL × fitted multiple × growth × maturity
```

- **TVL** — the protocol's own `tvl_usd` from the snapshot.
- **Fitted multiple** — from the 128 protocols whose token already
  trades. Three candidate rules are fitted and compared on a
  deterministic 5-fold holdout (folds by sorted slug, scored by the
  median absolute log10 error of the predicted market cap): per-category
  size curves, one global size curve (`log10(mcap) = a + b·log10(TVL)`),
  and a flat median mcap/TVL. On this snapshot the global curve wins
  (holdout error 0.557, per-category curves 0.557, flat median 0.697);
  near-ties go to the simpler rule, so the board uses the global curve
  (a = 3.025, b = 0.522). Multiples are winsorised to [0.02, 1.5]. No
  protocol name is hardcoded: everything is computed from the snapshot
  at run time.
- **Growth** — the protocol's seven-day TVL change, clamped to [-50, +100]
  per cent, as a factor in [0.5, 2.0]. No change recorded means 1.0.
- **Maturity** — how long the protocol has run with no token: 1 + 0.1 per
  year since `listed_at`, capped at 3 years. No listing date means 1.0.
  Growth and maturity are stated priors, not fitted terms.

The implied range on each row widens the value by the winning rule's
holdout error (×10^±0.557, about ×3.6 each way): it is the model's own
uncertainty, not a price band.

## Token odds

Each row carries a token-launch odds estimate: a logistic regression
fitted on all 758 protocols (label = records a token; features = log10
TVL, age, clamped 7-day change, log1p chain count). It is a
cross-sectional fit on the snapshot's own traded-vs-untraded record,
not a launch forecast. Holdout AUC is 0.592 (0.5 = chance, base rate
54.9% of protocols record a token) — a modest signal, reported as such.

## Integrity, costs, verdicts

Every row flags what the snapshot does not have: no 7-day change, no
listing date, a global multiple fallback, a clamped growth term, a
capped value. The dashboard prints the counts: 13 rows miss a listing
date, 2 miss a 7-day change, all 250 use the global curve, 4 are
growth-clamped. The board, the traded list and the above-floor set
account for all 758 protocols (250 ranked + 128 traded with a market
cap + 288 with a token but no market cap + 92 above-floor unranked).

Every row carries a costed farm verdict: expected value = token odds ×
implied value; Farm at $10M, Thin at $2.5M, otherwise Skip (21 / 162 /
67 on this board). Fees are estimates, not snapshot data: a $5 bridge
plus 10 transactions at a typical per-chain fee (Ethereum $3, Bitcoin
$2, cheap L1s $0.05, L2s $0.10, other EVM chains $0.20, anything else
$0.50). Capital is the plan's own sizes: $25–$100 to start plus $10–$25
a week for 8 weeks.

Implied values are this board's own claim, never a market price. "Records
no token" means DefiLlama records no token for the protocol; it is not
proof that none exists.

## The farm plans

Every row carries eight steps with concrete costs and times: set up a
wallet, bridge funds, use the protocol's core feature weekly, join its
community, track points, what to do if a token is issued, and the
costed verdict. Steps are written from the protocol's own category and
chains.

## Running it

Node 22 or later, standard library only, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` reads the sealed snapshot, writes the ranked board to
`out/board.json`, the dashboard's data to `out/data.js`, copies
`dashboard/` to `out/dashboard`, decodes `screenshots/*.png.b64` into
`out/screenshots/*.png`, and writes `out/dossier.json`. It runs twice with
identical output: the same snapshot bytes always write the same bytes.

Screenshots are stored in this repository as base64 text
(`screenshots/*.png.b64`) because the push path carries text only; the
program restores the PNGs at run time.

## Layout

- `main.ts` — entrypoint: read snapshot, score, write outputs, dossier.
- `lib/model.ts` — the value model, the farm plans, the gate checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`. No network.
- `screenshots/` — the board, a detail view and a filtered view, as `.b64`.
- `vendor/makefun-board.ts` — the make.fun dossier library, as shipped.
- `.makefun/owner.json` — the claim file for this entry.

Data: DefiLlama protocols, fetched 2026-11-14 (see `input/` in the kit).
License: MIT.
