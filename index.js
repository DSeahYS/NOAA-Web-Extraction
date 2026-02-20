/**
 * NOAA Space Weather Live Extraction — Entry Point
 * 
 * Usage:
 *   npm start          — Runs one fetch, then schedules every 30 minutes
 *   npm run fetch      — Runs a single one-shot fetch and exits
 *   node index.js --once — Same as above
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const extractor = require('./extractor');
const alerts = require('./alerts');

const DATA_DIR = path.join(__dirname, 'data');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const LOG_FILE = path.join(DATA_DIR, 'history.jsonl');

// ─── Console Report ──────────────────────────────────────────────────────────

function printReport(result, evaluation) {
    const d = result.data;
    const m = evaluation.metrics;

    console.log('\n' + '═'.repeat(72));
    console.log('  🛰️  NOAA SPACE WEATHER STATUS REPORT');
    console.log('  📅  ' + result.extraction_time);
    console.log('═'.repeat(72));

    // Active Alerts
    if (evaluation.alerts.length > 0) {
        console.log('\n  ⚡ ACTIVE ALERTS:');
        evaluation.alerts.forEach((a) => {
            console.log(`    ${a.severity.emoji} [${a.severity.label}] ${a.message}`);
        });
    } else {
        console.log('\n  ✅ No active alerts — all systems nominal.');
    }

    console.log('\n' + '─'.repeat(72));
    console.log('  📊 METRIC SUMMARY');
    console.log('─'.repeat(72));

    // Solar Wind
    const sw = m.solar_wind;
    console.log(`\n  ${sw.status.emoji} Solar Wind (DSCOVR)`);
    console.log(`     Bz GSM:  ${fmt(d.solar_wind_mag?.bz_gsm)} nT  (alert ≤ ${sw.bz_threshold})`);
    console.log(`     Speed:   ${fmt(d.solar_wind_plasma?.speed)} km/s (alert > ${sw.speed_threshold})`);
    console.log(`     Density: ${fmt(d.solar_wind_plasma?.density)} p/cm³`);
    if (d.solar_wind_mag?.time_tag) console.log(`     Data at: ${d.solar_wind_mag.time_tag}`);

    // Kp Index
    const kpm = m.kp_index;
    console.log(`\n  ${kpm.status.emoji} Kp Index`);
    console.log(`     Kp:      ${fmt(d.kp_index_1m?.kp_index)}  (storm ≥ ${kpm.threshold_minor}, severe ≥ ${kpm.threshold_severe})`);
    console.log(`     Est Kp:  ${fmt(d.kp_index_1m?.estimated_kp)}`);
    if (d.kp_index_official) {
        console.log(`     Official: Kp = ${d.kp_index_official.kp} (3-hour)`);
    }

    // X-Ray Flux
    const xm = m.xray_flux;
    console.log(`\n  ${xm.status.emoji} X-Ray Flux (Solar Flares)`);
    console.log(`     Flux:    ${d.xray_flux?.flux?.toExponential(2) || 'N/A'} W/m²`);
    console.log(`     Class:   ${xm.flare_class}`);
    console.log(`     M-class: ≥${xm.threshold_m}  |  X-class: ≥${xm.threshold_x}`);

    // Proton Flux
    const pm = m.proton_flux;
    console.log(`\n  ${pm.status.emoji} Proton Flux (≥10 MeV)`);
    console.log(`     Flux:    ${fmt(pm.flux)} pfu  (S1 storm ≥ ${pm.threshold})`);

    // Electron Flux
    const em = m.electron_flux;
    console.log(`\n  ${em.status.emoji} Electron Flux (≥2 MeV)`);
    console.log(`     Flux:    ${fmt(em.flux)} pfu  (charging alert ≥ ${em.threshold})`);

    // F10.7
    const fm = m.f107_flux;
    console.log(`\n  ${fm.status.emoji} F10.7 cm Radio Flux`);
    console.log(`     Flux:    ${fmt(fm.flux)} SFU  (high drag ≥ ${fm.threshold})`);

    // Aurora
    const am = m.aurora_power;
    console.log(`\n  ${am.status.emoji} Aurora Hemispheric Power`);
    console.log(`     Power:   ${fmt(am.hemispheric_power_gw)} GW  (active ≥ ${am.threshold})`);

    // Errors
    if (result.errors.length > 0) {
        console.log('\n' + '─'.repeat(72));
        console.log('  ❌ FEED ERRORS:');
        result.errors.forEach((e) => {
            console.log(`     • ${e.feed}: ${e.error}`);
        });
    }

    console.log('\n' + '═'.repeat(72));
    console.log(`  💾 Data saved to: ${LATEST_FILE}`);
    console.log('═'.repeat(72) + '\n');
}

function fmt(val) {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') return isNaN(val) ? 'N/A' : val.toString();
    return val.toString();
}

// ─── Data Persistence ────────────────────────────────────────────────────────

function saveData(result, evaluation) {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Build output object
    const output = {
        ...result,
        alerts: evaluation.alerts.map(a => ({
            id: a.id,
            severity: a.severity.label,
            message: a.message,
            details: a.details,
        })),
        metrics_status: Object.fromEntries(
            Object.entries(evaluation.metrics).map(([k, v]) => [k, v.status.label])
        ),
    };

    // Write latest.json
    fs.writeFileSync(LATEST_FILE, JSON.stringify(output, null, 2), 'utf-8');

    // Append to history log (JSONL)
    const logLine = JSON.stringify({
        time: result.extraction_time,
        alerts: output.alerts.length,
        statuses: output.metrics_status,
    });
    fs.appendFileSync(LOG_FILE, logLine + '\n', 'utf-8');
}

// ─── Main Cycle ──────────────────────────────────────────────────────────────

async function runCycle() {
    console.log(`\n[${new Date().toISOString()}] Starting data extraction...`);
    try {
        const result = await extractor.fetchAll();
        const evaluation = alerts.evaluate(result.data);
        printReport(result, evaluation);
        saveData(result, evaluation);
    } catch (err) {
        console.error(`[ERROR] Extraction cycle failed: ${err.message}`);
        console.error(err.stack);
    }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
    const isOneShot = process.argv.includes('--once');

    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│  🛰️  NOAA Space Weather Live Data Extraction System         │');
    console.log('│  Polling 9 feeds from services.swpc.noaa.gov                │');
    console.log(`│  Mode: ${isOneShot ? 'One-shot fetch' : '30-minute scheduled polling'}                        │`);
    console.log('└──────────────────────────────────────────────────────────────┘');

    // Run immediately
    await runCycle();

    if (!isOneShot) {
        // Schedule every 30 minutes
        console.log('\n⏱️  Scheduler active — next fetch in 30 minutes.');
        console.log('   Press Ctrl+C to stop.\n');
        cron.schedule('*/30 * * * *', runCycle);
    }
}

main().catch(console.error);
