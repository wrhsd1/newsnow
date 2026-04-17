import type { SourceID } from "@shared/types"
import { getters } from "#/getters"

export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  return (Object.keys(sources) as SourceID[])
    .filter(id => !!getters[id])
    .map((id) => ({
      id,
      name: sources[id].name,
      title: sources[id].title,
      home: sources[id].home,
      rssUrl: `${origin}/api/rss/${id}`,
    }))
})
