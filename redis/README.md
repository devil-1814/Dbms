# Redis NoSQL component

Redis is the NoSQL component of this project. MySQL remains the source of truth for all permanent transactional records.

## What the application stores in Redis

| Redis data structure | Key pattern | Purpose |
|---|---|---|
| Hash | `smart-emergency:resource:<id>` | Cached resource name, type, capacity, available units, location and status |
| Set | `smart-emergency:resources` | IDs of resources currently cached |
| Hash | `smart-emergency:incident:<id>` | Compact incident snapshot for quick lookups |
| List | `smart-emergency:activity` | Most recent 30 incident/allocation/status events |

The application refreshes resource hashes from MySQL when the resources API is read. Allocation and incident status changes also update Redis after the MySQL transaction commits. Redis is not used to make the allocation decision; that decision remains transactional in MySQL.

## Setup with Redis Cloud

1. Create a Redis Cloud database.
2. Copy its TLS connection URL. It normally has the form `rediss://default:PASSWORD@HOST:PORT`.
3. Copy `.env.example` to `.env.local`.
4. Replace the `REDIS_URL` placeholder with the real URL. Keep it private and do not commit `.env.local`.
5. Install dependencies with `npm install`.
6. Verify the connection with `npm run redis:check`.
7. Start the application with `npm run dev`.
8. Sign in, register an incident and allocate a resource. Resolve an incident to see the resource return to availability.
9. Open the dashboard's **Redis NoSQL Monitor** panel to see connection status, cached resource count and recent event records.

For a local Redis server, use `REDIS_URL=redis://127.0.0.1:6379`.

## Redis CLI commands for viva demonstration

```bash
PING
KEYS smart-emergency:*
SMEMBERS smart-emergency:resources
HGETALL smart-emergency:resource:1
HGETALL smart-emergency:incident:1
LRANGE smart-emergency:activity 0 9
```

Use `SCAN` instead of `KEYS` on production databases.

## Important design note

MySQL is authoritative. Redis contains cache/projection data that can be rebuilt from MySQL and recent activity events. If Redis is unavailable, core incident registration, allocation and resource-release transactions continue in MySQL; the dashboard will show Redis as disconnected until it is configured or available.
