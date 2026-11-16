# SMART Emergency Resource Allocation System

A DBMS Level 3 academic project for registering emergencies, prioritizing incidents, tracking resources and allocating the best available resource of a matching type.

> Academic demonstration only. Do not use for real emergency dispatch or as a substitute for emergency services.

## Technology stack

- Next.js 14, React 18 and TypeScript
- MySQL 8+ as the primary relational database
- Redis as the NoSQL key-value store and cache
- `mysql2`, `redis`, `bcryptjs` and `dotenv`

## Main features

- Staff/Admin registration and sign-in with bcrypt password hashing.
- Signed HTTP-only session cookie.
- Incident registration and severity prioritization.
- Incident queue with search and status filters.
- Automatic type-matched resource allocation using MySQL transactions and row-level locks.
- Resource availability dashboard and allocation history.
- Automatic return of a deployed resource when its incident is resolved.
- No duplicate resource returns when an incident is resolved repeatedly.
- JOIN-based incident reports and allocation history shown in the frontend.
- Redis NoSQL monitor showing Redis connectivity, cached resource count and recent event activity.
- MySQL schema, keys, constraints, indexes, view, audit trigger and stored procedure.

## Database responsibilities

### MySQL (SQL)
MySQL is the source of truth for:
- users
- incidents
- resources
- allocation_log
- incident_audit

MySQL performs transactional allocation and resource release. Resource assignment decisions are never made from a potentially stale Redis cache.

### Redis (NoSQL)
Redis stores:
- resource availability snapshots as Hashes
- an index of cached resource IDs as a Set
- compact incident snapshots as Hashes
- recent incident/allocation/status activity as a List

Key patterns:
- `smart-emergency:resource:<id>`
- `smart-emergency:resources`
- `smart-emergency:incident:<id>`
- `smart-emergency:activity`

Redis is a cache/projection and activity store. MySQL remains authoritative. If Redis is temporarily unavailable, core MySQL operations continue; Redis is synchronized again on subsequent application requests.

## Setup on Windows

### 1. MySQL
1. Start MySQL Server.
2. Open MySQL Workbench.
3. Run `sql/schema.sql` for a fresh database.
4. Run `sql/advanced_features.sql` if setting up the advanced DBMS features.

If you already have the project database, do not drop it or rerun destructive scripts. For an existing database that has not yet added `released_at`, review and run `sql/fix_resolved_resource_release.sql` once after making a backup.

### 2. Redis
1. Create a Redis Cloud database or start a local Redis server.
2. For Redis Cloud, copy its TLS connection URL, usually shaped like `rediss://default:PASSWORD@HOST:PORT`.
3. For local Redis, use `redis://127.0.0.1:6379`.
4. Copy `.env.example` to `.env.local`.
5. Fill in MySQL credentials, a strong `SESSION_SECRET`, and `REDIS_URL`.

PowerShell:
```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Command Prompt:
```cmd
copy .env.example .env.local
notepad .env.local
```

Never commit `.env.local` or share your Redis password.

### 3. Install and run
```bash
npm install
npm run redis:check
npm run dev
```

Open `http://localhost:3000/register`, create an account, sign in and use the dashboard.

### 4. Demonstrate Redis in the application
1. Sign in to the dashboard.
2. Check the **Redis NoSQL monitor** section.
3. Register an incident. Redis receives an incident snapshot and an `INCIDENT_CREATED` activity item.
4. Auto-assign a resource. Redis receives an updated resource hash and `RESOURCE_ALLOCATED` activity item.
5. Resolve the incident. MySQL returns the unit; Redis receives the updated resource snapshot and `INCIDENT_RESOLVED` event.

You can also inspect Redis keys using Redis Insight or Redis CLI.

## Redis CLI commands for DBMS viva

```text
PING
SMEMBERS smart-emergency:resources
HGETALL smart-emergency:resource:1
HGETALL smart-emergency:incident:1
LRANGE smart-emergency:activity 0 9
```

Use `SCAN` instead of `KEYS` when browsing production Redis databases.

## API endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End session |
| GET / POST | `/api/incidents` | List and create incidents |
| PATCH / DELETE | `/api/incidents/:id` | Update status / admin delete |
| GET | `/api/resources` | List resources with allocation counts; refresh Redis cache |
| GET | `/api/allocations` | Allocation history using MySQL JOINs |
| GET | `/api/dashboard` | Aggregated SQL summary |
| POST | `/api/assign` | Transactional resource allocation |
| GET | `/api/redis/status` | Redis connection, cache count and recent activity |

## Allocation rules

- Medical → Ambulance
- Fire → Fire Engine
- Police → Police Unit
- Rescue → Rescue Team
- Disaster → Rescue Team
- Select an available matching resource with the most available units; ties are broken by ID.
- Severity order: Critical, High, Medium, Low.
- If no matching resource is available, return a conflict response.

## Resource release behavior

When an incident changes to `Resolved`, the API uses a MySQL transaction and row locks to:
1. Lock the incident and its assigned resource.
2. Return one unit without exceeding the resource capacity.
3. Preserve Maintenance status; otherwise set the resource status according to the remaining units.
4. Mark the latest active allocation record with `released_at`.
5. Commit the incident status change.

The release happens only on the first transition to Resolved, preventing duplicate returns.

## Academic viva explanation

"We use MySQL as our primary relational database to store users, incidents, resources and allocation records. We use Redis as our NoSQL key-value database. Redis stores resource availability snapshots and recent incident activity using Hash, Set and List data structures. MySQL remains the source of truth for transactions, while Redis provides fast lookup and caching."

## Safety and production limitations

This is a coursework prototype. It is not connected to emergency services, GPS or real dispatch networks. Before production use, the application would need stronger authorization, rate limiting, CSRF protections, operational monitoring, backups, cache invalidation strategy and formal safety review.
