import type { SourceID } from "@shared/types"
import { ensureSourceState } from "./source-config"
import { refreshSource, shouldRefreshSource } from "./source-refresh"

export async function refreshDueSources() {
  const ids = Object.keys(sources).filter(id => !!sources[id as SourceID]?.home) as SourceID[]
  const due: SourceID[] = []

  for (const id of ids) {
    const state = await ensureSourceState(id)
    if (!state.refreshEnabled) continue
    if (await shouldRefreshSource(id)) due.push(id)
  }

  return Promise.allSettled(due.map(id => refreshSource(id)))
}
