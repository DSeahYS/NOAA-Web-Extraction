/**
 * NOAA SWPC Space Weather Data Extractor
 * 
 * Fetches 8 JSON feeds + 1 text feed from NOAA's Space Weather Prediction Center,
 * extracts the latest valid data points (handling null dropouts), and returns
 * a unified data object.
 */

const fetch = require('node-fetch');

// ─── Feed URLs ───────────────────────────────────────────────────────────────

const FEEDS = {
    // Solar Wind (DSCOVR) — Array-of-arrays, row 0 = header
    solarWindMag: 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
    solarWindPlasma: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',

    // Kp Index (1-minute estimates) — Array-of-objects
    kpIndex1m: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',

    // Kp Index (official 3-hour) — Array-of-arrays, row 0 = header
    kpIndexOfficial: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',

    // GOES X-Ray Flux (1-day) — Array-of-objects
    xrays: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json',

    // GOES Proton Flux — Array-of-objects
    protons: 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-3-day.json',

    // GOES Electron Flux — Array-of-objects
    electrons: 'https://services.swpc.noaa.gov/json/goes/primary/integral-electrons-3-day.json',
    // The differential feed contains the 865 keV band (modern replacement for 0.8 MeV)
    electronsDiff: 'https://services.swpc.noaa.gov/json/goes/primary/differential-electrons-3-day.json',

    // F10.7 cm Solar Radio Flux — Array-of-objects
    f107: 'https://services.swpc.noaa.gov/json/f107_cm_flux.json',

    // Aurora Hemispheric Power — Plain text
    aurora: 'https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt',
};

const USER_AGENT = 'NOAASpaceWeatherExtractor/1.0 (spaceweather@example.com)';
const FETCH_TIMEOUT_MS = 15000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with timeout and user-agent.
 */
async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetch plain text from a URL.
 */
async function fetchText(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        return await res.text();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * From an array-of-arrays (with header at index 0), get the last row
 * where the value at `colIndex` is not null/empty. Steps back up to
 * `maxSteps` rows to handle telemetry dropouts.
 */
function getLastValidRow(arr, colIndex, maxSteps = 5) {
    if (!arr || arr.length < 2) return null;
    for (let i = arr.length - 1; i >= Math.max(1, arr.length - maxSteps); i--) {
        const row = arr[i];
        if (row && row[colIndex] !== null && row[colIndex] !== '' && row[colIndex] !== undefined) {
            return row;
        }
    }
    return arr[arr.length - 1]; // fallback
}

/**
 * From an array-of-objects, find the last item matching an optional
 * filter (e.g. energy band), where `field` is non-null.
 */
function getLastValidObject(arr, field, filter = null, maxSteps = 10) {
    if (!arr || arr.length === 0) return null;
    // Walk backward
    for (let i = arr.length - 1; i >= Math.max(0, arr.length - maxSteps); i--) {
        const item = arr[i];
        if (filter && !filter(item)) continue;
        if (item[field] !== null && item[field] !== undefined && item[field] !== '') {
            return item;
        }
    }
    return null;
}

/**
 * From the array-of-objects feeds that contain multiple energy channels
 * per timestamp, we need to search backward through timestamps (not just
 * array indices) to find the latest valid reading for a specific energy.
 */
function getLastValidByEnergy(arr, energyLabel, maxMinutes = 5) {
    if (!arr || arr.length === 0) return null;
    // Walk backward looking for matching energy with valid flux
    for (let i = arr.length - 1; i >= Math.max(0, arr.length - (maxMinutes * 10)); i--) {
        const item = arr[i];
        if (item.energy === energyLabel && item.flux !== null && item.flux !== undefined) {
            return item;
        }
    }
    return null;
}

/**
 * Parse the aurora hemispheric power text file.
 * Grabs the last number from the last non-empty data line.
 */
function parseAuroraText(text) {
    if (!text) return null;
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length === 0) return null;

    // Walk backward to find last line with actual data
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        const lastVal = parseFloat(parts[parts.length - 1]);
        if (!isNaN(lastVal)) {
            return { value: lastVal, line: line };
        }
    }
    return null;
}

// ─── Main Extraction ─────────────────────────────────────────────────────────

/**
 * Fetch all feeds in parallel and return a unified data object.
 */
