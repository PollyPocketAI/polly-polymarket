"""
Polymarket Gamma API client — public, no auth required.
Handles market/event discovery and historical data.
"""

import json
import requests
from dataclasses import dataclass, field
from typing import Optional

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE  = "https://clob.polymarket.com"


@dataclass
class Market:
    id: str
    question: str
    slug: str
    condition_id: str
    clob_token_ids: list[str]
    outcome_prices: list[float]   # [yes_price, no_price]
    outcomes: list[str]
    volume: float
    volume_24hr: float
    liquidity: float
    end_date: str
    active: bool
    accepting_orders: bool
    neg_risk: bool
    description: str = ""
    tags: list[str] = field(default_factory=list)

    @property
    def yes_price(self) -> float:
        return self.outcome_prices[0] if self.outcome_prices else 0.5

    @property
    def no_price(self) -> float:
        return self.outcome_prices[1] if len(self.outcome_prices) > 1 else 0.5

    @property
    def implied_yes_prob(self) -> float:
        """Market-implied probability of YES resolution."""
        return self.yes_price


class GammaClient:
    def __init__(self, base_url: str = GAMMA_BASE):
        self.base = base_url
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "polly-agent/0.1"})

    def _get(self, path: str, params: dict = None) -> dict | list:
        r = self.session.get(f"{self.base}{path}", params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def get_active_markets(
        self,
        limit: int = 100,
        min_volume: float = 10_000,
        min_liquidity: float = 1_000,
    ) -> list[Market]:
        """Fetch active, liquid markets sorted by 24hr volume."""
        data = self._get("/markets", params={
            "limit": limit,
            "active": "true",
            "closed": "false",
        })

        markets = []
        for m in data:
            try:
                vol = float(m.get("volumeNum", 0))
                liq = float(m.get("liquidityNum", 0))
                if vol < min_volume or liq < min_liquidity:
                    continue
                if not m.get("enableOrderBook"):
                    continue

                prices_raw = m.get("outcomePrices", "[]")
                prices = [float(p) for p in json.loads(prices_raw)]

                outcomes_raw = m.get("outcomes", "[]")
                outcomes = json.loads(outcomes_raw)

                tokens_raw = m.get("clobTokenIds", "[]")
                tokens = json.loads(tokens_raw)

                markets.append(Market(
                    id=m["id"],
                    question=m["question"],
                    slug=m["slug"],
                    condition_id=m["conditionId"],
                    clob_token_ids=tokens,
                    outcome_prices=prices,
                    outcomes=outcomes,
                    volume=vol,
                    volume_24hr=float(m.get("volume24hr", 0)),
                    liquidity=liq,
                    end_date=m.get("endDateIso", ""),
                    active=m.get("active", False),
                    accepting_orders=m.get("acceptingOrders", False),
                    neg_risk=m.get("negRisk", False),
                    description=m.get("description", ""),
                ))
            except Exception as e:
                # Skip malformed entries
                continue

        # Sort by 24hr volume descending
        markets.sort(key=lambda m: m.volume_24hr, reverse=True)
        return markets

    def get_market_by_slug(self, slug: str) -> Optional[Market]:
        data = self._get("/markets", params={"slug": slug})
        if not data:
            return None
        m = data[0] if isinstance(data, list) else data
        prices = [float(p) for p in json.loads(m.get("outcomePrices", "[]"))]
        outcomes = json.loads(m.get("outcomes", "[]"))
        tokens = json.loads(m.get("clobTokenIds", "[]"))
        return Market(
            id=m["id"],
            question=m["question"],
            slug=m["slug"],
            condition_id=m["conditionId"],
            clob_token_ids=tokens,
            outcome_prices=prices,
            outcomes=outcomes,
            volume=float(m.get("volumeNum", 0)),
            volume_24hr=float(m.get("volume24hr", 0)),
            liquidity=float(m.get("liquidityNum", 0)),
            end_date=m.get("endDateIso", ""),
            active=m.get("active", False),
            accepting_orders=m.get("acceptingOrders", False),
            neg_risk=m.get("negRisk", False),
            description=m.get("description", ""),
        )

    def get_price_history(self, market_id: str, interval: str = "1d") -> list[dict]:
        """Get historical price data for a market."""
        try:
            data = self._get(f"/markets/{market_id}/prices-history",
                             params={"interval": interval})
            return data.get("history", [])
        except Exception:
            return []

    def get_top_markets(self, n: int = 20) -> list[Market]:
        """Get top N markets by 24hr volume."""
        return self.get_active_markets(limit=200)[:n]
