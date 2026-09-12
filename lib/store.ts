import { Redis } from "@upstash/redis";
import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import {
  BROWSER_HOURLY_CAP,
  COMMAND_STOP,
  GLOBAL_DAILY_CAP,
  PLAN_TTL_SECONDS
} from "./constants";
import type { SavedPlan } from "./types";
import { savedPlanSchema } from "./schema";

export type CreateResult =
  | { ok: true; id: string; replay: boolean }
  | { ok: false; reason: "global-cap" | "browser-cap" | "collision" | "unavailable" };

export type DeleteResult = "deleted" | "missing" | "unauthorized" | "unavailable";

export interface PlanStore {
  create(plan: SavedPlan, browserKey: string, idempotencyKey: string): Promise<CreateResult>;
  get(id: string): Promise<SavedPlan | null>;
  delete(id: string, deletionHash: string): Promise<DeleteResult>;
}

type BlobIndex = {
  schemaVersion: 1;
  dailyDate: string;
  dailyWrites: number;
  browserWrites: Record<string, number[]>;
  idempotency: Record<string, { id: string; expiresAt: number }>;
};

const BLOB_INDEX_PATH = "aperture-hours/index-v1.json";
const BLOB_PLAN_PREFIX = "aperture-hours/plans/";

function emptyBlobIndex(now = Date.now()): BlobIndex {
  return { schemaVersion: 1, dailyDate: new Date(now).toISOString().slice(0, 10), dailyWrites: 0, browserWrites: {}, idempotency: {} };
}

function normalizeBlobIndex(value: unknown, now: number): BlobIndex {
  if (!value || typeof value !== "object") return emptyBlobIndex(now);
  const candidate = value as Partial<BlobIndex>;
  const date = new Date(now).toISOString().slice(0, 10);
  return {
    schemaVersion: 1,
    dailyDate: date,
    dailyWrites: candidate.dailyDate === date && Number.isSafeInteger(candidate.dailyWrites) ? Math.max(0, candidate.dailyWrites ?? 0) : 0,
    browserWrites: candidate.browserWrites && typeof candidate.browserWrites === "object" ? candidate.browserWrites : {},
    idempotency: candidate.idempotency && typeof candidate.idempotency === "object" ? candidate.idempotency : {}
  };
}

