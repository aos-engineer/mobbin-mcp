# Mobbin API Discovery Notes

## Architecture Overview

Mobbin is a **Next.js app** that uses **Supabase** as its backend. Unlike the old Swift wrapper's approach (direct Supabase RPC calls), the current site uses **Next.js API routes** (`/api/...`) that proxy to Supabase server-side. Auth is cookie-based.

- **Supabase project**: `ujasntkfphywizsdaapi.supabase.co`
- **Auth**: Google OAuth -> Supabase callback -> cookie-based session
- **Media CDN**: `bytescale.mobbin.com` (videos/optimized images), Supabase Storage (raw images)
- **Notifications**: `api.knock.app`
- **Feature flags**: `cdn.growthbook.io`
- **Payments**: Stripe

---

## Authentication

### Flow
1. User clicks "Continue with Google" on `/login`
2. Redirects to Google OAuth with `client_id=672621582021-a5cmbeo4rjqqj0tqo6u2ff614lmnjh2s.apps.googleusercontent.com`
3. Google redirects to `https://ujasntkfphywizsdaapi.supabase.co/auth/v1/callback`
4. Supabase redirects to `mobbin.com/api/auth/authenticate?redirect_to=/`
5. Auth token stored in **cookies** (NOT localStorage)

### Token Storage
Cookies named `sb-ujasntkfphywizsdaapi-auth-token.0` and `.1` (split across two cookies due to size).

Contains JSON:
```json
{
  "access_token": "eyJ...<JWT>",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": <unix_timestamp>,
  "refresh_token": "<short_token>",
  "user": {
    "id": "<uuid>",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "...",
    "app_metadata": { "provider": "google", "providers": ["google"] },
    "user_metadata": { "avatar_url": "...", "full_name": "...", "email": "..." }
  },
  "provider_token": "ya29...<google_oauth_token>"
}
```

### For MCP Server
The MCP server needs the Supabase auth cookie value to make authenticated requests. Users will extract this from their browser and provide it as an env var.

---

## Core Content API Endpoints

### `POST /api/content/search-apps`
Search and browse apps with filtering and pagination.

**Request:**
```json
{
  "searchRequestId": "",
  "filterOptions": {
    "platform": "ios",
    "appCategories": ["Music & Audio"]
  },
  "paginationOptions": {
    "pageSize": 24,
    "pageIndex": 0,
    "sortBy": "publishedAt"
  }
}
```

**Response:**
```json
{
  "value": {
    "searchRequestId": "",
    "data": [
      {
        "id": "<uuid>",
        "appName": "Spotify",
        "appCategory": "Music & Audio",
        "allAppCategories": ["Music & Audio"],
        "appLogoUrl": "<supabase_storage_url>",
        "appTagline": "Music and podcasts",
        "platform": "ios",
        "keywords": ["music", "streaming"],
        "createdAt": "...",
        "appVersionId": "<uuid>",
        "appVersionPublishedAt": "...",
        "hidden_in_discover_latest": false,
        "average_rating": null,
        "previewScreens": [
          { "id": "<uuid>", "screenUrl": "<supabase_url>" }
        ],
        "previewVideoUrl": null,
        "popularityMetric": 7123,
        "trendingMetric": 56,
        "isRestricted": true
      }
    ]
  }
}
```

**Filter options:**
- `platform`: "ios" | "android" | "web"
- `appCategories`: string[] (e.g., ["AI", "Finance", "Music & Audio"])
- `sortBy`: "publishedAt" | "trending" | "popular" | "top"

---

### `POST /api/content/search-screens`
Search screens across all apps with pattern/element/keyword filters.

**Request:**
```json
{
  "searchRequestId": "",
  "filterOptions": {
    "platform": "ios",
    "screenPatterns": ["Login"],
    "screenElements": null,
    "screenKeywords": null,
    "appCategories": null,
    "hasAnimation": null
  },
  "paginationOptions": {
    "pageSize": 24,
    "pageIndex": 0,
    "sortBy": "trending"
  }
}
```

**Response:**
```json
{
  "value": {
    "searchRequestId": "",
    "data": [
      {
        "type": "curated",
        "id": "<uuid>",
        "screenUrl": "<supabase_storage_url>.png",
        "fullpageScreenUrl": null,
        "screenNumber": 4,
        "screenPatterns": ["Login"],
        "screenElements": [],
        "screenKeywords": "Enter your phone\nnumber\n...",
        "appVersionId": "<uuid>",
        "appId": "<uuid>",
        "appName": "Tabby",
        "appCategory": "Finance",
        "allAppCategories": ["Shopping", "Finance"],
        "appLogoUrl": "<url>",
        "appTagline": "Shop now, pay later",
        "companyHqRegion": "Middle East",
        "companyStage": null,
        "platform": "ios",
        "popularityMetric": 219,
        "trendingMetric": 118,
        "metadata": { "width": 1170, "height": 2532 },
        "screenCdnImgSources": { "src": "https://bytescale.mobbin.com/..." }
      }
    ]
  }
}
```

---

### `POST /api/content/search-flows`
Search flows/user journeys across all apps.

**Request:**
```json
{
  "searchRequestId": "",
  "filterOptions": {
    "platform": "ios",
    "flowActions": ["Creating Account"],
    "appCategories": null
  },
  "paginationOptions": {
    "pageSize": 24,
    "pageIndex": 0,
    "sortBy": "trending"
  }
}
```

