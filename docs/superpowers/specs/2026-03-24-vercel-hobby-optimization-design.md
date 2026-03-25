# Vercel Hobby Plan Optimization — Design Specification

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Security headers, CDN caching, function tuning, Edge Config, cleanup

---

## Overview

Maximize Vercel Hobby plan features for Channel Zero without upgrading to Pro. Five areas: static asset caching for faster loads, security headers to harden the app, function configuration to prevent AI timeouts, Edge Config for runtime dashboard-driven config, and repository cleanup.

## Constraints

- Vercel Hobby (free) plan only — no Pro features
- No framework migration (stays Vite + React 18 SPA)
- No new build tools or TypeScript conversion
- Edge Config free tier: 1 store, 10KB max

---

## 1. Static Asset Caching

Vite fingerprints all built assets with content hashes (e.g., `assets/index-D4kF2m.js`). When content changes, the filename changes, so hashed assets can be cached indefinitely.

### Headers Configuration

| Path Pattern | `Cache-Control` Value | Rationale |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | Fingerprinted files — safe to cache for 1 year. `immutable` tells browsers to skip revalidation entirely |
| `/*` (fallback) | `public, max-age=0, must-revalidate` | HTML and non-hashed files must always be revalidated to pick up new asset references |

### Implementation

Add `headers` array to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

The fallback `must-revalidate` behavior is Vercel's default for non-matched paths, so no explicit rule needed for `index.html`.

### Impact

- Return visitors load JS/CSS/images from browser cache with zero network requests
- CDN edges cache assets globally — first visit from a region after first cache-fill is served from edge

---

## 2. Security Headers

### Headers Applied to All Routes

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents embedding in iframes (clickjack protection) |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URL to same-origin, origin-only to cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Deny unused browser APIs |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS — prevents protocol downgrade attacks. Vercel already redirects HTTP→HTTPS, but HSTS prevents even the initial HTTP request on repeat visits |
| `X-DNS-Prefetch-Control` | `on` | Enables DNS prefetching for third-party domains (YouTube, Vimeo, DM, Google Fonts, Vercel Analytics) — marginal load time improvement |

### Content Security Policy

The app embeds video players from YouTube, Vimeo, Streamable, and Dailymotion, loads Google Fonts, and includes Vercel Analytics/Speed Insights. The CSP must allowlist all of these origins, including CDN subdomains that player SDKs load dynamically at runtime.

**Phased rollout:** Deploy as `Content-Security-Policy-Report-Only` first, test all five player types, collect any violations from the browser console, add missing origins, then switch to enforcing `Content-Security-Policy`.

```
default-src 'self';
script-src  'self' https://www.youtube.com https://s.ytimg.com
            https://player.vimeo.com https://f.vimeocdn.com
            https://geo.dailymotion.com https://*.dmcdn.net
            https://va.vercel-scripts.com;
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
frame-src   https://www.youtube.com https://player.vimeo.com
            https://streamable.com https://geo.dailymotion.com
            https://www.dailymotion.com;
img-src     'self' https://i.ytimg.com https://img.youtube.com
            https://i.vimeocdn.com https://*.dmcdn.net data:;
connect-src 'self' https://va.vercel-scripts.com
            https://vitals.vercel-insights.com;
font-src    'self' https://fonts.gstatic.com;
media-src   'self' blob:;
```