async function readJsonBlob(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  // Private uncached GETs expose a weak `W/"…"` ETag, while conditional
  // writes and deletes require the corresponding strong `"…"` validator.
  return { value: await new Response(result.stream).json() as unknown, etag: result.blob.etag.replace(/^W\//, ""), uploadedAt: result.blob.uploadedAt };
}

type MemoryState = {
  plans: Map<string, { plan: SavedPlan; expiresAt: number }>;
  idempotency: Map<string, { id: string; expiresAt: number }>;
  browserWrites: Map<string, number[]>;
  dailyWrites: Map<string, number>;
};

declare global {
  var apertureMemoryStore: MemoryState | undefined;
}

function memoryState() {
  globalThis.apertureMemoryStore ??= {
    plans: new Map(),
    idempotency: new Map(),
    browserWrites: new Map(),
    dailyWrites: new Map()
  };
  return globalThis.apertureMemoryStore;
}

class MemoryPlanStore implements PlanStore {
  async create(plan: SavedPlan, browserKey: string, idempotencyKey: string): Promise<CreateResult> {
    const state = memoryState();
    const now = Date.now();
    const idempotencyId = `${browserKey}:${idempotencyKey}`;
    const existing = state.idempotency.get(idempotencyId);
    if (existing && existing.expiresAt > now) return { ok: true, id: existing.id, replay: true };
    const dateKey = new Date(now).toISOString().slice(0, 10);
    if ((state.dailyWrites.get(dateKey) ?? 0) >= GLOBAL_DAILY_CAP) return { ok: false, reason: "global-cap" };
    const recent = (state.browserWrites.get(browserKey) ?? []).filter((time) => time > now - 3_600_000);
    if (recent.length >= BROWSER_HOURLY_CAP) return { ok: false, reason: "browser-cap" };
    if (state.plans.has(plan.id)) return { ok: false, reason: "collision" };
    state.plans.set(plan.id, { plan, expiresAt: now + PLAN_TTL_SECONDS * 1000 });
    state.idempotency.set(idempotencyId, { id: plan.id, expiresAt: now + 3_600_000 });
    state.dailyWrites.set(dateKey, (state.dailyWrites.get(dateKey) ?? 0) + 1);
    state.browserWrites.set(browserKey, [...recent, now]);
    return { ok: true, id: plan.id, replay: false };
  }

  async get(id: string) {
    const item = memoryState().plans.get(id);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      memoryState().plans.delete(id);
      return null;
    }
    const parsed = savedPlanSchema.safeParse(item.plan);
    return parsed.success ? parsed.data : null;
  }

  async delete(id: string, deletionHash: string): Promise<DeleteResult> {
    const item = memoryState().plans.get(id);
    if (!item || item.expiresAt <= Date.now()) return "missing";
    if (item.plan.deletionHash !== deletionHash) return "unauthorized";
    memoryState().plans.delete(id);
    return "deleted";
  }
}

class BlobPlanStore implements PlanStore {
  private planPath(id: string) { return `${BLOB_PLAN_PREFIX}${id}.json`; }

  private async readIndex(now: number) {
    const result = await readJsonBlob(BLOB_INDEX_PATH);
    return { state: normalizeBlobIndex(result?.value, now), etag: result?.etag ?? null };
  }

  private async writeIndex(state: BlobIndex, etag: string | null) {
    return put(BLOB_INDEX_PATH, JSON.stringify(state), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: Boolean(etag),
      ...(etag ? { ifMatch: etag } : {})
    });
  }

  async create(plan: SavedPlan, browserKey: string, idempotencyKey: string): Promise<CreateResult> {
    const token = digest(`${browserKey}:${idempotencyKey}`);
    const browser = digest(browserKey);
    try {
      const now = Date.now();
      const { state } = await this.readIndex(now);
      const replay = state.idempotency[token];
      if (replay?.expiresAt && replay.expiresAt > now) return { ok: true, id: replay.id, replay: true };
      if (state.dailyWrites >= GLOBAL_DAILY_CAP) return { ok: false, reason: "global-cap" };
      const recent = Array.isArray(state.browserWrites[browser])
        ? state.browserWrites[browser].filter((time) => Number.isFinite(time) && time > now - 3_600_000)
        : [];
      if (recent.length >= BROWSER_HOURLY_CAP) return { ok: false, reason: "browser-cap" };
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    const planPath = this.planPath(plan.id);
    try {
      await put(planPath, JSON.stringify(plan), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false
      });
    } catch {
      return { ok: false, reason: "collision" };
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const now = Date.now();
      try {
        const { state, etag } = await this.readIndex(now);
        const replay = state.idempotency[token];
        if (replay?.expiresAt && replay.expiresAt > now) {
          if (replay.id !== plan.id) await del(planPath).catch(() => undefined);
          return { ok: true, id: replay.id, replay: true };
        }
        if (state.dailyWrites >= GLOBAL_DAILY_CAP) {
          await del(planPath).catch(() => undefined);
          return { ok: false, reason: "global-cap" };
        }
        const recent = Array.isArray(state.browserWrites[browser])
          ? state.browserWrites[browser].filter((time) => Number.isFinite(time) && time > now - 3_600_000)
          : [];
        if (recent.length >= BROWSER_HOURLY_CAP) {
          await del(planPath).catch(() => undefined);
          return { ok: false, reason: "browser-cap" };
        }
        state.idempotency = Object.fromEntries(Object.entries(state.idempotency).filter(([, item]) => item?.expiresAt > now));
        state.browserWrites = Object.fromEntries(Object.entries(state.browserWrites)
          .map(([key, times]) => [key, Array.isArray(times) ? times.filter((time) => Number.isFinite(time) && time > now - 3_600_000) : []])
          .filter(([, times]) => (times as number[]).length > 0));
        state.dailyWrites += 1;
        state.browserWrites[browser] = [...recent, now];
        state.idempotency[token] = { id: plan.id, expiresAt: now + 3_600_000 };
        await this.writeIndex(state, etag);
        return { ok: true, id: plan.id, replay: false };
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || attempt < 3) continue;
      }
    }
    await del(planPath).catch(() => undefined);
    return { ok: false, reason: "unavailable" };
  }

  async get(id: string) {
    const result = await readJsonBlob(this.planPath(id));
    if (!result) return null;
    const parsed = savedPlanSchema.safeParse(result.value);
    if (!parsed.success) return null;
    if (Date.parse(parsed.data.createdAt) + PLAN_TTL_SECONDS * 1000 <= Date.now()) {
      await del(this.planPath(id), { ifMatch: result.etag }).catch(() => undefined);
      return null;
    }
    return parsed.data;
  }

  async delete(id: string, deletionHash: string): Promise<DeleteResult> {
    const result = await readJsonBlob(this.planPath(id));
    if (!result) return "missing";
    const parsed = savedPlanSchema.safeParse(result.value);
    if (!parsed.success || Date.parse(parsed.data.createdAt) + PLAN_TTL_SECONDS * 1000 <= Date.now()) {
      await del(this.planPath(id), { ifMatch: result.etag }).catch(() => undefined);
      return "missing";
    }
    if (parsed.data.deletionHash !== deletionHash) return "unauthorized";
    try {
      await del(this.planPath(id), { ifMatch: result.etag });
      return "deleted";
    } catch {
      return "unavailable";
    }
  }
}

