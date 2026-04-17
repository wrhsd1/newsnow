import { getters } from "../getters"
import type { SourceID, SourceResponse } from "@shared/types"
import { getCacheTable } from "../database/cache"
import { getSourceItemTable } from "../database/source-item"
import { getSourceStateTable } from "../database/source-state"
import { ensureSourceState } from "./source-config"
import { normalizeSourceItems } from "./source-normalize"
import { readSourceResponse } from "./source-reader"

const SnapshotLimit = 100

export async function pruneSource(sourceId: SourceID) {
  const state = await ensureSourceState(sourceId)
  const table = await getSourceItemTable()
  if (!table) return 0
  const minSortTime = Date.now() - state.retentionHours * 60 * 60 * 1000
  const deleted = await table.deleteExpired(sourceId, minSortTime, state.minKeepCount)
  const stateTable = await getSourceStateTable()
  if (stateTable) await stateTable.touchCleanup(sourceId, Date.now())
  return deleted
}

export async function refreshSource(sourceId: SourceID): Promise<SourceResponse> {
  const fetchedAt = Date.now()
  await ensureSourceState(sourceId)
  const stateTable = await getSourceStateTable()
  if (stateTable) await stateTable.touchRefresh(sourceId, fetchedAt)

  try {
    const items = await getters[sourceId]()
    const normalized = normalizeSourceItems(sourceId, items, fetchedAt)
    const sourceItemTable = await getSourceItemTable()
    if (sourceItemTable) await sourceItemTable.upsert(sourceId, normalized)

    const cacheTable = await getCacheTable()
    const snapshot = normalized.slice(0, SnapshotLimit).map(item => item.item)
    if (cacheTable && snapshot.length) await cacheTable.set(sourceId, snapshot)

    await pruneSource(sourceId)
    if (stateTable) await stateTable.touchSuccess(sourceId, fetchedAt)

    return (await readSourceResponse(sourceId)) ?? {
      status: "success",
      id: sourceId,
      updatedTime: fetchedAt,
      items: snapshot,
    }
  } catch (error) {
    if (stateTable) await stateTable.touchError(sourceId, error instanceof Error ? error.message : String(error))
    const fallback = await readSourceResponse(sourceId)
    if (fallback) return { ...fallback, status: "cache" }
    throw error
  }
}

export async function shouldRefreshSource(sourceId: SourceID, force = false) {
  if (force) return true
  const state = await ensureSourceState(sourceId)
  if (!state.refreshEnabled) return false
  const baseline = state.lastRefreshAt ?? state.lastSuccessAt
  if (!baseline) return true
  return Date.now() - baseline >= state.refreshInterval
}
