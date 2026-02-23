const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 7420;

const GAMMA = "https://gamma-api.polymarket.com";
const DECISIONS_DIR = path.join(__dirname, "../decisions");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Market Data ─────────────────────────────────────────────────────────────

app.get("/api/markets", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const r = await axios.get(`${GAMMA}/markets`, {
      params: { limit, active: "true", closed: "false" },
      timeout: 10000,
    });

    const markets = r.data
      .filter((m) => m.enableOrderBook && parseFloat(m.volumeNum) > 5000)
      .map((m) => ({
        id: m.id,
        question: m.question,
        slug: m.slug,
        yesPrice: parseFloat(JSON.parse(m.outcomePrices)[0] || 0.5),
        noPrice: parseFloat(JSON.parse(m.outcomePrices)[1] || 0.5),
        outcomes: JSON.parse(m.outcomes),
        volume: parseFloat(m.volumeNum),
        volume24h: parseFloat(m.volume24hr),
        volume1wk: parseFloat(m.volume1wk),
        liquidity: parseFloat(m.liquidityNum),
        endDate: m.endDateIso,
        acceptingOrders: m.acceptingOrders,
        negRisk: m.negRisk,
        tags: m.events?.[0]?.tags?.map((t) => t.label) || [],
      }))
      .sort((a, b) => b.volume24h - a.volume24h);

    res.json({ ok: true, markets, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/market/:slug", async (req, res) => {
  try {
    const r = await axios.get(`${GAMMA}/markets`, {
      params: { slug: req.params.slug },
      timeout: 10000,
    });
    const m = Array.isArray(r.data) ? r.data[0] : r.data;
    res.json({ ok: true, market: m });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Decision Logs ────────────────────────────────────────────────────────────

app.get("/api/decisions", (req, res) => {
  try {
    if (!fs.existsSync(DECISIONS_DIR)) {
      return res.json({ ok: true, decisions: [] });
    }
    const files = fs.readdirSync(DECISIONS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 50);

    const decisions = files.map((f) => {
      const content = fs.readFileSync(path.join(DECISIONS_DIR, f), "utf8");
      const verdict = content.match(/\*\*Verdict:\*\* (.+)/)?.[1] || "UNKNOWN";
      const question = content.match(/\*\*Question:\*\* (.+)/)?.[1] || f;
      const date = content.match(/\*\*Date:\*\* (.+)/)?.[1] || "";
      return { file: f, verdict, question, date };
    });

    res.json({ ok: true, decisions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/decisions/:file", (req, res) => {
  try {
    const filePath = path.join(DECISIONS_DIR, req.params.file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    res.json({ ok: true, content: fs.readFileSync(filePath, "utf8") });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Status ───────────────────────────────────────────────────────────────────

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    agent: "Polly 🦉",
    version: "0.1.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`🦉 Polly dashboard running at http://localhost:${PORT}`);
});