async function fetchAll() {
    const timestamp = new Date().toISOString();
    const errors = [];

    // Fire all requests in parallel
    const results = await Promise.allSettled([
        fetchJSON(FEEDS.solarWindMag),       // 0
        fetchJSON(FEEDS.solarWindPlasma),     // 1
        fetchJSON(FEEDS.kpIndex1m),           // 2
        fetchJSON(FEEDS.kpIndexOfficial),     // 3
        fetchJSON(FEEDS.xrays),              // 4
        fetchJSON(FEEDS.protons),            // 5
        fetchJSON(FEEDS.electrons),          // 6
        fetchJSON(FEEDS.electronsDiff),      // 7
        fetchJSON(FEEDS.f107),               // 8
        fetchText(FEEDS.aurora),             // 9
    ]);

    function getResult(idx, name) {
        if (results[idx].status === 'fulfilled') return results[idx].value;
        errors.push({ feed: name, error: results[idx].reason?.message || 'Unknown error' });
        return null;
    }

    const magData = getResult(0, 'Solar Wind Mag');
    const plasmaData = getResult(1, 'Solar Wind Plasma');
    const kp1mData = getResult(2, 'Kp Index 1m');
    const kpOffData = getResult(3, 'Kp Index Official');
    const xrayData = getResult(4, 'X-Ray Flux');
    const protonData = getResult(5, 'Proton Flux');
    const electronData = getResult(6, 'Electron Flux');
    const electronDiffData = getResult(7, 'Electron Flux (Differential)');
    const f107Data = getResult(8, 'F10.7 Flux');
    const auroraText = getResult(9, 'Aurora Power') || '';

    // ── Extract Solar Wind Magnetic Field ──
    // Format: array-of-arrays, header = ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"]
    const magRow = getLastValidRow(magData, 3); // bz_gsm at index 3
    const solarWindMag = magRow ? {
        time_tag: magRow[0],
        bx_gsm: parseFloat(magRow[1]),
        by_gsm: parseFloat(magRow[2]),
        bz_gsm: parseFloat(magRow[3]),
        bt: parseFloat(magRow[6]),
    } : null;

    // ── Extract Solar Wind Plasma ──
    // Format: array-of-arrays, header = ["time_tag","density","speed","temperature"]
    const plasmaRow = getLastValidRow(plasmaData, 2); // speed at index 2
    const solarWindPlasma = plasmaRow ? {
        time_tag: plasmaRow[0],
        density: parseFloat(plasmaRow[1]),
        speed: parseFloat(plasmaRow[2]),
        temperature: parseFloat(plasmaRow[3]),
    } : null;

    // ── Extract Kp Index (1-minute estimate) ──
    const kp1mItem = getLastValidObject(kp1mData, 'kp_index');
    const kpIndex1m = kp1mItem ? {
        time_tag: kp1mItem.time_tag,
        kp_index: kp1mItem.kp_index,
        estimated_kp: kp1mItem.estimated_kp,
    } : null;

    // ── Extract Kp Index (official 3-hour) ──
    // Format: array-of-arrays, header row at index 0
    const kpOffRow = kpOffData && kpOffData.length > 1 ? kpOffData[kpOffData.length - 1] : null;
    const kpIndexOfficial = kpOffRow ? {
        time_tag: kpOffRow[0],
        kp: kpOffRow[kpOffRow.length - 1],
        kp_value: parseFloat(kpOffRow[kpOffRow.length - 1]),
    } : null;

    // ── Extract X-Ray Flux (both bands) ──
    const xrayItem = getLastValidByEnergy(xrayData, '0.1-0.8nm');
    const xrayFlux = xrayItem ? {
        time_tag: xrayItem.time_tag,
        energy: xrayItem.energy,
        flux: xrayItem.flux,
    } : null;
    const xrayShort = getLastValidByEnergy(xrayData, '0.05-0.4nm');
    const xrayFluxShort = xrayShort ? {
        time_tag: xrayShort.time_tag,
        energy: xrayShort.energy,
        flux: xrayShort.flux,
    } : null;

    // ── Extract Proton Flux (multiple energy bands) ──
    const protonItem = getLastValidByEnergy(protonData, '>=10 MeV');
    const protonFlux = protonItem ? {
        time_tag: protonItem.time_tag,
        energy: protonItem.energy,
        flux: protonItem.flux,
    } : null;
    const proton50 = getLastValidByEnergy(protonData, '>=50 MeV');
    const protonFlux50 = proton50 ? { time_tag: proton50.time_tag, energy: proton50.energy, flux: proton50.flux } : null;
    const proton100 = getLastValidByEnergy(protonData, '>=100 MeV');
    const protonFlux100 = proton100 ? { time_tag: proton100.time_tag, energy: proton100.energy, flux: proton100.flux } : null;

    // ── Extract Electron Flux (multiple energy bands) ──
    const electronItem = getLastValidByEnergy(electronData, '>=2 MeV');
    const electronFlux = electronItem ? {
        time_tag: electronItem.time_tag,
        energy: electronItem.energy,
        flux: electronItem.flux,
    } : null;

    // The ~0.8 MeV band (865 keV) is found in the differential feed
    const electron08 = getLastValidByEnergy(electronDiffData, '865 keV');
    const electronFlux08 = electron08 ? { time_tag: electron08.time_tag, energy: electron08.energy, flux: electron08.flux } : null;

    // ── Extract F10.7 Flux ──
    const f107Item = f107Data && f107Data.length > 0 ? f107Data[f107Data.length - 1] : null;
    const f107Flux = f107Item ? {
        time_tag: f107Item.time_tag,
        flux: f107Item.flux,
    } : null;

    // ── Extract Aurora Hemispheric Power ──
    const auroraParsed = parseAuroraText(auroraText);
    const auroraPower = auroraParsed ? {
        hemispheric_power_gw: auroraParsed.value,
        raw_line: auroraParsed.line,
    } : null;

    return {
        extraction_time: timestamp,
        data: {
            solar_wind_mag: solarWindMag,
            solar_wind_plasma: solarWindPlasma,
            kp_index_1m: kp1mItem,
            kp_index_official: kpIndexOfficial,
            xray_flux: xrayFlux,
            xray_flux_short: xrayFluxShort,
            proton_flux: protonFlux,
            proton_flux_50: protonFlux50,
            proton_flux_100: protonFlux100,
            electron_flux: electronFlux,
            electron_flux_08: electronFlux08,
            f107_flux: f107Flux,
            aurora_power: auroraPower,
        },
        errors,
    };
}

