<div align="center">

# 🛰️ NOAA Space Weather Dashboard

**Real-time satellite operations monitoring powered by NOAA SWPC live feeds**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A full-stack space weather monitoring system that fetches data **directly from NOAA's Space Weather Prediction Center**, processes 9 live feeds from DSCOVR and GOES satellites, and presents it through a premium dark-themed dashboard with real-time charts, satellite operations risk advisories, and a webhook API for automation.

</div>

---

## ✨ Features

### 📊 Live Charts (Tab 1)

Six interactive Chart.js graphs with zoom, pan, and auto-refresh every 5 minutes:

- **Solar Wind Bz** — Interplanetary Magnetic Field z-component (nT)
- **Solar Wind Speed** — Bulk velocity (km/s)
- **Kp Index** — Planetary geomagnetic activity (bar chart, 0–9 scale)
- **X-Ray Flux** — GOES solar flare intensity (W/m², logarithmic)
- **Proton Flux** — Energetic proton flux ≥10 MeV (pfu, logarithmic)
- **Electron Flux** — Relativistic electron flux ≥2 MeV (pfu, logarithmic)

Every chart includes **threshold lines** showing NOAA alert category levels (G/S/R scales) and **hover tooltips** on titles that explain the metric.

### 📋 Detailed Data (Tab 2) — Satellite Operations Grade

A **Satellite Operations Advisory** panel with 7 derived risk assessments, computed in real-time:

| Hazard | Driver | Why It Matters |
|--------|--------|---------------|
| ⚡ Deep Dielectric Charging | ≥2 MeV electrons | Internal charging from penetrating electrons |
| 🔋 Surface Charging | ≥0.8 MeV electrons + density | Differential potential on spacecraft surfaces |
| 💥 Single Event Upsets (SEU) | ≥100 MeV protons | Bit-flips in electronics from heavy particles |
| ☀️ Solar Panel Degradation | ≥10 MeV protons | Cumulative displacement damage to solar cells |
| 🌊 Atmospheric Drag (LEO) | F10.7 + Kp | Thermospheric density increase from EUV heating |
| 📻 HF Radio Blackout | X-ray flux | D-layer ionospheric absorption on sunlit side |
| 📡 GPS / Navigation Errors | Kp + protons + aurora | Ionospheric scintillation degrading signal lock |

Also includes:

- **Multi-band radiation data** — Protons at 3 energy levels (≥10, ≥50, ≥100 MeV), electrons at 2 (≥0.8, ≥2 MeV), X-rays at 2 wavelength bands
- **NOAA Scale classifications** — G-scale (geomagnetic storms), S-scale (solar radiation), R-scale (radio blackouts)
- **Computed fields** — Dynamic pressure (nPa), solar wind speed category, shielding assessments, EVA risk
- **Plain-English operational advice** — e.g. *"Consider safe-mode for vulnerable subsystems"*

### 🚨 Alert Center (Tab 3)

- Per-metric proximity bars showing how close each value is to its alert threshold
- Color-coded verdict per metric: 🔔 **YES** or 🔕 **No**
- Severity classifications: `NOMINAL` → `WATCH` → `WARNING` → `CRITICAL`

### 🔗 Sources (Tab 4)

- Complete list of all 9 NOAA feed URLs with format, update rate, and clickable links
- Documentation on satellite sources (DSCOVR, GOES-16/18), polling policy, and data license

### 🌐 Additional Features

- **Dual timezone display** — 🇸🇬 SGT + 🌐 UTC live-ticking clocks in the header
- **Webhook API** — REST endpoints for n8n, Telegram, Slack automation
- **Monochrome dark theme** — Black/white/grey UI with colorful chart data
- **CLI mode** — Headless extraction to JSON files with optional cron scheduling

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (included with Node.js)

### Installation

```bash
git clone https://github.com/DSeahYS/NOAA-Web-Extraction.git
cd NOAA-Web-Extraction
npm install
node server.js
```

Open **http://localhost:3000** in your browser.

### CLI Mode (headless)

```bash
node index.js            # Single extraction → data/latest.json
node index.js --cron     # Continuous 30-minute polling
```

---

## 📡 Data Sources

All data is fetched **directly from NOAA's Space Weather Prediction Center** with zero third-party intermediaries.

