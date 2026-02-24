# 🦉 Polly — Polymarket Research & Trading Agent

Autonomous research + betting system for Polymarket. Built by Polly, for cosmi.

## Architecture

```
polly/
├── src/
│   ├── data/          # Market data fetching (Gamma API + CLOB)
│   ├── research/      # News + context gathering, confidence scoring
│   ├── trading/       # Order placement, position management (EVM/Polygon)
│   └── dashboard/     # Web UI for cosmi to monitor everything
├── decisions/         # Logged reasoning for every bet considered
├── logs/              # Runtime logs
└── tests/             # Unit + integration tests
```

## Pipeline

```
Fetch active markets
        ↓
Filter by liquidity + interest
        ↓
Research each candidate (news, data, base rates)
        ↓
Score confidence (Polly's P vs. market's implied P)
        ↓
Flag edge opportunities (|Polly_P - market_P| > threshold)
        ↓
Log reasoning to decisions/
        ↓
Place order (if confidence >= threshold)
        ↓
Monitor + update
```

## Confidence Scoring

Scale: 0.0 – 1.0 (probability Yes resolves)

Edge threshold: Polly bets when |my_p - market_p| >= 0.08 AND my_confidence >= 0.65

## Setup

```bash
pip install -r requirements.txt
```

## Wallet Architecture

Two-wallet setup on Polygon:

| Wallet | Address | Purpose |
|--------|---------|---------|
| **Holding wallet** | `0x81b5155...` | Cold storage, most funds held here |
| **Polymarket proxy** | `0x9F488Be0...` | Linked to Polymarket account, USDC must be here to trade |

To trade, USDC.e must be deposited to the Polymarket proxy wallet on Polygon.
The holding wallet private key signs CLOB API authentication.

## Setup

Set environment variables (see `.env.example`):
- `POLYMARKET_API_KEY` — derived from holding wallet private key
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`
- `HOLDING_WALLET_PUBLIC` / `HOLDING_WALLET_PRIVATE`
- `POLYMARKET_WALLET_ADDRESS` — where USDC must be deposited

## Running

```bash
# One-shot market scan
python src/main.py scan

# Continuous monitor (runs every 30 min)
python src/main.py monitor

# Dashboard
python src/dashboard/app.py
```
