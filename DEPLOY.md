# Deploying to Railway

This monorepo deploys as **3 Railway services** from one GitHub repo:

| Service | Type | Root Directory |
|---------|------|---------------|
| **Postgres** | Database | — (Railway template) |
| **API** | Web Service | `/` |
| **Web** | Web Service | `/` |

## Setup

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo (`rhaugland/onboarding-`)

### 2. Add Postgres

1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway auto-provisions it and provides `DATABASE_URL`

### 3. Create API Service

1. Click **+ New** → **GitHub Repo** → select `onboarding-`
2. Go to **Settings**:
   - **Root Directory**: leave empty (monorepo root)
   - **Build Command**: `npm install && npm run build --workspace=packages/db && npm run build --workspace=apps/api`
   - **Start Command**: `node apps/api/dist/env.js`
3. Go to **Variables**, add:
   - `DATABASE_URL` → reference the Postgres service variable
   - `ANTHROPIC_API_KEY` → your key
   - `APP_URL` → the Web service's public URL (add after creating Web service)
   - `PORT` → `3011` (or let Railway assign one via `${{PORT}}`)
4. Go to **Networking** → **Generate Domain** (gives you `api-xxx.up.railway.app`)

### 4. Create Web Service

1. Click **+ New** → **GitHub Repo** → select `onboarding-` again
2. Go to **Settings**:
   - **Root Directory**: leave empty (monorepo root)
   - **Build Command**: `npm install && npm run build --workspace=packages/db && npm run build --workspace=apps/web`
   - **Start Command**: `npm start --workspace=apps/web`
3. Go to **Variables**, add:
   - `API_URL` → the API service's internal Railway URL (e.g., `http://api.railway.internal:3011`) or external URL
   - `PORT` → `3012` (Next.js will use this if you update the start script, or just use `3000`)
4. Go to **Networking** → **Generate Domain** (gives you `web-xxx.up.railway.app`)

### 5. Cross-link URLs

- On the **API** service, set `APP_URL` to the Web service's public URL (e.g., `https://web-xxx.up.railway.app`)
- On the **Web** service, set `API_URL` to the API service's Railway internal URL for best performance

### 6. Run Database Migration

In Railway's API service shell (or locally with the Railway DATABASE_URL):

```bash
npx drizzle-kit push
```

Or trigger it via the API service build by adding to the build command:
```
npm install && npm run build --workspace=packages/db && npm run db:migrate --workspace=packages/db && npm run build --workspace=apps/api
```

## Environment Variables Reference

### API Service
| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://...` (from Railway Postgres) |
| `ANTHROPIC_API_KEY` | Yes | `sk-ant-...` |
| `APP_URL` | Yes | `https://web-xxx.up.railway.app` |
| `PORT` | No | Defaults to `3011` |

### Web Service
| Variable | Required | Example |
|----------|----------|---------|
| `API_URL` | Yes | `http://api.railway.internal:3011` |
| `PORT` | No | Next.js defaults to `3000` |

## Notes

- The Web service proxies all `/api/*` requests to the API service via a Next.js catch-all route at `apps/web/src/app/api/[...path]/route.ts`. It reads `API_URL` from the environment. No CORS issues since requests go server-to-server.
- Railway's internal networking (`*.railway.internal`) is faster and free — use it for `API_URL` instead of the public domain.
- Both services build from the monorepo root because they depend on `packages/db`.
