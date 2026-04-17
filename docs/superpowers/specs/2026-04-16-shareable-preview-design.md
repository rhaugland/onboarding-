# Shareable Preview URLs — Design Spec

## Goal

Replace `sessionStorage`-based state with URL-based, DB-backed pages so that any project preview can be shared via its URL. No auth, no accounts — the project UUID in the URL is the access mechanism.

## Raw User Ask

> "How can we set this up, so I can send an email invite to my business partner and he can view the same page as me."

## Distilled Objectives

1. Preview page loads from the database using a project ID in the URL
2. Anyone with the URL can view and fully collaborate (pick, customize, build, integrate)
3. Remove all `sessionStorage` dependency — the database is the single source of truth
4. Customize and integrate pages follow the same URL-based pattern

## Architecture

### Approach: URL-based preview with API hydration

Every page that currently reads from `sessionStorage` switches to fetching from the API using a project or resource ID in the URL. The URL *is* the share mechanism — copy it, send it, done.

No new database tables. No auth middleware. No email service. The existing `projects` and `onboarding_options` tables already contain everything the frontend needs.

### New API Endpoint

**`GET /api/projects/:id`**

Returns everything the preview page needs in a single call:

```json
{
  "project": {
    "id": "uuid",
    "name": "string",
    "appProfile": {},
    "authMockup": { "login": "string", "signup": "string" }
  },
  "options": [
    {
      "id": "uuid",
      "name": "string",
      "rationale": "string",
      "flowStructure": [],
      "mockupCode": {},
      "status": "storyboard | ready | built"
    }
  ],
  "builtOption": {
    "id": "uuid",
    "componentCode": {},
    "authCode": { "login": "string", "signup": "string" }
  } | null
}
```

- `options` filtered to `status IN ('storyboard', 'ready', 'built')` — excludes in-progress `customizing` drafts
- `builtOption` is the first option with `status = 'built'`, or `null` if none exists

### URL Structure Changes

| Current | New |
|---------|-----|
| `/preview` (reads `sessionStorage`) | `/preview/[projectId]` (fetches from API) |
| `/integrate` (reads `sessionStorage`) | `/integrate/[projectId]` (fetches from API) |
| `/customize/[id]` | No change (already URL-based) |

### Page-by-Page Changes

**`/` (home/analyze page):**
- After `POST /api/analyze` returns `{ projectId }`, redirect to `/preview/[projectId]`
- Remove all `sessionStorage.setItem("onboarder_session", ...)` writes

**`/preview/[projectId]` (new dynamic route):**
- Server component wrapper extracts `projectId` from URL params
- Client component calls `GET /api/projects/:id` on mount
- Renders storyboard options from API response (same UI as today)
- "Pick" calls `POST /api/build`, then re-fetches from `GET /api/projects/:id`
- "Customize" calls `POST /api/customize`, navigates to `/customize/{draftId}`
- Built option rendering unchanged — data comes from API `builtOption` field

**`/customize/[id]` (no structural change):**
- Already URL-based and API-driven
- After finalize + build, navigate to `/preview/[projectId]` instead of writing to `sessionStorage` and going to `/preview`

**`/integrate/[projectId]` (new dynamic route):**
- `projectId` from URL params
- Finds the built option via `GET /api/projects/:id` (`builtOption` field)
- If no `builtOption` exists, redirect to `/preview/[projectId]` (user hasn't picked yet)
- Calls `POST /api/integrate` with `projectId` and `builtOption.id`

### Files Deleted

- `apps/web/src/app/preview/page.tsx` — replaced by `apps/web/src/app/preview/[projectId]/page.tsx`
- `apps/web/src/app/integrate/page.tsx` — replaced by `apps/web/src/app/integrate/[projectId]/page.tsx`

### `sessionStorage` Removal

All reads and writes of `onboarder_session` and `onboarder_chosen` are eliminated. No `sessionStorage` usage remains in the app after this change.

### Data Flow

```
Analyze:  POST /api/analyze → { projectId } → redirect /preview/{projectId}

Preview:  GET /api/projects/{projectId} → render storyboards
  Pick:   POST /api/build → re-fetch GET /api/projects/{projectId}
  Custom: POST /api/customize → navigate /customize/{draftId}

Customize: GET /api/customize/{id} → edit screens
  Done:   POST /api/customize/{id}/finalize + POST /api/build
          → navigate /preview/{projectId}

Integrate: GET /api/projects/{projectId} → find built option
           POST /api/integrate → render changeset
```

## What's NOT in Scope

- User accounts or authentication
- Email invite service (users share the URL manually)
- Permissions or access control beyond URL obscurity
- Real-time collaboration (no WebSockets/live sync)
- Conflict resolution if two users edit simultaneously

## Testing

- API test: `GET /api/projects/:id` returns correct shape, 404 for missing project
- API test: response excludes `customizing` drafts, includes `storyboard`/`ready`/`built`
- API test: `builtOption` is populated when a built option exists, null otherwise
- Web typecheck: all pages compile after `sessionStorage` removal
- Manual E2E: analyze → preview → pick → customize → finalize → integrate, all via URL navigation
- Manual E2E: open preview URL in incognito — same content loads without `sessionStorage`
