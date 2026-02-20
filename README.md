<![CDATA[<div align="center">

# 🛰️ NOAA Space Weather Dashboard

**Real-time satellite operations monitoring powered by NOAA SWPC live feeds**

[![NOAA SWPC](https://img.shields.io/badge/Data%20Source-NOAA%20SWPC-0077b6?style=for-the-badge&logo=noaa)](https://www.swpc.noaa.gov/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A full-stack space weather monitoring system that fetches data **directly from NOAA's Space Weather Prediction Center**, processes 9 live feeds from DSCOVR and GOES satellites, and presents it through a premium dark-themed dashboard with real-time charts, satellite operations risk advisories, and webhook API for automation.

</div>

---

## ✨ Features

### 📊 Live Charts (Tab 1)
- **6 interactive Chart.js graphs** with zoom/pan, auto-refresh every 5 minutes
- **Solar Wind Bz** — Interplanetary Magnetic Field z-component (nT)
- **Solar Wind Speed** — Bulk velocity (km/s)
- **Kp Index** — Planetary geomagnetic activity (bar chart, 0–9 scale)
- **X-Ray Flux** — GOES solar flare intensity (W/m², logarithmic)
- **Proton Flux** — Energetic proton flux ≥10 MeV (pfu, logarithmic)
- **Electron Flux** — Relativistic electron flux ≥2 MeV (pfu, logarithmic)
- **Threshold lines** on every chart showing NOAA alert category levels (G/S/R scales)
- **Hover tooltips** on chart titles explaining each metric for education

### 📋 Detailed Data (Tab 2) — Satellite Operations Grade
- **🛡️ Satellite Operations Advisory** — 7 derived risk assessments computed from live data:

| Hazard | Driver | Why It Matters |
|--------|--------|---------------|
| ⚡ Deep Dielectric Charging | ≥2 MeV electrons | Internal charging from penetrating electrons |
| 🔋 Surface Charging | ≥0.8 MeV electrons + density | Differential potential on spacecraft surfaces |
| 💥 Single Event Upsets (SEU) | ≥100 MeV protons | Bit-flips in electronics from heavy particles |
| ☀️ Solar Panel Degradation | ≥10 MeV protons | Cumulative displacement damage to solar cells |
| 🌊 Atmospheric Drag (LEO) | F10.7 + Kp | Thermospheric density increase from EUV/particle heating |
| 📻 HF Radio Blackout | X-ray flux | D-layer ionospheric absorption on sunlit hemisphere |
| 📡 GPS / Navigation Errors | Kp + protons + aurora | Ionospheric scintillation degrading signal lock |

- **Multi-band radiation data**: Protons at 3 energy levels (≥10, ≥50, ≥100 MeV), electrons at 2 (≥0.8, ≥2 MeV), X-rays at 2 wavelength bands
- **NOAA Scale classifications**: G-scale (geomagnetic storms), S-scale (solar radiation), R-scale (radio blackouts)
- **Computed fields**: Dynamic pressure (nPa), solar wind speed category, shielding assessments, EVA risk
- **Plain-English operational advice** per category (e.g. "Consider safe-mode for vulnerable subsystems")

### 🚨 Alert Center (Tab 3)
- Per-metric proximity bars showing how close each value is to its threshold
- Color-coded **🔔 YES / 🔕 No** verdict per metric
- Severity classifications: NOMINAL → WATCH → WARNING → CRITICAL

### 🔗 Sources (Tab 4)
- Complete list of all 9 NOAA feed URLs with format, update rate, and clickable links
- Documentation on satellite sources (DSCOVR, GOES-16/18), polling policy, and data license

### 🌐 Additional Features
- **Dual timezone display**: 🇸🇬 Singapore (SGT) + 🌐 UTC (NOAA source) live-ticking clocks
- **Webhook API** for n8n / Telegram / Slack automation
- **Monochrome dark theme** (black/white/grey) with colorful charts
- **CLI mode** for headless extraction to JSON files

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm (included with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/DSeahYS/NOAA-Web-Extraction.git
cd NOAA-Web-Extraction

# Install dependencies
npm install

# Start the dashboard
node server.js
```

Open **http://localhost:3000** in your browser.

### CLI Mode (headless)

```bash
# Run single extraction to data/latest.json
node index.js

# Run with 30-minute cron polling
node index.js --cron
```

---

## 📡 Data Sources

All data is fetched **directly from NOAA's Space Weather Prediction Center** — zero third-party intermediaries.

| Feed | Source | Update Rate |
|------|--------|-------------|
| Solar Wind — Magnetic Field | DSCOVR at L1 | ~1 min |
| Solar Wind — Plasma | DSCOVR at L1 | ~1 min |
| Kp Index (1-min estimate) | Derived | ~1 min |
| Kp Index (3-hour official) | Magnetometer network | ~3 hr |
| X-Ray Flux | GOES-16/18 | ~1 min |
| Proton Flux (multi-band) | GOES-16/18 | ~5 min |
| Electron Flux (multi-band) | GOES-16/18 | ~5 min |
| F10.7 cm Solar Radio Flux | Penticton Observatory | ~daily |
| Aurora Hemispheric Power | OVATION model | ~5 min |

---

## 🔌 Webhook API

The server exposes REST endpoints for external automation (n8n, Telegram bots, Zapier, etc.):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Full JSON snapshot — all feeds, metrics, alerts |
| `/api/alerts` | GET | Alerts only — `has_alerts`, `alert_count`, messages |
| `/api/data` | GET | Raw extracted data without metrics/alerts |
| `/api/metrics` | GET | Computed metrics with status classifications |
| `/api/history/sw` | GET | 24h solar wind history (mag + plasma) |
| `/api/history/kp` | GET | 24h Kp index history |
| `/api/history/xray` | GET | 24h X-ray flux history |
| `/api/history/proton` | GET | 24h proton flux history |
| `/api/history/electron` | GET | 24h electron flux history |
| `/post/fetch` | POST | Trigger manual re-fetch from NOAA |

### Example: Get alerts

```bash
curl http://localhost:3000/api/alerts | jq
```

```json
{
  "has_alerts": true,
  "alert_count": 1,
  "alerts": [
    {
      "metric": "Electron Flux",
      "severity": "WARNING",
      "message": "🟠 Deep Dielectric Charging: 3,645 pfu vs 1,000 threshold"
    }
  ]
}
```

---

## 🏗️ Architecture

```
NOAA-Web-Extraction/
├── server.js          # Express server — API routes, static serving, 30-min cron
├── extractor.js       # NOAA feed fetcher — 9 feeds, multi-band extraction
├── alerts.js          # Alert engine — threshold evaluation, NOAA scale mapping
├── index.js           # CLI entry point — single run or cron mode
├── package.json       # Dependencies: node-fetch, node-cron, express, cors
└── public/
    └── index.html     # Dashboard — Chart.js, 4 tabs, dual clocks, risk advisories
```

### Data Flow

```
NOAA SWPC (services.swpc.noaa.gov)
    │
    ▼ HTTP fetch (9 feeds in parallel)
extractor.js → fetchAll() → unified data object
    │
    ▼ Threshold evaluation
alerts.js → checkAlerts() → severity classifications + NOAA scales
    │
    ├─▶ server.js (Express) → REST API + static dashboard
    │       │
    │       ▼
    │   index.html (browser) → Chart.js rendering + risk advisories
    │
    └─▶ index.js (CLI) → data/latest.json
```

---

## 🛡️ Understanding the Risk Advisories

The Satellite Operations Advisory panel computes **derived risk levels** from raw sensor data. Here's how each assessment works:

| Risk | Input Data | Low | Moderate | High | Extreme |
|------|-----------|-----|----------|------|---------|
| Deep Dielectric Charging | ≥2 MeV e⁻ flux | <100 pfu | ≥100 | ≥1,000 | ≥10,000 |
| Surface Charging | ≥0.8 MeV e⁻ + density | <1,000 pfu | ≥1,000 | ≥5,000 | ≥50,000 |
| Single Event Upsets | ≥100 MeV p⁺ flux | <0.5 pfu | ≥0.5 | ≥1 | ≥10 |
| Solar Panel Damage | ≥10 MeV p⁺ flux | <10 pfu | ≥10 | ≥100 | ≥1,000 |
| Atmospheric Drag | F10.7 + Kp×15 | <120 | ≥120 | ≥180 | ≥250 |
| HF Radio Blackout | X-ray flux (W/m²) | <1e-5 | ≥1e-5 (M) | ≥1e-4 (X) | ≥1e-3 |
| GPS Errors | Kp + proton + aurora | composite <5 | ≥5 | ≥7 | ≥9 |

---

## 📜 License

This project is open source. All NOAA data is in the **public domain** and free to use without restriction.

---

<div align="center">

**Built with data from [NOAA's Space Weather Prediction Center](https://www.swpc.noaa.gov/)**

*Protecting satellites, one data point at a time* 🛰️

</div>
]]>
