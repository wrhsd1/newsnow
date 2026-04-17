# NewsNow Deployment Guide

This guide covers Docker and Docker Compose deployment, environment variables, persistence, key endpoints, and RSS discovery usage.

## Requirements

- Docker
- Docker Compose

## Deployment options

### Option 1: Run the published image

Use `/root/test/newsnow/docker-compose.yml` when you want to run the published image from GHCR.

```sh
docker compose up -d
```

Default behavior in this file:
- image: `ghcr.io/ourongxing/newsnow:latest`
- host port: `4444`
- container port: `4444`
- persistent volume: `newsnow_data:/usr/app/.data`

### Option 2: Build and run locally

Use `/root/test/newsnow/docker-compose.local.yml` when you want to build from the local checkout.

```sh
docker compose -f docker-compose.local.yml up -d --build
```

Default behavior in this file:
- build context: current repository
- host port: `33654`
- container port: `4444`
- persistent volume: `newsnow_data:/usr/app/.data`

### Option 3: Build the image directly

```sh
docker build -t newsnow-local .
docker run --rm -p 4444:4444 \
  -e HOST=0.0.0.0 \
  -e PORT=4444 \
  -e NODE_ENV=production \
  -e INIT_TABLE=true \
  -e ENABLE_CACHE=true \
  -e DEFAULT_RETENTION_HOURS=48 \
  -e DEFAULT_MIN_KEEP_COUNT=100 \
  -e DEFAULT_REFRESH_ENABLED=true \
  -v newsnow_data:/usr/app/.data \
  newsnow-local
```

## Environment variables

Reference file: `/root/test/newsnow/example.env.server`

```env
G_CLIENT_ID=
G_CLIENT_SECRET=
JWT_SECRET=
INIT_TABLE=true
ENABLE_CACHE=true
PRODUCTHUNT_API_TOKEN=
DEFAULT_RETENTION_HOURS=48
DEFAULT_MIN_KEEP_COUNT=100
DEFAULT_REFRESH_ENABLED=true
DEFAULT_REFRESH_INTERVAL_MS=600000
DEFAULT_REALTIME_REFRESH_INTERVAL_MS=120000
DEFAULT_FAST_REFRESH_INTERVAL_MS=300000
DEFAULT_COMMON_REFRESH_INTERVAL_MS=1800000
DEFAULT_SLOW_REFRESH_INTERVAL_MS=3600000
SCHEDULER_SCAN_INTERVAL_MS=60000
```

### Login and sync

- `G_CLIENT_ID`
- `G_CLIENT_SECRET`
- `JWT_SECRET`

If these are not set, the app runs in login-disabled mode. Public read endpoints, including RSS, still work.

### Runtime and storage

- `HOST=0.0.0.0`
  - Bind address inside the container.
- `PORT=4444`
  - Internal app port.
- `NODE_ENV=production`
  - Production runtime mode.
- `INIT_TABLE=true`
  - Initializes database tables on startup.
- `ENABLE_CACHE=true`
  - Enables server-side cache and persisted source snapshots.

### Background refresh defaults

- `DEFAULT_RETENTION_HOURS=48`
  - Default retention window for persisted source items, in hours.
- `DEFAULT_MIN_KEEP_COUNT=100`
  - Minimum item count kept per source during cleanup.
- `DEFAULT_REFRESH_ENABLED=true`
  - Enables automatic source refresh by default.
- `DEFAULT_REFRESH_INTERVAL_MS=600000`
  - Default refresh interval for sources using the standard cadence, in milliseconds.
  - Default value: 10 minutes.
- `DEFAULT_REALTIME_REFRESH_INTERVAL_MS=120000`
  - Refresh interval override for realtime-class sources, in milliseconds.
  - Default value: 2 minutes.
- `DEFAULT_FAST_REFRESH_INTERVAL_MS=300000`
  - Refresh interval override for fast-class sources, in milliseconds.
  - Default value: 5 minutes.
- `DEFAULT_COMMON_REFRESH_INTERVAL_MS=1800000`
  - Refresh interval override for common-class sources, in milliseconds.
  - Default value: 30 minutes.
- `DEFAULT_SLOW_REFRESH_INTERVAL_MS=3600000`
  - Refresh interval override for slow-class sources, in milliseconds.
  - Default value: 60 minutes.
- `SCHEDULER_SCAN_INTERVAL_MS=60000`
  - How often the background scheduler scans for due sources, in milliseconds.
  - Default value: 1 minute.

### Source-specific credentials

- `PRODUCTHUNT_API_TOKEN`
  - Required by the Product Hunt source.

### Source-specific overrides

Global defaults can be overridden by persisted source state in the database. When a source has stored config, that value wins over the env default.

## Persistence

Both Compose files mount the same Docker volume:

- volume name: `newsnow_data`
- container path: `/usr/app/.data`

This directory stores the local database and persisted source data used for:
- cached source responses
- normalized source history
- source refresh state/config

The volume survives container recreation unless you explicitly remove it.

To inspect the volume:

```sh
docker volume inspect newsnow_data
```

To redeploy without deleting data:

