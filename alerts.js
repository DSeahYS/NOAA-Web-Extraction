/**
 * NOAA Space Weather Alert Evaluator
 * 
 * Evaluates extracted data against NOAA-defined thresholds and returns
 * an array of active alerts plus a per-metric status summary.
 */

// ─── Threshold Definitions ──────────────────────────────────────────────────

const THRESHOLDS = {
    // Geomagnetic storm early warning (solar wind)
    bzSouth: -5,     // nT — southward IMF coupling threshold
    windSpeed: 500,    // km/s — fast solar wind threshold

    // Kp index thresholds
    kpMinorStorm: 5,      // G1 Minor Storm
    kpSevereStorm: 7,      // G3+ Severe Storm

    // X-ray flux thresholds (W/m²)
    mClassFlare: 1e-5,   // M1 = R1 Radio Blackout
    xClassFlare: 1e-4,   // X1 = R3 Radio Blackout

    // Proton flux (>=10 MeV) in pfu
    s1Radiation: 10,     // S1 Radiation Storm

    // Electron flux (>=2 MeV) in pfu
    electronAlert: 1000,   // Deep dielectric charging alert

    // F10.7 solar radio flux in SFU
    highDrag: 150,    // Elevated atmospheric drag for LEO

    // Aurora hemispheric power in GW
    auroraActive: 50,     // Significant aurora
};

// ─── Severity Levels ─────────────────────────────────────────────────────────

const SEV = {
    NOMINAL: { level: 0, emoji: '✅', label: 'NOMINAL' },
    INFO: { level: 1, emoji: '🟢', label: 'INFO' },
    WATCH: { level: 2, emoji: '⚠️', label: 'WATCH' },
    WARNING: { level: 3, emoji: '🟠', label: 'WARNING' },
    CRITICAL: { level: 4, emoji: '🔴', label: 'CRITICAL' },
};

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Evaluate all alert conditions against the extracted data.
 * @param {Object} extracted - The `data` object from extractor.fetchAll()
 * @returns {Object} { alerts: [...], metrics: {...} }
 */
