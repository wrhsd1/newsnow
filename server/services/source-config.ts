import process from "node:process"
import type { SourceID } from "@shared/types"
import type { SourceConfigValue, SourceState } from "../types"
import { getSourceStateTable } from "../database/source-state"

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name]
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const DefaultRetentionHours = getNumberEnv("DEFAULT_RETENTION_HOURS", 48)
const DefaultMinKeepCount = getNumberEnv("DEFAULT_MIN_KEEP_COUNT", 100)
const DefaultRefreshEnabled = process.env.DEFAULT_REFRESH_ENABLED !== "false"
const DefaultRefreshInterval = getNumberEnv("DEFAULT_REFRESH_INTERVAL_MS", 10 * 60 * 1000)
const DefaultRealtimeRefreshInterval = getNumberEnv("DEFAULT_REALTIME_REFRESH_INTERVAL_MS", 2 * 60 * 1000)
const DefaultFastRefreshInterval = getNumberEnv("DEFAULT_FAST_REFRESH_INTERVAL_MS", 5 * 60 * 1000)
const DefaultCommonRefreshInterval = getNumberEnv("DEFAULT_COMMON_REFRESH_INTERVAL_MS", 30 * 60 * 1000)
const DefaultSlowRefreshInterval = getNumberEnv("DEFAULT_SLOW_REFRESH_INTERVAL_MS", 60 * 60 * 1000)

function resolveRefreshInterval(interval: number) {
  switch (interval) {
    case 2 * 60 * 1000:
      return DefaultRealtimeRefreshInterval
    case 5 * 60 * 1000:
      return DefaultFastRefreshInterval
    case 30 * 60 * 1000:
      return DefaultCommonRefreshInterval
    case 60 * 60 * 1000:
      return DefaultSlowRefreshInterval
    case 10 * 60 * 1000:
      return DefaultRefreshInterval
    default:
      return interval
  }
}

export function getDefaultSourceConfig(sourceId: SourceID): SourceConfigValue {
  const source = sources[sourceId]
  return {
    refreshEnabled: source.refreshEnabled ?? DefaultRefreshEnabled,
    refreshInterval: resolveRefreshInterval(source.interval),
    retentionHours: source.retentionHours ?? DefaultRetentionHours,
    minKeepCount: source.minKeepCount ?? DefaultMinKeepCount,
  }
}

export async function ensureSourceState(sourceId: SourceID): Promise<SourceState> {
  const defaults = getDefaultSourceConfig(sourceId)
  const table = await getSourceStateTable()
  if (!table) {
    return {
      sourceId,
      consecutiveFailures: 0,
      ...defaults,
    }
  }

  const current = await table.get(sourceId)
  if (!current) {
    await table.upsert(sourceId, defaults)
    return {
      sourceId,
      consecutiveFailures: 0,
      ...defaults,
    }
  }

  if (
    current.refreshInterval !== defaults.refreshInterval
    || current.retentionHours !== defaults.retentionHours
    || current.minKeepCount !== defaults.minKeepCount
  ) {
    await table.upsert(sourceId, {
      refreshEnabled: current.refreshEnabled,
      refreshInterval: defaults.refreshInterval,
      retentionHours: defaults.retentionHours,
      minKeepCount: defaults.minKeepCount,
    })
    return {
      ...current,
      refreshInterval: defaults.refreshInterval,
      retentionHours: defaults.retentionHours,
      minKeepCount: defaults.minKeepCount,
    }
  }

  return current
}
