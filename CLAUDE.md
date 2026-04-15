# CLAUDE.md — GST Tool

## Project Overview

A tool for Indian e-commerce sellers to aggregate sales data from Amazon and Flipkart into a GSTR-1 JSON payload (the GST filing format). The user uploads three files:
- Amazon B2B CSV
- Amazon B2C CSV
- Flipkart XLSX (Sales Report + Cash Back Report sheets)

The backend parses these, normalises records, and returns a GSTR-1-compliant JSON object.

---

## Architecture

```
gsttool/
├── api/
│   └── process.ts        # Vercel serverless function (entry point on Vercel)
├── src/
│   ├── gst/
│   │   ├── gstr1.ts      # Aggregation logic → GSTR-1 payload
│   │   └── types.ts      # Shared GST types (NormalizedSupplyRecord, etc.)
│   ├── parsers/
│   │   ├── amazon.ts     # Amazon B2B + B2C CSV parsers
│   │   ├── flipkart.ts   # Flipkart XLSX parser
│   │   └── xlsx.ts       # Custom XLSX reader (adm-zip + fast-xml-parser)
│   ├── utils/
│   │   └── stateCodes.ts # GST state codes + supply type helpers
│   ├── server.ts         # Express server (used locally via `npm run dev`)
│   └── index.ts          # CLI entry point
├── frontend/             # (legacy) compiled frontend artefacts
├── vite.config.ts        # Vite config — proxies /api/process → localhost:3000
├── vercel.json           # Vercel deployment config
├── package.json
├── tsconfig.json         # Base TS config (frontend)
├── tsconfig.server.json  # Backend TS config (src/ → dist-server/)
└── tsconfig.app.json     # Vite/app TS config
```

### Key design choices

- The **custom XLSX parser** (`src/parsers/xlsx.ts`) uses `adm-zip` + `fast-xml-parser` instead of the `xlsx` npm package. This keeps control over parsing and avoids the large `xlsx` bundle.
- `api/process.ts` uses the **Web Fetch API** (`Request`/`Response`) — requires **Node.js 18+**.
- The Express server (`src/server.ts`) is used **only locally** — Vercel runs `api/process.ts` directly.

---

## Dev Commands

```bash
npm run dev          # Start Express backend (port 3000) + Vite frontend (port 5173) concurrently
npm run build        # Compile src/ → dist-server/ (tsc) + build frontend → dist/ (vite)
npm run serve        # Run compiled Express server (node dist-server/server.js)
npm run cli:dev      # Run CLI via ts-node
```

## Local setup

1. `npm install` at repo root
2. `npm run dev` — frontend at http://localhost:5173, backend at http://localhost:3000

---

## Vercel Deployment

- **Build command**: `npm run build`
- **Output directory**: `dist/` (Vite-built React frontend)
- **Serverless function**: `api/process.ts` → Node.js 20.x
- **Rewrite**: `/process` → `/api/process`

### Critical: Node.js version

`api/process.ts` calls `new Response(...)` (Web Fetch API). This global is only available in **Node.js 18+**. The `vercel.json` pins the runtime to `nodejs20.x` and `package.json` declares `"engines": { "node": ">=18" }`. Do not remove these — downgrading to Node 16 will cause `FUNCTION_INVOCATION_FAILED` crashes on every request.

---

## Data Flow

```
User uploads files (FormData)
  → api/process.ts
    → parseAmazonB2BContent(buffer)   → NormalizedSupplyRecord[]
    → parseAmazonB2CContent(buffer)   → NormalizedSupplyRecord[]
    → parseFlipkartWorkbook(buffer)   → NormalizedSupplyRecord[]
  → buildMonthlyGSTR1(records, documentIssues, { gstin, fp })
  → returns GSTR-1 JSON (download)
```

## Default values (hardcoded fallbacks)

| Field | Default |
|-------|---------|
| GSTIN | `07ABGFR8042N1ZO` |
| Filing Period (fp) | `032026` (March 2026) |
| Seller State | `09` (Uttar Pradesh) |

These are overridable via the form fields `gstin`, `fp`, `sellerState`.