function evaluate(extracted) {
    const alerts = [];
    const metrics = {};

    // 1. Geomagnetic Storm Early Warning (Solar Wind + IMF)
    const bz = extracted.solar_wind_mag?.bz_gsm;
    const speed = extracted.solar_wind_plasma?.speed;
    const bzAlert = bz !== null && bz !== undefined && bz <= THRESHOLDS.bzSouth;
    const speedAlert = speed !== null && speed !== undefined && speed > THRESHOLDS.windSpeed;

    metrics.solar_wind = {
        bz_gsm: bz,
        speed: speed,
        bz_threshold: THRESHOLDS.bzSouth,
        speed_threshold: THRESHOLDS.windSpeed,
        status: (bzAlert && speedAlert) ? SEV.CRITICAL : SEV.NOMINAL,
    };

    if (bzAlert && speedAlert) {
        alerts.push({
            id: 'GEOMAG_STORM_IMMINENT',
            severity: SEV.CRITICAL,
            message: `Geomagnetic storm IMMINENT: Bz=${bz} nT (southward), Speed=${speed} km/s`,
            details: `IMF Bz is strongly southward (≤${THRESHOLDS.bzSouth} nT) AND solar wind speed exceeds ${THRESHOLDS.windSpeed} km/s. Earth's magnetic shield is being breached.`,
        });
    }

    // 2. Kp Index (Official Geomagnetic Storm Level)
    const kp = extracted.kp_index_1m?.kp_index;
    let kpSev = SEV.NOMINAL;
    if (kp !== null && kp !== undefined) {
        if (kp >= THRESHOLDS.kpSevereStorm) kpSev = SEV.CRITICAL;
        else if (kp >= THRESHOLDS.kpMinorStorm) kpSev = SEV.WARNING;
    }

    metrics.kp_index = {
        kp_index: kp,
        estimated_kp: extracted.kp_index_1m?.estimated_kp,
        threshold_minor: THRESHOLDS.kpMinorStorm,
        threshold_severe: THRESHOLDS.kpSevereStorm,
        status: kpSev,
    };

    if (kpSev.level >= SEV.WARNING.level) {
        const scale = kp >= 9 ? 'G5 Extreme' : kp >= 8 ? 'G4 Severe' : kp >= 7 ? 'G3 Strong' : kp >= 6 ? 'G2 Moderate' : 'G1 Minor';
        alerts.push({
            id: 'GEOMAG_STORM_ACTIVE',
            severity: kpSev,
            message: `Geomagnetic storm ACTIVE: Kp=${kp} (${scale})`,
            details: `Kp index ≥${THRESHOLDS.kpMinorStorm}. Expect satellite drag increases, GPS degradation, and possible aurora at lower latitudes.`,
        });
    }

    // 3. X-Ray Flux (Solar Flare / Radio Blackout)
    const xFlux = extracted.xray_flux?.flux;
    let xSev = SEV.NOMINAL;
    if (xFlux !== null && xFlux !== undefined) {
        if (xFlux >= THRESHOLDS.xClassFlare) xSev = SEV.CRITICAL;
        else if (xFlux >= THRESHOLDS.mClassFlare) xSev = SEV.WARNING;
    }

    const flareClass = xFlux ? classifyFlare(xFlux) : 'N/A';
    metrics.xray_flux = {
        flux: xFlux,
        flare_class: flareClass,
        threshold_m: THRESHOLDS.mClassFlare,
        threshold_x: THRESHOLDS.xClassFlare,
        status: xSev,
    };

    if (xSev.level >= SEV.WARNING.level) {
        const rScale = xFlux >= THRESHOLDS.xClassFlare ? 'R3+ Radio Blackout' : 'R1 Radio Blackout';
        alerts.push({
            id: 'RADIO_BLACKOUT',
            severity: xSev,
            message: `Solar flare detected: ${flareClass} (${rScale})`,
            details: `X-ray flux = ${xFlux?.toExponential(2)} W/m². HF radio communications on the sunlit side of Earth may be degraded or blacked out.`,
        });
    }

    // 4. Proton Flux (Radiation Storm)
    const pFlux = extracted.proton_flux?.flux;
    let pSev = SEV.NOMINAL;
    if (pFlux !== null && pFlux !== undefined && pFlux >= THRESHOLDS.s1Radiation) {
        pSev = SEV.WARNING;
    }

    metrics.proton_flux = {
        flux: pFlux,
        energy: '>=10 MeV',
        threshold: THRESHOLDS.s1Radiation,
        status: pSev,
    };

    if (pSev.level >= SEV.WARNING.level) {
        alerts.push({
            id: 'RADIATION_STORM',
            severity: pSev,
            message: `Radiation storm (S1+): Proton flux = ${pFlux?.toFixed(1)} pfu (>=10 MeV)`,
            details: `High-energy protons exceeding ${THRESHOLDS.s1Radiation} pfu. Risk of satellite memory bit-flips (SEUs), solar panel degradation, and radiation hazard.`,
        });
    }

    // 5. Electron Flux (Deep Dielectric Charging)
    const eFlux = extracted.electron_flux?.flux;
    let eSev = SEV.NOMINAL;
    if (eFlux !== null && eFlux !== undefined && eFlux >= THRESHOLDS.electronAlert) {
        eSev = SEV.WARNING;
    }

    metrics.electron_flux = {
        flux: eFlux,
        energy: '>=2 MeV',
        threshold: THRESHOLDS.electronAlert,
        status: eSev,
    };

    if (eSev.level >= SEV.WARNING.level) {
        alerts.push({
            id: 'DIELECTRIC_CHARGING',
            severity: eSev,
            message: `Deep dielectric charging risk: Electron flux = ${eFlux?.toFixed(0)} pfu (>=2 MeV)`,
            details: `High-energy electrons exceeding ${THRESHOLDS.electronAlert} pfu. Spacecraft internal charging may cause arcing and short circuits.`,
        });
    }

    // 6. F10.7 (Atmospheric Drag)
    const f107 = extracted.f107_flux?.flux;
    let fSev = SEV.NOMINAL;
    if (f107 !== null && f107 !== undefined && f107 >= THRESHOLDS.highDrag) {
        fSev = SEV.WATCH;
    }

    metrics.f107_flux = {
        flux: f107,
        unit: 'SFU',
        threshold: THRESHOLDS.highDrag,
        status: fSev,
    };

    if (fSev.level >= SEV.WATCH.level) {
        alerts.push({
            id: 'HIGH_ATMOSPHERIC_DRAG',
            severity: fSev,
            message: `Elevated atmospheric drag: F10.7 = ${f107} SFU`,
            details: `F10.7 cm flux ≥${THRESHOLDS.highDrag} SFU. Upper atmosphere is expanding; LEO satellites may experience increased orbital decay.`,
        });
    }

    // 7. Aurora Hemispheric Power
    const aurGW = extracted.aurora_power?.hemispheric_power_gw;
    let aSev = SEV.NOMINAL;
    if (aurGW !== null && aurGW !== undefined && aurGW >= THRESHOLDS.auroraActive) {
        aSev = SEV.INFO;
    }

    metrics.aurora_power = {
        hemispheric_power_gw: aurGW,
        threshold: THRESHOLDS.auroraActive,
        status: aSev,
    };

    if (aSev.level >= SEV.INFO.level) {
        alerts.push({
            id: 'AURORA_ACTIVE',
            severity: aSev,
            message: `Aurora active: Hemispheric power = ${aurGW} GW`,
            details: `Hemispheric power ≥${THRESHOLDS.auroraActive} GW. Significant aurora is occurring in the polar regions.`,
        });
    }

    // Sort alerts by severity (highest first)
    alerts.sort((a, b) => b.severity.level - a.severity.level);

    return { alerts, metrics };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Classify X-ray flux into standard solar flare class (A, B, C, M, X).
 */
function classifyFlare(flux) {
    if (flux >= 1e-4) {
        const num = flux / 1e-4;
        return `X${num.toFixed(1)}`;
    } else if (flux >= 1e-5) {
        const num = flux / 1e-5;
        return `M${num.toFixed(1)}`;
    } else if (flux >= 1e-6) {
        const num = flux / 1e-6;
        return `C${num.toFixed(1)}`;
    } else if (flux >= 1e-7) {
        const num = flux / 1e-7;
        return `B${num.toFixed(1)}`;
    } else {
        const num = flux / 1e-8;
        return `A${num.toFixed(1)}`;
    }
}

module.exports = { evaluate, THRESHOLDS, SEV, classifyFlare };