| Feed | Satellite / Source | Update Rate |
|------|--------------------|-------------|
| Solar Wind — Magnetic Field | DSCOVR at L1 | ~1 min |
| Solar Wind — Plasma | DSCOVR at L1 | ~1 min |
| Kp Index (1-min estimate) | Derived | ~1 min |
| Kp Index (3-hour official) | Magnetometer network | ~3 hr |
| X-Ray Flux (2 bands) | GOES-16/18 | ~1 min |
| Proton Flux (3 bands) | GOES-16/18 | ~5 min |
| Electron Flux (2 bands) | GOES-16/18 | ~5 min |
| F10.7 cm Solar Radio Flux | Penticton Observatory | ~daily |
| Aurora Hemispheric Power | OVATION model | ~5 min |

---

## 🔌 Webhook API

REST endpoints for external automation:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | `GET` | Full JSON snapshot — all feeds, metrics, alerts |
| `/api/alerts` | `GET` | Alerts only — `has_alerts`, `alert_count`, messages |
| `/api/data` | `GET` | Raw extracted data without metrics or alerts |
| `/api/metrics` | `GET` | Computed metrics with status classifications |
| `/api/history/sw` | `GET` | 24h solar wind history (mag + plasma) |
| `/api/history/kp` | `GET` | 24h Kp index history |
| `/api/history/xray` | `GET` | 24h X-ray flux history |
| `/api/history/proton` | `GET` | 24h proton flux history |
| `/api/history/electron` | `GET` | 24h electron flux history |
| `/api/fetch` | `POST` | Trigger a manual re-fetch from NOAA |

**Example:**

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
      "message": "Deep Dielectric Charging: 3,645 pfu vs 1,000 threshold"
    }
  ]
}
```

---

## 🏗️ Architecture

```
NOAA-Web-Extraction/
├── server.js          # Express server — API routes, static serving, cron
├── extractor.js       # NOAA feed fetcher — 9 feeds, multi-band extraction
├── alerts.js          # Alert engine — thresholds, NOAA G/S/R scale mapping
├── index.js           # CLI entry point — single run or cron mode
├── package.json       # Dependencies: node-fetch, node-cron, express, cors
└── public/
    └── index.html     # Dashboard — Chart.js, 4 tabs, clocks, risk advisories
```

**Data Flow:**

```
NOAA SWPC APIs ──► extractor.js (9 parallel fetches)
                        │
                        ▼
                   alerts.js (threshold evaluation)
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
         server.js            index.js
      (Express API +         (CLI mode →
       static dashboard)    data/latest.json)
              │
              ▼
         Browser Dashboard
      (Chart.js + risk advisories)
```

---

## 🛡️ Risk Advisory Thresholds

The Satellite Operations Advisory computes **derived risk levels** from raw sensor data:

| Risk | Input | Low | Moderate | High | Extreme |
|------|-------|-----|----------|------|---------|
| Deep Dielectric Charging | ≥2 MeV e⁻ (pfu) | &lt;100 | ≥100 | ≥1,000 | ≥10,000 |
| Surface Charging | ≥0.8 MeV e⁻ (pfu) | &lt;1,000 | ≥1,000 | ≥5,000 | ≥50,000 |
| Single Event Upsets | ≥100 MeV p⁺ (pfu) | &lt;0.5 | ≥0.5 | ≥1 | ≥10 |
| Solar Panel Damage | ≥10 MeV p⁺ (pfu) | &lt;10 | ≥10 | ≥100 | ≥1,000 |
| Atmospheric Drag | F10.7 + Kp×15 | &lt;120 | ≥120 | ≥180 | ≥250 |
| HF Radio Blackout | X-ray (W/m²) | &lt;1e-5 | ≥1e-5 | ≥1e-4 | ≥1e-3 |
| GPS Errors | Composite score | &lt;5 | ≥5 | ≥7 | ≥9 |

---

## 📜 License

This project is open source under the MIT License. All NOAA data is in the **public domain** and free to use without restriction.

---

<div align="center">

**Built with live data from [NOAA's Space Weather Prediction Center](https://www.swpc.noaa.gov/)**

*Protecting satellites, one data point at a time* 🛰️

</div>
