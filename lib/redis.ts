import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;
type RedisGlobal = typeof globalThis & {
  __smartEmergencyRedisClient?: RedisClient;
  __smartEmergencyRedisConnectPromise?: Promise<RedisClient>;
};

const redisGlobal = globalThis as RedisGlobal;

export type ResourceCacheRecord = {
  id: number | string;
  name: string;
  resource_type: string;
  capacity: number | string;
  available_units: number | string;
  location: string;
  status: string;
};

export type RedisActivityEvent = {
  eventType: string;
  incidentId?: number | string;
  title?: string;
  emergencyType?: string;
  severity?: string;
  status?: string;
  location?: string;
  resourceId?: number | string;
  resourceName?: string;
  allocatedBy?: number | string;
  message?: string;
  [key: string]: unknown;
};

const RESOURCE_SET_KEY = "smart-emergency:resources";
const ACTIVITY_LIST_KEY = "smart-emergency:activity";
const ACTIVITY_LIMIT = 30;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Redis is an optional NoSQL cache for this coursework application.
 * MySQL remains the authoritative database. If REDIS_URL is not set,
 * callers receive null and the application continues using MySQL.
 */
export async function getRedisClient(): Promise<RedisClient | null> {
  if (!process.env.REDIS_URL) return null;

  if (!redisGlobal.__smartEmergencyRedisClient) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => {
      console.error("Redis client error:", error.message);
    });
    redisGlobal.__smartEmergencyRedisClient = client;
  }

  const client = redisGlobal.__smartEmergencyRedisClient;

  if (!client.isOpen) {
    if (!redisGlobal.__smartEmergencyRedisConnectPromise) {
      redisGlobal.__smartEmergencyRedisConnectPromise = client
        .connect()
        .then(() => client)
        .finally(() => {
          redisGlobal.__smartEmergencyRedisConnectPromise = undefined;
        });
    }
    await redisGlobal.__smartEmergencyRedisConnectPromise;
  }

  return client;
}

function resourceKey(id: number | string): string {
  return `smart-emergency:resource:${id}`;
}

export async function cacheResource(resource: ResourceCacheRecord): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const id = String(resource.id);
  await client.hSet(resourceKey(id), {
    id,
    name: String(resource.name),
    resourceType: String(resource.resource_type),
    capacity: String(resource.capacity),
    availableUnits: String(resource.available_units),
    location: String(resource.location),
    status: String(resource.status),
    cachedAt: new Date().toISOString()
  });
  await client.expire(resourceKey(id), 60 * 60);
  await client.sAdd(RESOURCE_SET_KEY, id);

  return true;
}

/**
 * Refresh the Redis resource cache from MySQL query results.
 * This function never changes MySQL records.
 */
export async function syncResourceSnapshot(resources: ResourceCacheRecord[]): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const currentIds = new Set(resources.map((resource) => String(resource.id)));
  const oldIds = await client.sMembers(RESOURCE_SET_KEY);

  for (const oldId of oldIds) {
    if (!currentIds.has(oldId)) {
      await client.del(resourceKey(oldId));
      await client.sRem(RESOURCE_SET_KEY, oldId);
    }
  }

  for (const resource of resources) {
    await cacheResource(resource);
  }

  return true;
}

/**
 * Store a compact incident snapshot for quick NoSQL lookup.
 */
export async function cacheIncidentSnapshot(input: {
  incidentId: number | string;
  title: string;
  emergencyType: string;
  severity: string;
  status: string;
  location: string;
}): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const key = `smart-emergency:incident:${input.incidentId}`;
  await client.hSet(key, {
    incidentId: String(input.incidentId),
    title: input.title,
    emergencyType: input.emergencyType,
    severity: input.severity,
    status: input.status,
    location: input.location,
    cachedAt: new Date().toISOString()
  });
  await client.expire(key, 60 * 60);

  return true;
}

/**
 * Record an append-only recent activity item in a Redis List.
 */
export async function recordRedisActivity(event: RedisActivityEvent): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const item = JSON.stringify({
    ...event,
    createdAt: new Date().toISOString()
  });

  await client.lPush(ACTIVITY_LIST_KEY, item);
  await client.lTrim(ACTIVITY_LIST_KEY, 0, ACTIVITY_LIMIT - 1);
  await client.expire(ACTIVITY_LIST_KEY, 60 * 60 * 24 * 14);

  return true;
}

export async function getRedisDashboardStatus() {
  if (!isRedisConfigured()) {
    return {
      configured: false,
      connected: false,
      resourceCount: 0,
      recentActivity: [],
      message: "Redis is not configured. Add REDIS_URL to .env.local."
    };
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return {
        configured: false,
        connected: false,
        resourceCount: 0,
        recentActivity: [],
        message: "Redis is not configured."
      };
    }

    const [ping, resourceCount, rawActivity] = await Promise.all([
      client.ping(),
      client.sCard(RESOURCE_SET_KEY),
      client.lRange(ACTIVITY_LIST_KEY, 0, 9)
    ]);

    const recentActivity = rawActivity.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return { eventType: "UNKNOWN", message: item };
      }
    });

    return {
      configured: true,
      connected: ping === "PONG",
      resourceCount,
      recentActivity,
      message: ping === "PONG" ? "Redis is connected." : "Redis did not respond."
    };
  } catch (error) {
    console.error("Redis dashboard status error:", error);
    return {
      configured: true,
      connected: false,
      resourceCount: 0,
      recentActivity: [],
      message: "Redis connection failed. Check REDIS_URL and your Redis service."
    };
  }
}