/**
 * Fetch raw 24h history arrays for chart rendering.
 * Returns the full arrays from each feed, transformed into chart-friendly objects.
 */
async function fetchRawHistory() {
    const errors = [];

    const results = await Promise.allSettled([
        fetchJSON(FEEDS.solarWindMag),
        fetchJSON(FEEDS.solarWindPlasma),
        fetchJSON(FEEDS.kpIndex1m),
        fetchJSON(FEEDS.xrays),
        fetchJSON(FEEDS.protons),
        fetchJSON(FEEDS.electrons),
        // fetchJSON(FEEDS.electronsDiff), // History not currently plotted for 0.8 MeV
    ]);

    function getResult(idx, name) {
        if (results[idx].status === 'fulfilled') return results[idx].value;
        errors.push({ feed: name, error: results[idx].reason?.message || 'Unknown error' });
        return null;
    }

    const magRaw = getResult(0, 'Solar Wind Mag');
    const plasmaRaw = getResult(1, 'Solar Wind Plasma');
    const kpRaw = getResult(2, 'Kp Index 1m');
    const xrayRaw = getResult(3, 'X-Ray Flux');
    const protonRaw = getResult(4, 'Proton Flux');
    const electronRaw = getResult(5, 'Electron Flux');

    // Transform mag array-of-arrays → array-of-objects
    const solarWindMag = magRaw ? magRaw.slice(1).map(r => ({
        time: r[0], bx_gsm: parseFloat(r[1]), by_gsm: parseFloat(r[2]),
        bz_gsm: parseFloat(r[3]), bt: parseFloat(r[6]),
    })).filter(r => !isNaN(r.bz_gsm)) : [];

    // Transform plasma array-of-arrays → array-of-objects
    const solarWindPlasma = plasmaRaw ? plasmaRaw.slice(1).map(r => ({
        time: r[0], density: parseFloat(r[1]),
        speed: parseFloat(r[2]), temperature: parseFloat(r[3]),
    })).filter(r => !isNaN(r.speed)) : [];

    // Kp 1m is already array-of-objects
    const kpIndex = kpRaw ? kpRaw.map(r => ({
        time: r.time_tag, kp_index: r.kp_index, estimated_kp: r.estimated_kp,
    })) : [];

    // X-ray: filter to 0.1-0.8nm band
    const xrays = xrayRaw ? xrayRaw.filter(r => r.energy === '0.1-0.8nm').map(r => ({
        time: r.time_tag, flux: r.flux,
    })).filter(r => r.flux !== null) : [];

    // Protons: filter to >=10 MeV
    const protons = protonRaw ? protonRaw.filter(r => r.energy === '>=10 MeV').map(r => ({
        time: r.time_tag, flux: r.flux,
    })).filter(r => r.flux !== null) : [];

    // Electrons: filter to >=2 MeV
    const electrons = electronRaw ? electronRaw.filter(r => r.energy === '>=2 MeV').map(r => ({
        time: r.time_tag, flux: r.flux,
    })).filter(r => r.flux !== null) : [];

    return { solarWindMag, solarWindPlasma, kpIndex, xrays, protons, electrons, errors };
}

module.exports = { fetchAll, fetchRawHistory, FEEDS };
