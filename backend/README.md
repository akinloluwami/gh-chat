# Local Development Setup

## Prerequisites

* Node.js (>=18)
* Docker

## Install Dependencies

```bash
npm install
```

## Start Services

### Postgres

```bash
docker run -d \
  --name local-postgres \
  -e POSTGRES_DB=app_db \
  -e POSTGRES_USER=app_user \
  -e POSTGRES_PASSWORD=app_pass \
  -p 5432:5432 \
  postgres:16
```

### Disable SSL for Local Postgres

When running Postgres locally (e.g. via Docker), SSL is usually not enabled.
Set `ssl` to `false` in the postgres client configuration.

```ts
export const sql = postgres(connectionString, {
  ssl: false, // Make it false here
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

```


### Redis

```bash
docker run -d \
  --name local-redis \
  -p 6379:6379 \
  redis:latest
```

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://app_user:app_pass@localhost:5432/app_db
POSTHOG_API_KEY=your posthog api key
GITHUB_CLIENT_ID=your github client ID
GITHUB_CLIENT_SECRET=your github client secret
REDIS_URL=redis://localhost:6379
PORT=8585
```

## Run the App

```bash
npm run dev
```

## Open in Browser

```bash
open http://localhost:8585
```