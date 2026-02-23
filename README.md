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

Set environment variables (see `.env.example`):
- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`
- `EVM_PRIVATE_KEY`
- `EVM_WALLET_ADDRESS`

## Running

```bash
# One-shot market scan
python src/main.py scan

# Continuous monitor (runs every 30 min)
python src/main.py monitor

# Dashboard
python src/dashboard/app.py
```
