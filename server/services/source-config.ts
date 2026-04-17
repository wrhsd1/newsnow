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

export function getDefaultSourceConfig(sourceId: SourceID): SourceConfigValue {
  const source = sources[sourceId]
  return {
    refreshEnabled: source.refreshEnabled ?? DefaultRefreshEnabled,
    refreshInterval: source.interval,
    retentionHours: source.retentionHours ?? DefaultRetentionHours,
    minKeepCount: source.minKeepCount ?? DefaultMinKeepCount,
  }
}

export async function ensureSourceState(sourceId: SourceID): Promise<SourceState> {
  const table = await getSourceStateTable()
  if (!table) {
    return {
      sourceId,
      ...getDefaultSourceConfig(sourceId),
    }
  }
  const current = await table.get(sourceId)
  if (current) return current
  const defaults = getDefaultSourceConfig(sourceId)
  await table.upsert(sourceId, defaults)
  return {
    sourceId,
    ...defaults,
  }
}
