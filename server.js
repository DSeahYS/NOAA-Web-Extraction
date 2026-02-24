/**
 * NOAA Space Weather Web Dashboard + Webhook API Server
 * 
 * Serves a premium dark-theme dashboard with live charts,
 * detailed data, alert categorization, and JSON webhook endpoints.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const basicAuth = require('express-basic-auth');
const extractor = require('./extractor');
const alerts = require('./alerts');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;

app.use(cors());
app.use(express.json());

// ─── Global Site Authentication ──────────────────────────────────────────────

// If SITE_USER and SITE_PASSWORD are set, lock down the entire site with Basic Auth
const SITE_USER = process.env.SITE_USER;
const SITE_PASSWORD = process.env.SITE_PASSWORD;

if (SITE_USER && SITE_PASSWORD) {
    app.use(basicAuth({
        users: { [SITE_USER]: SITE_PASSWORD },
        challenge: true,
        realm: 'NOAA Space Weather Dashboard',
    }));
}

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

// ─── Smart Cache Engine (Vercel & Blob Compatible) ───────────────────────────

let memoryCache = {
    data: null,
    evaluation: null,
    history: null,
    lastFetchBaseMs: 0
};

let isFetching = false;
let fetchPromise = null;

// TTL: 5 minutes (in milliseconds)
const CACHE_TTL = 5 * 60 * 1000;

async function getFreshData() {
    const now = Date.now();

    // 1. Return memory cache if it's fresh
    if (memoryCache.data && (now - memoryCache.lastFetchBaseMs < CACHE_TTL)) {
        return memoryCache;
    }

    // 2. If already fetching, wait and return that result (thundering herd protection)
    if (isFetching) {
        return await fetchPromise;
    }

    isFetching = true;

    fetchPromise = (async () => {
        try {
            // 2. Fetch new data from NOAA
            console.log(`[${new Date().toISOString()}] Cache stale or missing. Fetching from NOAA...`);
            const startTime = Date.now();
            const [result, history] = await Promise.all([
                extractor.fetchAll(),
                extractor.fetchRawHistory(),
            ]);

            memoryCache = {
                data: result,
                evaluation: alerts.evaluate(result.data),
                history: history,
                lastFetchBaseMs: Date.now()
            };

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[${new Date().toISOString()}] ✅ Data fetched in ${elapsed}s`);

            return memoryCache;
        } catch (err) {
            console.error(`[ERROR] NOAA Fetch failed: ${err.message}`);
            // If fetch fails but we have stale cache, return it rather than crashing
            if (memoryCache.data) {
                console.log('Returning stale memory cache due to fetch error.');
                return memoryCache;
            }
            throw err;
        } finally {
            isFetching = false;
            fetchPromise = null;
        }
    })();

    return await fetchPromise;
}

// ─── API Routes (With Edge Caching Headers) ──────────────────────────────────

// Middleware: Set Vercel Edge caching headers on all API responses
// s-maxage=300 tells the Vercel CDN to cache the response for 5 mins
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    next();
});

// Full JSON snapshot (webhook endpoint for n8n)
app.get('/api/status', async (req, res) => {
    try {
        const c = await getFreshData();
        res.json({
            ...c.data,
            alerts: c.evaluation.alerts.map(a => ({
                id: a.id, severity: a.severity.label, emoji: a.severity.emoji,
                message: a.message, details: a.details,
            })),
            metrics: Object.fromEntries(
                Object.entries(c.evaluation.metrics).map(([k, v]) => [k, {
                    ...v, status: v.status.label, status_emoji: v.status.emoji,
                }])
            ),
            last_fetch: new Date(c.lastFetchBaseMs).toISOString(),
        });
    } catch (e) {
        res.status(503).json({ error: 'Data unavailable', message: e.message });
    }
});

// Alerts-only endpoint (for Telegram bot filtering)
app.get('/api/alerts', async (req, res) => {
    try {
        const c = await getFreshData();
        const hasAlerts = c.evaluation.alerts.length > 0;
        res.json({
            has_alerts: hasAlerts,
            alert_count: c.evaluation.alerts.length,
            highest_severity: hasAlerts ? c.evaluation.alerts[0].severity.label : 'NOMINAL',
            alerts: c.evaluation.alerts.map(a => ({
                id: a.id, severity: a.severity.label, emoji: a.severity.emoji,
                message: a.message, details: a.details,
            })),
            extraction_time: c.data.extraction_time,
        });
    } catch (e) {
        res.status(503).json({ error: 'Data unavailable' });
    }
});

// Chart history endpoints
app.get('/api/history/solar-wind', async (req, res) => {
    try { const c = await getFreshData(); res.json({ mag: c.history.solarWindMag, plasma: c.history.solarWindPlasma }); }
    catch (e) { res.status(503).json({ error: 'Failed' }); }
});

app.get('/api/history/kp', async (req, res) => {
    try { const c = await getFreshData(); res.json({ kp: c.history.kpIndex }); }
    catch (e) { res.status(503).json({ error: 'Failed' }); }
});

app.get('/api/history/xrays', async (req, res) => {
    try { const c = await getFreshData(); res.json({ xrays: c.history.xrays }); }
    catch (e) { res.status(503).json({ error: 'Failed' }); }
});

app.get('/api/history/protons', async (req, res) => {
    try { const c = await getFreshData(); res.json({ protons: c.history.protons }); }
    catch (e) { res.status(503).json({ error: 'Failed' }); }
});

app.get('/api/history/electrons', async (req, res) => {
    try { const c = await getFreshData(); res.json({ electrons: c.history.electrons }); }
    catch (e) { res.status(503).json({ error: 'Failed' }); }
});

// Manual re-fetch trigger (bypass cache)
app.post('/api/fetch', async (req, res) => {
    memoryCache.lastFetchBaseMs = 0; // Invalidate memory cache

    try {
        const c = await getFreshData();
        res.json({ success: true, last_fetch: new Date(c.lastFetchBaseMs).toISOString() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│  🛰️  NOAA Space Weather Server (Serverless-Ready)            │');
    console.log(`│  http://localhost:${PORT}                                      │`);
    console.log('│  On-demand polling with Edge Caching (stale-while-reval)    │');
    console.log('└──────────────────────────────────────────────────────────────┘');

    app.listen(PORT, () => {
        console.log(`\n🌐 Dashboard: http://localhost:${PORT}`);
        console.log(`📡 Webhook:   http://localhost:${PORT}/api/status`);
        console.log(`🚨 Alerts:    http://localhost:${PORT}/api/alerts\n`);
    });
}

main().catch(console.error);