**Response:**
```json
{
  "value": {
    "searchRequestId": "",
    "data": [
      {
        "id": "<uuid>",
        "name": "Onboarding",
        "actions": ["Creating Account", "Onboarding", "Verifying"],
        "order": 0,
        "videoUrl": null,
        "screens": [
          {
            "id": "<uuid>",
            "order": 0,
            "hotspotType": null,
            "hotspotX": 0.342,
            "hotspotY": 0.719,
            "hotspotWidth": 0.312,
            "hotspotHeight": 0.075,
            "videoTimestamp": null,
            "screenUrl": "<supabase_storage_url>.png",
            "screenId": "<uuid>",
            "screenElements": ["Logo"],
            "screenPatterns": ["Splash Screen"],
            "metadata": { "width": 1170, "height": 2532 }
          }
        ]
      }
    ]
  }
}
```

---

## Search & Autocomplete Endpoints

### `POST /api/search-bar/search`
Autocomplete search — returns matching IDs by type.

**Request:**
```json
{
  "query": "spotify",
  "experience": "apps",
  "platform": "ios"
}
```

**Response:**
```json
{
  "value": {
    "experience": "apps",
    "primary": [{ "id": "<uuid>", "type": "app" }],
    "other": [{ "type": "app", "id": "<uuid>" }],
    "secondaryPlatform": [{ "id": "<uuid>", "type": "app" }],
    "sites": [{ "id": "<uuid>", "type": "site" }]
  }
}
```

Note: Returns IDs only. Client cross-references with `/api/searchable-apps/{platform}` cached data.

### `GET /api/searchable-apps/{platform}`
Full app list for client-side search/autocomplete. Platforms: `ios`, `android`, `web`.

```json
[
  {
    "id": "<uuid>",
    "platform": "ios",
    "appName": "Disney+",
    "appLogoUrl": "<supabase_url>",
    "appTagline": "Unlimited entertainment",
    "keywords": ["streaming", "movies"],
    "previewScreens": [{ "id": "<uuid>", "screenUrl": "<url>" }]
  }
]
```

### `GET /api/recent-searches`
Returns user's recent search history.

### `POST /api/search-bar/fetch-trending-apps`
Body: `{"platform": "ios"}`

### `POST /api/search-bar/fetch-trending-filter-tags`
Body: `{"experience": "apps", "platform": "ios"}` or `{"experience": "sites"}`

### `POST /api/search-bar/fetch-trending-text-in-screenshot-keywords`
Body: `{"platform": "ios"}`

### `POST /api/search-bar/fetch-trending-sites`
Body: `null` (no body needed)

### `POST /api/search-bar/fetch-searchable-sites`
Body: `null`

---

## Browse & Filter Endpoints

### `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
**Request:**
```json
{
  "platform": "ios",
  "limitPerCategory": 10
}
```

**Response:**
```json
{
  "value": [
    {
      "app_id": "<uuid>",
      "app_name": "Rewind",
      "app_logo_url": "<url>",
      "preview_screens": [{ "id": "<uuid>", "screenUrl": "<url>" }],
      "app_category": "AI",
      "secondary_app_categories": [],
      "popularity_metric": 7123
    }
  ]
}
```

### `POST /api/filter-tags/fetch-dictionary-definitions`
Body: `{}` — returns all filter taxonomy (categories, screen patterns, UI elements, flow actions).

---

## Collections Endpoints

### `POST /api/collection/fetch-collections`
Body: `null` — returns user's collections.

```json
{
  "value": [
    {
      "id": "<uuid>",
      "workspaceId": "<uuid>",
      "name": "byte-onboard",
      "description": "",
      "isPublic": false,
      "createdAt": "...",
      "updatedAt": "...",
      "createdBy": "<user_uuid>",
      "mobileAppsCount": 0,
      "mobileScreensCount": 0,
      "mobileFlowsCount": 5,
      "webAppsCount": 0,
      "webScreensCount": 0,
      "webFlowsCount": 0,
      "mobilePreviewScreens": [
        { "id": "<uuid>", "isUserScreen": false, "screenUrl": "<url>" }
      ]
    }
  ]
}
```

### `POST /api/saved/fetch-saved-contents`
Check if specific content is saved.

**Request:**
```json
{
  "contentType": "apps",
  "contentIds": ["<uuid>"]
}
```

---

## Image/Media URLs

### App Logos (public, no auth)
```
https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_logos/{uuid}.webp
```

### App Screens (public, no auth)
```
https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png
```

### Optimized Screen Images (CDN)
```
https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/file.webp?enc=...
```

### Flow Videos
```
https://bytescale.mobbin.com/FW25bBB/video/mobbin.com/prod/content/app_flow_videos/{uuid}.mp4?f=mp4-h264&w=1920&...
```

---

## Pagination

All content endpoints use page-based pagination:
```json
{
  "paginationOptions": {
    "pageSize": 24,
    "pageIndex": 0,
    "sortBy": "trending"
  }
}
```

Sort options: `"trending"`, `"publishedAt"`, `"popular"`, `"top"`

---

## URL Patterns (for reference)

### App Pages
```
/apps/{app-slug}-{platform}-{app-uuid}/{version-uuid}/screens
/apps/{app-slug}-{platform}-{app-uuid}/{version-uuid}/flows
/apps/{app-slug}-{platform}-{app-uuid}/{version-uuid}/ui-elements
```

### Discover
```
/discover/apps/{platform}/{tab}    # tab = latest|popular|top|animations
/discover/sites/{tab}
```

### Search
```
/search/apps/{platform}?content_type={type}&sort={sort}&filter={filter}
```
