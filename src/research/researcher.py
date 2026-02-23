"""
Research pipeline — gathers context for a market and scores confidence.

Flow:
  1. Pull market question + description
  2. Search web for recent news/data
  3. Synthesize into a probability estimate with reasoning
  4. Return a ResearchResult with confidence metadata
"""

import json
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from src.data.gamma_client import Market


@dataclass
class ResearchResult:
    market_id: str
    question: str
    market_yes_price: float          # Current market price for YES
    polly_yes_prob: float            # Polly's estimated YES probability
    confidence: float                # 0-1: how confident in the estimate
    edge: float                      # polly_yes_prob - market_yes_price
    reasoning: str                   # Full reasoning chain
    sources: list[str]               # URLs used
    recommendation: str              # "BET_YES" | "BET_NO" | "PASS"
    bet_size_pct: float              # % of bankroll to risk (Kelly-ish)
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Thresholds
    MIN_EDGE = 0.08         # Minimum |polly_p - market_p| to consider betting
    MIN_CONFIDENCE = 0.60   # Minimum confidence to pull the trigger

    def __post_init__(self):
        self.edge = self.polly_yes_prob - self.market_yes_price

    @property
    def should_bet(self) -> bool:
        return (
            abs(self.edge) >= self.MIN_EDGE
            and self.confidence >= self.MIN_CONFIDENCE
        )

    @property
    def bet_direction(self) -> Optional[str]:
        if not self.should_bet:
            return None
        return "YES" if self.edge > 0 else "NO"

    def to_dict(self) -> dict:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "market_yes_price": self.market_yes_price,
            "polly_yes_prob": self.polly_yes_prob,
            "confidence": self.confidence,
            "edge": self.edge,
            "reasoning": self.reasoning,
            "sources": self.sources,
            "recommendation": self.recommendation,
            "bet_size_pct": self.bet_size_pct,
            "timestamp": self.timestamp,
        }

    def summary(self) -> str:
        arrow = "🟢" if self.edge > 0 else "🔴" if self.edge < 0 else "⚪"
        action = f"BET {self.bet_direction}" if self.should_bet else "PASS"
        return (
            f"{arrow} {self.question[:80]}\n"
            f"   Market: {self.market_yes_price:.1%} YES  |  "
            f"Polly: {self.polly_yes_prob:.1%}  |  "
            f"Edge: {self.edge:+.1%}  |  "
            f"Conf: {self.confidence:.0%}  →  {action}"
        )


class Researcher:
    """
    Orchestrates research for a given market.
    Uses web search (via openclaw/exec) to gather signal.
    """

    EDGE_THRESHOLD = 0.08
    CONFIDENCE_THRESHOLD = 0.60

    def __init__(self):
        pass

    def research_market(self, market: Market) -> ResearchResult:
        """
        Full research pipeline for one market.
        Returns a ResearchResult with Polly's probability estimate.
        """
        # This will be called by the AI agent itself during a session —
        # the agent searches for news, reasons about the question,
        # and fills in polly_yes_prob + confidence + reasoning.
        # This stub exists so trading logic can call into it uniformly.
        raise NotImplementedError(
            "research_market() is called by the Polly AI agent during a scan session. "
            "Use scan_and_research() in main.py instead."
        )

    def kelly_fraction(
        self,
        p: float,
        q: float,
        b: float = 1.0,
        max_fraction: float = 0.05,
    ) -> float:
        """
        Kelly criterion bet sizing.
        p = probability of win
        q = 1 - p
        b = net odds (payout per unit bet, e.g. bet YES at 0.3 → b = (1-0.3)/0.3 = 2.33)
        Returns fraction of bankroll to bet, capped at max_fraction.
        """
        kelly = (b * p - q) / b
        return min(max(kelly, 0.0), max_fraction)

    def size_bet(self, result: ResearchResult) -> float:
        """Compute Kelly-optimal bet size as % of bankroll."""
        if not result.should_bet:
            return 0.0
        p = result.polly_yes_prob
        q = 1 - p
        market_p = result.market_yes_price

        if result.bet_direction == "YES":
            b = (1 - market_p) / market_p  # payout per $ bet on YES
        else:
            p, q = q, p
            b = market_p / (1 - market_p)  # payout per $ bet on NO

        # Scale by confidence
        raw = self.kelly_fraction(p, q, b)
        return round(raw * result.confidence, 4)
