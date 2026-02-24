"use strict";
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express  = require("express");
const cors     = require("cors");
const axios    = require("axios");
const path     = require("path");
const fs       = require("fs");
const { ethers } = require("ethers");
const crypto   = require("crypto");

const app  = express();
const PORT = process.env.PORT || 7420;

// ── Config ───────────────────────────────────────────────────────────────────
const GAMMA        = "https://gamma-api.polymarket.com";
const CLOB         = "https://clob.polymarket.com";
const POLYGON_RPC  = "https://polygon-bor-rpc.publicnode.com";
const USDC_E_ADDR  = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e (bridged)
const USDC_ADDR    = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // native USDC
const USDC_ABI     = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

const HOLDING_PUB   = process.env.HOLDING_WALLET_PUBLIC   || "";
const HOLDING_PRIV  = process.env.HOLDING_WALLET_PRIVATE  || "";
const POLY_WALLET   = process.env.POLYMARKET_WALLET_ADDRESS || "";
const API_KEY       = process.env.POLYMARKET_API_KEY       || "";
const API_SECRET    = process.env.POLYMARKET_API_SECRET    || "";
const API_PASS      = process.env.POLYMARKET_API_PASSPHRASE || "";

const DECISIONS_DIR = path.join(__dirname, "../decisions");
const DATA_FILE     = path.join(__dirname, "polly-data.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { trades: [], transfers: [], notes: [] }; }
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

function buildClobHeaders(method, reqPath, body = "") {
  const ts  = Math.floor(Date.now() / 1000).toString();
  const msg = ts + method.toUpperCase() + reqPath + (body || "");
  const key = Buffer.from(API_SECRET, "base64");
  const sig = crypto.createHmac("sha256", key).update(msg).digest("base64url");
  return {
    "POLY_ADDRESS":    HOLDING_PUB,
    "POLY_SIGNATURE":  sig,
    "POLY_TIMESTAMP":  ts,
    "POLY_API_KEY":    API_KEY,
    "POLY_PASSPHRASE": API_PASS,
    "Content-Type":    "application/json",
  };
}

async function clobGet(path, params = {}) {
  const headers = buildClobHeaders("GET", path);
  const r = await axios.get(`${CLOB}${path}`, { headers, params, timeout: 10000 });
  return r.data;
}

async function getUsdcBalance(address) {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const usdce = new ethers.Contract(USDC_E_ADDR, USDC_ABI, provider);
    const usdc  = new ethers.Contract(USDC_ADDR,   USDC_ABI, provider);
    const [[b1,d1],[b2,d2]] = await Promise.all([
      Promise.all([usdce.balanceOf(address), usdce.decimals()]),
      Promise.all([usdc.balanceOf(address),  usdc.decimals()]),
    ]);
    return parseFloat(ethers.formatUnits(b1,d1)) + parseFloat(ethers.formatUnits(b2,d2));
  } catch { return null; }
}

async function getMaticBalance(address) {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const bal = await provider.getBalance(address);
    return parseFloat(ethers.formatEther(bal));
  } catch { return null; }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let _marketsCache = null;
let _marketsCacheTime = 0;

async function fetchMarkets(limit = 50) {
  const now = Date.now();
  if (_marketsCache && now - _marketsCacheTime < 60000) return _marketsCache;

  const r = await axios.get(`${GAMMA}/markets`, {
    params: { limit, active: "true", closed: "false" },
    timeout: 15000,
  });

  const markets = r.data
    .filter(m => m.enableOrderBook && parseFloat(m.volumeNum) > 1000)
    .map(m => {
      const prices   = JSON.parse(m.outcomePrices || "[]").map(Number);
      const outcomes = JSON.parse(m.outcomes || "[]");
      const tokens   = JSON.parse(m.clobTokenIds || "[]");
      return {
        id:            m.id,
        question:      m.question,
        slug:          m.slug,
        conditionId:   m.conditionId,
        yesPrice:      prices[0] ?? 0.5,
        noPrice:       prices[1] ?? 0.5,
        outcomes,
        tokens,
        volume:        parseFloat(m.volumeNum  || 0),
        volume24h:     parseFloat(m.volume24hr || 0),
        volume1wk:     parseFloat(m.volume1wk  || 0),
        liquidity:     parseFloat(m.liquidityNum || 0),
        endDate:       m.endDateIso || "",
        acceptingOrders: m.acceptingOrders,
        negRisk:       m.negRisk,
        description:   (m.description || "").slice(0, 300),
        tags:          (m.events?.[0]?.tags || []).map(t => t.label),
      };
    })
    .sort((a, b) => b.volume24h - a.volume24h);

  _marketsCache = markets;
  _marketsCacheTime = now;
  return markets;
}

// ── API: Status ───────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    ok:        true,
    agent:     "Polly 🦉",
    version:   "1.0.0",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    wallets: {
      holding:    HOLDING_PUB,
      polymarket: POLY_WALLET,
    },
  });
});

