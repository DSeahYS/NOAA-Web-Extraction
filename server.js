/**
 * NOAA Space Weather Web Dashboard + Webhook API Server
 * 
 * Serves a premium dark-theme dashboard with live charts,
 * detailed data, alert categorization, and JSON webhook endpoints.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const extractor = require('./extractor');
const alerts = require('./alerts');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Key Authentication ──────────────────────────────────────────────────

// Serve the API key to the dashboard (same-origin page only)
// The dashboard fetches this once on load and uses it for all API calls
app.get('/auth/key', (req, res) => {
    res.json({ key: API_KEY || '' });
});

// Protect /api/* routes when API_KEY is set
app.use('/api', (req, res, next) => {
    if (!API_KEY) return next(); // No key configured = open access (dev mode)
    const provided = req.headers['x-api-key'] || req.query.key;
    if (provided === API_KEY) return next();
    res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
});

// ─── In-Memory Cache ─────────────────────────────────────────────────────────

let latestData = null;
let latestEvaluation = null;
let historyData = null;
let lastFetchTime = null;

// ─── Data Fetch Cycle ────────────────────────────────────────────────────────

async function runCycle() {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Fetching NOAA data...`);
    try {
        const [result, history] = await Promise.all([
            extractor.fetchAll(),
            extractor.fetchRawHistory(),
        ]);
        latestData = result;
        latestEvaluation = alerts.evaluate(result.data);
        historyData = history;
        lastFetchTime = new Date().toISOString();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${lastFetchTime}] ✅ Data fetched in ${elapsed}s — ${latestEvaluation.alerts.length} alert(s) active`);
    } catch (err) {
        console.error(`[ERROR] Fetch cycle failed: ${err.message}`);
    }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// Full JSON snapshot (webhook endpoint for n8n)
app.get('/api/status', (req, res) => {
    if (!latestData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({
        ...latestData,
        alerts: latestEvaluation.alerts.map(a => ({
            id: a.id, severity: a.severity.label, emoji: a.severity.emoji,
            message: a.message, details: a.details,
        })),
        metrics: Object.fromEntries(
            Object.entries(latestEvaluation.metrics).map(([k, v]) => [k, {
                ...v, status: v.status.label, status_emoji: v.status.emoji,
            }])
        ),
        last_fetch: lastFetchTime,
    });
});

// Alerts-only endpoint (for Telegram bot filtering)
app.get('/api/alerts', (req, res) => {
    if (!latestEvaluation) return res.status(503).json({ error: 'Data not yet loaded' });
    const hasAlerts = latestEvaluation.alerts.length > 0;
    res.json({
        has_alerts: hasAlerts,
        alert_count: latestEvaluation.alerts.length,
        highest_severity: hasAlerts ? latestEvaluation.alerts[0].severity.label : 'NOMINAL',
        alerts: latestEvaluation.alerts.map(a => ({
            id: a.id, severity: a.severity.label, emoji: a.severity.emoji,
            message: a.message, details: a.details,
        })),
        extraction_time: latestData?.extraction_time,
    });
});

// Chart history endpoints
app.get('/api/history/solar-wind', (req, res) => {
    if (!historyData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({ mag: historyData.solarWindMag, plasma: historyData.solarWindPlasma });
});

app.get('/api/history/kp', (req, res) => {
    if (!historyData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({ kp: historyData.kpIndex });
});

app.get('/api/history/xrays', (req, res) => {
    if (!historyData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({ xrays: historyData.xrays });
});

app.get('/api/history/protons', (req, res) => {
    if (!historyData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({ protons: historyData.protons });
});

app.get('/api/history/electrons', (req, res) => {
    if (!historyData) return res.status(503).json({ error: 'Data not yet loaded' });
    res.json({ electrons: historyData.electrons });
});

// Manual re-fetch trigger
app.post('/api/fetch', async (req, res) => {
    await runCycle();
    res.json({ success: true, last_fetch: lastFetchTime });
});

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│  🛰️  NOAA Space Weather Dashboard Server                    │');
    console.log(`│  http://localhost:${PORT}                                      │`);
    console.log('│  Polling 9 feeds every 30 minutes                           │');
    console.log('└──────────────────────────────────────────────────────────────┘');

    // Initial fetch
    await runCycle();

    // Schedule every 30 minutes
    cron.schedule('*/30 * * * *', runCycle);

    app.listen(PORT, () => {
        console.log(`\n🌐 Dashboard: http://localhost:${PORT}`);
        console.log(`📡 Webhook:   http://localhost:${PORT}/api/status`);
        console.log(`🚨 Alerts:    http://localhost:${PORT}/api/alerts`);
        console.log('\n⏱️  Next auto-fetch in 30 minutes. Press Ctrl+C to stop.\n');
    });
}

main().catch(console.error);