**CSP notes:**
- `style-src 'unsafe-inline'` is required because the app uses CSS-in-JS (template literal in `App.jsx`)
- `media-src blob:` covers `DirectVideoPlayer` which may use blob URLs for HTML5 `<video>`
- Each video platform needs entries in both `script-src` (SDK/API JS) and `frame-src` (embed iframe)
- `https://fonts.googleapis.com` in `style-src` for the Google Fonts CSS; `https://fonts.gstatic.com` in `font-src` for the actual `.woff2` files
- `https://*.dmcdn.net` covers Dailymotion's CDN subdomains (`static1.dmcdn.net`, etc.) for scripts and thumbnails loaded dynamically by the player SDK
- `https://i.vimeocdn.com` covers Vimeo poster/thumbnail images loaded by the embedded player
- `https://www.dailymotion.com` in `frame-src` because DM embeds may use this as the actual iframe origin
- No `type: "video"` clips currently exist in scenes.js, so no external `media-src` origins needed beyond `'self'` and `blob:`
- Vercel Toolbar (`https://vercel.live`) is not included — it will be blocked on preview deployments. This is acceptable; add it later if preview debugging is needed.
- Blob storage URLs (used by sweep reports) are fetched server-side only, so no `connect-src` entry needed

### Implementation

Add a catch-all header rule in `vercel.json`. **Phase 1** uses `Content-Security-Policy-Report-Only`; **Phase 2** switches to enforcing `Content-Security-Policy` after testing.

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
    { "key": "X-DNS-Prefetch-Control", "value": "on" },
    { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.vimeo.com https://f.vimeocdn.com https://geo.dailymotion.com https://*.dmcdn.net https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; frame-src https://www.youtube.com https://player.vimeo.com https://streamable.com https://geo.dailymotion.com https://www.dailymotion.com; img-src 'self' https://i.ytimg.com https://img.youtube.com https://i.vimeocdn.com https://*.dmcdn.net data:; connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com; font-src 'self' https://fonts.gstatic.com; media-src 'self' blob:" }
  ]
}
```

**Note:** `X-Frame-Options: DENY` applies to all routes including API endpoints. This is intentional — API JSON responses are not rendered as pages, so the header is harmless on those routes while providing blanket clickjack protection.

### Risk & Mitigation

If an origin is missed, `Report-Only` mode logs violations to the browser console without blocking anything. After testing all five player types (YouTube, Vimeo, Streamable, Dailymotion, direct video) and confirming zero violations, switch the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce.

### Phase 2: Enforce CSP

After verifying no violations in Report-Only mode, change the header key:
- `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
- This is a single string change in `vercel.json`, deployed via normal push to main

---

## 3. Function Configuration

### Current State

Only `api/sweep.js` has explicit `maxDuration: 60`. Other functions use platform defaults. The Hobby plan caps `maxDuration` at 60 seconds (Pro allows up to 300s). The existing `api/sweep.js` already runs at 60s successfully, confirming this ceiling works.

### Changes

| Function | `maxDuration` | Reasoning |
|---|---|---|
| `api/dial.js` | `60` | Calls Claude API + sequentially verifies each video suggestion via oEmbed. AI responses can take 10-30s, plus N verification calls. 60s is the Hobby plan maximum |
| `api/validate.js` | _(default)_ | Single API key validation — fast |
| `api/sweep.js` | `60` _(keep)_ | Already configured. Concurrent 50-worker pool checks 400+ clips |
| `api/sweep-report.js` | _(default)_ | Single Blob read — instant |

### Implementation

Add `api/dial.js` to the `functions` block in `vercel.json`:

```json
{
  "functions": {
    "api/dial.js": { "maxDuration": 60 },
    "api/sweep.js": { "maxDuration": 60 }
  }
}
```

---

## 4. Edge Config

### Purpose

Enable runtime configuration changes from the Vercel dashboard without redeploying. Free tier: 1 Edge Config store, 10KB.

### Config Schema

| Key | Type | Default | Use Case |
|---|---|---|---|
| `maintenance` | `boolean` | `false` | Show maintenance banner, optionally disable playback |
| `announcement` | `string \| null` | `null` | Dismissable announcement banner (e.g., "50 new clips added!") |
| `featuredClipId` | `string \| null` | `null` | Highlight a specific clip — plays first or shown prominently |
| `aiEnabled` | `boolean` | `true` | Kill switch for AI discovery features |

### Architecture

