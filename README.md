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
implied = TVL × category multiple × growth × maturity
```

- **TVL** — the protocol's own `tvl_usd` from the snapshot.
- **Category multiple** — the median mcap/TVL of the protocols in the same
  category whose token already trades, falling back to the global median
  when a category has fewer than three such comps. Multiples are
  winsorised to [0.02, 1.5]. No protocol name is hardcoded: the multiples
  are computed from the snapshot at run time.
- **Growth** — the protocol's seven-day TVL change, clamped to [-50, +100]
  per cent, as a factor in [0.5, 2.0]. No change recorded means 1.0.
- **Maturity** — how long the protocol has run with no token: 1 + 0.1 per
  year since `listed_at`, capped at 3 years. No listing date means 1.0.

Implied values are this board's own claim, never a market price. "Records
no token" means DefiLlama records no token for the protocol; it is not
proof that none exists.

## The farm plans

Every row carries seven steps with concrete costs and times: set up a
wallet, bridge funds, use the protocol's core feature weekly, join its
community, track points, and what to do if a token is issued. Steps are
written from the protocol's own category and chains.

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
