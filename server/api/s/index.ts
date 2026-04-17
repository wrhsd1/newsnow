import type { SourceID, SourceResponse } from "@shared/types"
import { getters } from "#/getters"
import { readSourceResponse } from "#/services/source-reader"
import { refreshSource, shouldRefreshSource } from "#/services/source-refresh"

export default defineEventHandler(async (event): Promise<SourceResponse> => {
  try {
    const query = getQuery(event)
    const latest = query.latest !== undefined && query.latest !== "false"
    const refresh = query.refresh !== undefined && query.refresh !== "false"
    let id = query.id as SourceID
    const isValid = (value: SourceID) => !value || !sources[value] || !getters[value]

    if (isValid(id)) {
      const redirectID = sources?.[id]?.redirect
      if (redirectID) id = redirectID
      if (isValid(id)) throw new Error("Invalid source id")
    }

    const persisted = await readSourceResponse(id)

    if (latest && !event.context.disabledLogin && !event.context.user) {
      return persisted ?? await refreshSource(id)
    }

    if (!latest && !refresh) {
      if (persisted) {
        if (await shouldRefreshSource(id)) {
          if (event.context.waitUntil) event.context.waitUntil(refreshSource(id))
          else void refreshSource(id)
        }
        return persisted
      }

      return await refreshSource(id)
    }

    return await refreshSource(id)
  } catch (e: any) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})