export async function cleanupExpiredBlobPlans(now = Date.now()) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { scanned: 0, deleted: 0, available: false };
  let cursor: string | undefined;
  let scanned = 0;
  const expired: string[] = [];
  do {
    const page = await list({ prefix: BLOB_PLAN_PREFIX, limit: 1000, cursor });
    scanned += page.blobs.length;
    for (const blob of page.blobs) {
      if (blob.uploadedAt.getTime() + PLAN_TTL_SECONDS * 1000 <= now) expired.push(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (expired.length) await del(expired);
  return { scanned, deleted: expired.length, available: true };
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const createScript = `
local replay = redis.call('GET', KEYS[1])
if replay then return {'replay', replay} end
local global_count = tonumber(redis.call('GET', KEYS[2]) or '0')
if global_count >= tonumber(ARGV[1]) then return {'global-cap', ''} end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', tonumber(ARGV[2]) - 3600000)
local browser_count = tonumber(redis.call('ZCARD', KEYS[3]))
if browser_count >= tonumber(ARGV[3]) then return {'browser-cap', ''} end
local created = redis.call('SET', KEYS[4], ARGV[4], 'EX', ARGV[5], 'NX')
if not created then return {'collision', ''} end
redis.call('SET', KEYS[5], ARGV[6], 'EX', ARGV[5], 'NX')
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[7])
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[8])
redis.call('EXPIRE', KEYS[3], 3600)
redis.call('SET', KEYS[1], ARGV[8], 'EX', 3600, 'NX')
return {'ok', ARGV[8]}
`;

const deleteScript = `
local stored = redis.call('GET', KEYS[2])
if not stored then return 'missing' end
if stored ~= ARGV[1] then return 'unauthorized' end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return 'deleted'
`;

class RedisPlanStore implements PlanStore {
  constructor(private readonly redis: Redis) {}

  async create(plan: SavedPlan, browserKey: string, idempotencyKey: string): Promise<CreateResult> {
    const now = Date.now();
    const utcDate = new Date(now).toISOString().slice(0, 10);
    const nextMidnight = Date.parse(`${utcDate}T00:00:00.000Z`) + 86_400_000;
    const dailyTtl = Math.max(60, Math.ceil((nextMidnight - now) / 1000));
    const token = digest(`${browserKey}:${idempotencyKey}`);
    const browser = digest(browserKey);
    const keys = [
      `ah:idempotency:${token}`,
      `ah:global:${utcDate}`,
      `ah:browser:${browser}`,
      `ah:plan:${plan.id}`,
      `ah:auth:${plan.id}`
    ];
    const response = await this.redis.eval(
      createScript,
      keys,
      [
        String(GLOBAL_DAILY_CAP),
        String(now),
        String(BROWSER_HOURLY_CAP),
        JSON.stringify(plan),
        String(PLAN_TTL_SECONDS),
        plan.deletionHash,
        String(dailyTtl),
        plan.id
      ]
    ) as [string, string];
    const [status, id] = response;
    if (status === "ok" || status === "replay") return { ok: true, id, replay: status === "replay" };
    if (status === "global-cap" || status === "browser-cap" || status === "collision") {
      return { ok: false, reason: status };
    }
    return { ok: false, reason: "unavailable" };
  }

  async get(id: string) {
    const value = await this.redis.get<unknown>(`ah:plan:${id}`);
    const parsed = savedPlanSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  async delete(id: string, deletionHash: string): Promise<DeleteResult> {
    const result = await this.redis.eval(
      deleteScript,
      [`ah:plan:${id}`, `ah:auth:${id}`],
      [deletionHash]
    );
    return result === "deleted" || result === "missing" || result === "unauthorized" ? result : "unavailable";
  }
}

export function savingAvailability() {
  if (process.env.SAVE_FEATURE_ENABLED !== "1") return { enabled: false, reason: "feature-gate" as const };
  if (process.env.USE_MEMORY_STORE === "1" && process.env.NODE_ENV !== "production") {
    return { enabled: true, reason: "memory" as const };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return { enabled: true, reason: "blob" as const };
  const commands = Number(process.env.UPSTASH_COMMANDS_OBSERVED);
  if (redisClient() && !Number.isFinite(commands)) return { enabled: false, reason: "usage-unverified" as const };
  if (redisClient() && commands >= COMMAND_STOP) return { enabled: false, reason: "command-stop" as const };
  return redisClient()
    ? { enabled: true, reason: "redis" as const }
    : { enabled: false, reason: "storage-unavailable" as const };
}

export function getPlanStore(): PlanStore | null {
  if (process.env.USE_MEMORY_STORE === "1" && process.env.NODE_ENV !== "production") return new MemoryPlanStore();
  if (process.env.BLOB_READ_WRITE_TOKEN) return new BlobPlanStore();
  const redis = redisClient();
  return redis ? new RedisPlanStore(redis) : null;
}
