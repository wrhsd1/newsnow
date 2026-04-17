import type { SourceID } from "@shared/types"
import { buildSourceRss } from "#/services/source-feed"

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") as SourceID
  if (!id || !sources[id]) {
    throw createError({
      statusCode: 404,
      message: "Source not found",
    })
  }

  setHeader(event, "content-type", "application/rss+xml; charset=utf-8")
  return await buildSourceRss(id)
})
