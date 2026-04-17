import type { SourceID } from "@shared/types"
import { readEntireSourceResponses } from "#/services/source-reader"

export default defineEventHandler(async (event) => {
  try {
    const { sources: _ }: { sources: SourceID[] } = await readBody(event)
    const ids = _?.filter(k => sources[k])
    if (ids?.length) {
      return await readEntireSourceResponses(ids)
    }
  } catch {
    //
  }
})