```sh
docker compose pull
docker compose up -d
```

For local-source builds:

```sh
docker compose -f docker-compose.local.yml up -d --build
```

Do not use `docker compose down -v` unless you intentionally want to remove persisted data.

## Public endpoints

Assuming the service is available at `http://<host>:4444` or `http://<host>:33654` depending on which Compose file you use.

### Health/version

```text
GET /api/latest
```

Returns the current app version.

### Read one source

```text
GET /api/s?id=<sourceId>
```

Examples:
- `/api/s?id=weibo`
- `/api/s?id=zhihu`

Query options:
- `latest=true` requests the latest response path
- `refresh=true` forces refresh through the server refresh path

### Read multiple persisted sources

```text
POST /api/s/entire
Content-Type: application/json

{
  "sources": ["weibo", "zhihu"]
}
```

Returns persisted responses for the requested source ids.

### RSS discovery

```text
GET /api/rss
```

Returns source metadata for RSS discovery:
- `id`
- `name`
- `title`
- `home`
- `rssUrl`

### Read one RSS feed

```text
GET /api/rss/<sourceId>
```

Examples:
- `/api/rss/weibo`
- `/api/rss/zhihu`
- `/api/rss/v2ex`

Response content type:

```text
application/rss+xml; charset=utf-8
```

### Login capability check

```text
GET /api/enable-login
```

Returns whether GitHub login is enabled and the authorize URL when configured.

### GitHub login start

```text
GET /api/login
```

Redirects to GitHub OAuth.

### User sync

```text
GET /api/me/sync
POST /api/me/sync
```

These endpoints require a valid JWT and are used for logged-in user metadata sync.

### MCP endpoint

```text
POST /api/mcp
```

Streamable HTTP endpoint for the MCP server.

## RSS discovery and feed usage

### Discover all RSS feeds

```sh
curl "http://127.0.0.1:4444/api/rss"
```

This returns a JSON array of sources and their RSS URLs.

### Read one RSS feed

```sh
curl -i "http://127.0.0.1:4444/api/rss/weibo"
```

Check for:
- HTTP `200`
- `content-type: application/rss+xml; charset=utf-8`
- response body containing `<rss>` and `<item>`

If you are using `docker-compose.local.yml`, replace port `4444` with `33654`.

### How to discover source IDs

Use one of these methods:
- call `/api/rss` and inspect the returned `id` values
- call `/api/s?id=<sourceId>` if you already know the candidate id
- inspect generated source metadata during development

### Warm-up behavior

The RSS body is generated from persisted source data. On a fresh instance, a source may need to be fetched first before its RSS feed has data. If needed, fetch the source once through `/api/s?id=<sourceId>` and retry the RSS URL.

## GitHub login setup

If you want GitHub login enabled:

1. Create a GitHub OAuth app.
2. Set the callback URL to:
   - `https://<your-domain>/api/oauth/github`
3. Set `G_CLIENT_ID`, `G_CLIENT_SECRET`, and `JWT_SECRET`.
4. Restart the container.

Without these values, login is disabled and public endpoints remain available.

## Common operations

### Start the published image

```sh
docker compose up -d
```

### Start the local build

```sh
docker compose -f docker-compose.local.yml up -d --build
```

### View logs

```sh
docker logs -f newsnow
```

If you used the local Compose project and the generated container name differs, inspect with:

```sh
docker ps --filter name=newsnow
```

### Restart

```sh
docker compose restart
```

or:

```sh
docker compose -f docker-compose.local.yml restart
```

### Stop without deleting data

```sh
docker compose down
```

or:

```sh
docker compose -f docker-compose.local.yml down
```

### Remove containers and the persisted volume

```sh
docker compose down -v
```

or:

```sh
docker compose -f docker-compose.local.yml down -v
```

## Verification checklist

### Check version

```sh
curl "http://127.0.0.1:4444/api/latest"
```

or for local Compose:

```sh
curl "http://127.0.0.1:33654/api/latest"
```

### Check a source response

```sh
curl "http://127.0.0.1:4444/api/s?id=weibo"
```

### Check RSS discovery

```sh
curl "http://127.0.0.1:4444/api/rss"
```

### Check one RSS feed

```sh
curl "http://127.0.0.1:4444/api/rss/weibo"
```

Expected characteristics:
- `content-type` is `application/rss+xml; charset=utf-8`
- body contains `<rss>`
- body contains `<item>` when data exists for that source

## Relevant files

- `/root/test/newsnow/Dockerfile`
- `/root/test/newsnow/docker-compose.yml`
- `/root/test/newsnow/docker-compose.local.yml`
- `/root/test/newsnow/example.env.server`
- `/root/test/newsnow/server/api/latest.ts`
- `/root/test/newsnow/server/api/s/index.ts`
- `/root/test/newsnow/server/api/s/entire.post.ts`
- `/root/test/newsnow/server/api/rss/index.ts`
- `/root/test/newsnow/server/api/rss/[id].ts`
- `/root/test/newsnow/server/middleware/auth.ts`
- `/root/test/newsnow/server/services/source-feed.ts`