// ── API: Balances ─────────────────────────────────────────────────────────────
app.get("/api/balances", async (req, res) => {
  try {
    const [holdingUsdc, holdingMatic, polyUsdc, polyMatic] = await Promise.all([
      HOLDING_PUB  ? getUsdcBalance(HOLDING_PUB)  : null,
      HOLDING_PUB  ? getMaticBalance(HOLDING_PUB) : null,
      POLY_WALLET  ? getUsdcBalance(POLY_WALLET)  : null,
      POLY_WALLET  ? getMaticBalance(POLY_WALLET) : null,
    ]);

    const totalUsdc = (holdingUsdc ?? 0) + (polyUsdc ?? 0);

    res.json({
      ok: true,
      holding: {
        address: HOLDING_PUB,
        usdc:    holdingUsdc,
        matic:   holdingMatic,
      },
      polymarket: {
        address: POLY_WALLET,
        usdc:    polyUsdc,
        matic:   polyMatic,
      },
      totalUsdc,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: Markets ──────────────────────────────────────────────────────────────
app.get("/api/markets", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const markets = await fetchMarkets(limit);
    res.json({ ok: true, markets, count: markets.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: CLOB Orders ──────────────────────────────────────────────────────────
app.get("/api/orders", async (req, res) => {
  try {
    const data = await clobGet("/data/orders");
    const orders = Array.isArray(data) ? data : (data.data || []);
    res.json({ ok: true, orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, orders: [] });
  }
});

// ── API: CLOB Trades ──────────────────────────────────────────────────────────
app.get("/api/trades", async (req, res) => {
  try {
    const data = await clobGet("/data/trades");
    const trades = Array.isArray(data) ? data : (data.data || []);
    res.json({ ok: true, trades, count: trades.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, trades: [] });
  }
});

// ── API: Decisions (research logs) ───────────────────────────────────────────
app.get("/api/decisions", (req, res) => {
  try {
    if (!fs.existsSync(DECISIONS_DIR)) return res.json({ ok: true, decisions: [] });

    const files = fs.readdirSync(DECISIONS_DIR)
      .filter(f => f.endsWith(".md"))
      .sort().reverse().slice(0, 100);

    const decisions = files.map(f => {
      const raw     = fs.readFileSync(path.join(DECISIONS_DIR, f), "utf8");
      const verdict = raw.match(/Verdict[:\*\s]+([A-Z_]+)/)?.[1] || "SCAN";
      const yesPrice = parseFloat(raw.match(/Market YES price[^\d]+([\d.]+)/)?.[1] || "0");
      const pollyP   = parseFloat(raw.match(/Polly YES estimate[^\d]+([\d.]+)/)?.[1] || "0");
      const edge     = parseFloat(raw.match(/Edge[^\+\-\d]+([\+\-]?[\d.]+)/)?.[1] || "0");
      const conf     = parseFloat(raw.match(/Confidence[^\d]+([\d.]+)/)?.[1] || "0");
      const question = raw.match(/\*\*Question:\*\*\s*(.+)/)?.[1]
                    || raw.match(/^#\s+(.+)/m)?.[1]?.replace("Decision Log","").trim()
                    || f.replace(".md","");
      return { file: f, verdict, question: question.slice(0,120), yesPrice, pollyP, edge, conf };
    });

    res.json({ ok: true, decisions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/decisions/:file", (req, res) => {
  try {
    const fp = path.join(DECISIONS_DIR, path.basename(req.params.file));
    if (!fs.existsSync(fp)) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, content: fs.readFileSync(fp, "utf8") });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: P&L Summary ─────────────────────────────────────────────────────────
app.get("/api/pnl", async (req, res) => {
  try {
    const d = loadData();
    const trades = d.trades || [];

    const closed = trades.filter(t => t.settled);
    const wins   = closed.filter(t => t.pnl > 0);
    const totalPnl    = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalBet    = trades.reduce((s, t) => s + (t.size || 0), 0);
    const successRate = closed.length ? wins.length / closed.length : 0;
    const roi         = totalBet > 0 ? totalPnl / totalBet : 0;

    res.json({
      ok: true,
      totalPnl:    parseFloat(totalPnl.toFixed(2)),
      totalBet:    parseFloat(totalBet.toFixed(2)),
      totalTrades: trades.length,
      settled:     closed.length,
      wins:        wins.length,
      losses:      closed.length - wins.length,
      successRate: parseFloat((successRate * 100).toFixed(1)),
      roi:         parseFloat((roi * 100).toFixed(2)),
      trades:      trades.slice(-50).reverse(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: Log a manual bet/trade ───────────────────────────────────────────────
app.post("/api/trades", (req, res) => {
  try {
    const d = loadData();
    const trade = { id: Date.now(), ...req.body, loggedAt: new Date().toISOString() };
    d.trades.push(trade);
    saveData(d);
    res.json({ ok: true, trade });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: Transfer info ────────────────────────────────────────────────────────
app.get("/api/transfers", (req, res) => {
  const d = loadData();
  res.json({ ok: true, transfers: (d.transfers || []).slice(-50).reverse() });
});

// ── API: Notes / research log ─────────────────────────────────────────────────
app.post("/api/notes", (req, res) => {
  try {
    const d = loadData();
    d.notes = d.notes || [];
    d.notes.push({ ...req.body, at: new Date().toISOString() });
    saveData(d);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🦉 Polly dashboard → http://localhost:${PORT}`);
  console.log(`   Holding wallet:    ${HOLDING_PUB}`);
  console.log(`   Polymarket wallet: ${POLY_WALLET}`);
});