```
Vercel Dashboard → Edge Config store (<1ms reads)
                         ↓
              GET /api/config (serverless function)
                         ↓
              SPA fetches on app load → React state
```

### New Files

**`api/config.js`** — Serverless function that reads Edge Config and returns JSON:

```js
import { getAll } from "@vercel/edge-config";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = await getAll(["maintenance", "announcement", "featuredClipId", "aiEnabled"]);
    // Return only known keys with defaults
    return res.status(200).json({
      maintenance: config?.maintenance ?? false,
      announcement: config?.announcement ?? null,
      featuredClipId: config?.featuredClipId ?? null,
      aiEnabled: config?.aiEnabled ?? true,
    });
  } catch {
    // If Edge Config is unavailable, return safe defaults
    return res.status(200).json({
      maintenance: false,
      announcement: null,
      featuredClipId: null,
      aiEnabled: true,
    });
  }
}
```

**Key design decision:** On Edge Config failure, return safe defaults rather than erroring. The app should always be playable.

### Client Integration

`App.jsx` fetches `/api/config` on mount and stores the result in state. Components conditionally render:
- Maintenance banner (if `maintenance === true`)
- Announcement banner (if `announcement` is non-null, dismissable)
- Featured clip behavior (if `featuredClipId` is non-null)
- AI Pick button visibility (if `aiEnabled === false`, hide or disable)

**Known limitation:** Config changes take effect on next full page load — users already on the page won't see updates until they refresh. This is acceptable for all four config values (maintenance mode, announcements, featured clips, AI kill switch). Polling could be added later if near-real-time propagation is needed.

### New Dependencies

- `@vercel/edge-config` (npm package)

### Dashboard Setup (Manual Steps)

1. Create Edge Config store in Vercel dashboard (Storage > Edge Config)
2. `EDGE_CONFIG` env var is auto-provisioned
3. Set initial values: `{ "maintenance": false, "announcement": null, "featuredClipId": null, "aiEnabled": true }`
4. Run `vercel env pull` to sync env locally

### CSP Update

Add Edge Config's `/api/config` endpoint to `connect-src`. Since this is same-origin (`'self'`), no CSP change needed.

---

## 5. Cleanup

| Item | Action | Reason |
|---|---|---|
| `.github/` directory | `git rm -r .github/` | Dead artifact from GitHub Pages era — only contains `.DS_Store` |

---

## Modified Files Summary

| File | Changes |
|---|---|
| `vercel.json` | Add `headers` array (caching + security), add `api/dial.js` to `functions` |
| `api/config.js` | **New file** — Edge Config reader endpoint |
| `App.jsx` | Fetch `/api/config` on mount, add maintenance + announcement banner components |
| `package.json` | Add `@vercel/edge-config` dependency |

## New Dependencies

| Package | Purpose |
|---|---|
| `@vercel/edge-config` | Read Edge Config store from serverless functions |

## Manual Dashboard Steps

1. Create Edge Config store in Vercel dashboard
2. Set initial config values
3. `vercel env pull` to sync `EDGE_CONFIG` locally

## Verification

### Phase 1 (Report-Only CSP)

1. Deploy to Vercel (push to main)
2. `curl -I <site-url>/assets/<any-file>` — verify `Cache-Control: public, max-age=31536000, immutable`
3. `curl -I <site-url>` — verify all security headers present (HSTS, X-Frame-Options, CSP-Report-Only, etc.)
4. Open browser DevTools console → play clips from each player type (YouTube, Vimeo, Streamable, Dailymotion) → verify zero CSP violation warnings
5. Test `/api/config` endpoint returns expected JSON with defaults
6. Toggle `maintenance` in Edge Config dashboard → refresh page → verify banner appears
7. Test `/api/dial` with a real AI request → verify it completes without timeout

### Phase 2 (Enforce CSP)

8. After confirming zero CSP violations in Phase 1, change `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in `vercel.json`
9. Deploy and re-test all player types to confirm nothing breaks under enforcement
