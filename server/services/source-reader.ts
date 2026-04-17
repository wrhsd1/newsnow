import type { SourceID, SourceResponse } from "@shared/types"
import { getCacheTable } from "../database/cache"
import { getSourceItemTable } from "../database/source-item"
import { ensureSourceState } from "./source-config"

export async function readSourceResponse(sourceId: SourceID): Promise<SourceResponse | undefined> {
  const sourceItemTable = await getSourceItemTable()
  const state = await ensureSourceState(sourceId)
  const minSortTime = Date.now() - state.retentionHours * 60 * 60 * 1000
  const items = sourceItemTable ? await sourceItemTable.listRetained(sourceId, minSortTime, state.minKeepCount) : []
  if (items.length) {
    return {
      status: "success",
      id: sourceId,
      updatedTime: state.lastSuccessAt ?? items[0].fetchedAt,
      items: items.map(item => item.item),
    }
  }

  const cacheTable = await getCacheTable()
  const cache = cacheTable ? await cacheTable.get(sourceId) : undefined
  if (!cache) return undefined
  return {
    status: "cache",
    id: sourceId,
    updatedTime: cache.updated,
    items: cache.items,
  }
}

export async function readEntireSourceResponses(sourceIds: SourceID[]) {
  const res = await Promise.all(sourceIds.map(async (id) => {
    const response = await readSourceResponse(id)
    return response ? { ...response, id } : undefined
  }))
  return res.filter(Boolean) as SourceResponse[]
}
