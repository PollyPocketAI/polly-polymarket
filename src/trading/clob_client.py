"""
Polymarket CLOB trading client wrapper.
Handles authentication, order placement, and position management.
"""

import os
import logging
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds, OrderArgs
from py_clob_client.order_builder.constants import BUY, SELL

log = logging.getLogger("polly.trading")

HOST = "https://clob.polymarket.com"
CHAIN_ID = 137


@dataclass
class OrderResult:
    success: bool
    order_id: Optional[str]
    market_id: str
    token_id: str
    side: str       # "YES" or "NO"
    price: float
    size: float
    error: Optional[str] = None


class PollyTrader:
    """
    Wraps the py_clob_client for Polly's use.
    Handles L1+L2 auth, order placement, and balance checks.
    """

    def __init__(self):
        self.private_key = "0x" + os.getenv("EVM_PRIVATE_KEY", "").lstrip("0x")
        self.api_key     = os.getenv("POLYMARKET_API_KEY")
        self.api_secret  = os.getenv("POLYMARKET_API_SECRET")
        self.passphrase  = os.getenv("POLYMARKET_API_PASSPHRASE")
        self.funder      = os.getenv("EVM_WALLET_ADDRESS")

        creds = ApiCreds(
            api_key=self.api_key,
            api_secret=self.api_secret,
            api_passphrase=self.passphrase,
        )

        self.client = ClobClient(
            host=HOST,
            chain_id=CHAIN_ID,
            key=self.private_key,
            creds=creds,
        )

        log.info(f"Trader initialized | signer: {self.client.get_address()}")

    def get_open_orders(self) -> list[dict]:
        """Return all open orders."""
        try:
            return self.client.get_orders() or []
        except Exception as e:
            log.error(f"get_orders failed: {e}")
            return []

    def get_trades(self) -> list[dict]:
        """Return trade history."""
        try:
            return self.client.get_trades() or []
        except Exception as e:
            log.error(f"get_trades failed: {e}")
            return []

    def place_order(
        self,
        token_id: str,
        price: float,
        size_usdc: float,
        side: str,              # "YES" or "NO"
        tick_size: float = 0.01,
        neg_risk: bool = False,
    ) -> OrderResult:
        """
        Place a limit order.
        token_id: CLOB token ID for the outcome (YES or NO)
        price:    0.0-1.0 (probability / price per share)
        size_usdc: dollar amount to bet
        side:     "YES" or "NO"
        """
        clob_side = BUY  # Always BUY the outcome token we want

        try:
            order_args = OrderArgs(
                token_id=token_id,
                price=round(price, 4),
                size=round(size_usdc, 2),
                side=clob_side,
            )
            resp = self.client.create_and_post_order(
                order_args,
                options={"tick_size": str(tick_size), "neg_risk": neg_risk},
            )
            order_id = resp.get("orderID") if resp else None
            log.info(f"Order placed: {side} {size_usdc} USDC @ {price:.2%} | ID: {order_id}")
            return OrderResult(
                success=True,
                order_id=order_id,
                market_id="",
                token_id=token_id,
                side=side,
                price=price,
                size=size_usdc,
            )
        except Exception as e:
            log.error(f"Order placement failed: {e}")
            return OrderResult(
                success=False,
                order_id=None,
                market_id="",
                token_id=token_id,
                side=side,
                price=price,
                size=size_usdc,
                error=str(e),
            )

    def cancel_order(self, order_id: str) -> bool:
        try:
            self.client.cancel(order_id)
            return True
        except Exception as e:
            log.error(f"Cancel failed: {e}")
            return False

    def cancel_all(self) -> bool:
        try:
            self.client.cancel_all()
            return True
        except Exception as e:
            log.error(f"Cancel all failed: {e}")
            return False

    def status(self) -> dict:
        """Return connection status + open order count."""
        orders = self.get_open_orders()
        return {
            "connected": True,
            "signer": self.client.get_address(),
            "open_orders": len(orders),
        }
