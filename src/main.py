"""
Polly main entry point.

Usage:
  python src/main.py scan        # One-shot market scan (Polly researches top markets)
  python src/main.py monitor     # Continuous mode (runs scan every 30 min)
  python src/main.py list        # List active markets (no research, just data)
  python src/main.py market SLUG # Research one specific market
"""

import sys
import time
from datetime import datetime

from data.gamma_client import GammaClient


def cmd_list(limit: int = 20):
    """Print top active markets by 24hr volume."""
    client = GammaClient()
    markets = client.get_top_markets(n=limit)

    print(f"\n{'─'*80}")
    print(f"{'TOP ACTIVE POLYMARKET MARKETS':^80}")
    print(f"{'by 24hr Volume':^80}")
    print(f"{'─'*80}\n")

    for i, m in enumerate(markets, 1):
        yes_p = m.yes_price
        print(
            f"{i:>2}. [{yes_p:.0%} YES] {m.question[:65]}"
        )
        print(
            f"    Vol 24h: ${m.volume_24hr:>10,.0f}  |  "
            f"Total: ${m.volume:>12,.0f}  |  "
            f"Ends: {m.end_date}"
        )
        print()

    print(f"{'─'*80}")
    print(f"Total: {len(markets)} markets\n")


def cmd_market(slug: str):
    """Fetch and display info for a single market."""
    client = GammaClient()
    m = client.get_market_by_slug(slug)
    if not m:
        print(f"Market not found: {slug}")
        return

    print(f"\nMarket: {m.question}")
    print(f"Slug:   {m.slug}")
    print(f"YES price: {m.yes_price:.1%}  |  NO price: {m.no_price:.1%}")
    print(f"Volume: ${m.volume:,.0f}  |  24h: ${m.volume_24hr:,.0f}")
    print(f"Liquidity: ${m.liquidity:,.0f}")
    print(f"End date: {m.end_date}")
    print(f"\nDescription:\n{m.description[:500]}")


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "list"

    if cmd == "list":
        limit = int(args[1]) if len(args) > 1 else 20
        cmd_list(limit)

    elif cmd == "market":
        if len(args) < 2:
            print("Usage: python src/main.py market <slug>")
            sys.exit(1)
        cmd_market(args[1])

    elif cmd == "scan":
        print("Scan mode requires the Polly AI agent to be running.")
        print("Fetching market candidates for research...")
        cmd_list(30)

    elif cmd == "monitor":
        print("Monitor mode — scanning every 30 minutes. Ctrl+C to stop.\n")
        while True:
            print(f"\n[{datetime.utcnow().isoformat()}] Running scan...")
            cmd_list(30)
            time.sleep(30 * 60)

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
