import type { NewsItem, SourceID } from "@shared/types"

export function getItemSortTime(item: NewsItem, fallbackTime = Date.now()) {
  const raw = item.pubDate ?? item.extra?.date
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string") {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
    const time = new Date(raw).valueOf()
    if (Number.isFinite(time)) return time
  }
  return fallbackTime
}

export function normalizeSourceItems(sourceId: SourceID, items: NewsItem[], fetchedAt = Date.now()) {
  return items
    .filter(item => item.id !== undefined && item.id !== null)
    .map(item => ({
      sourceId,
      itemId: String(item.id),
      sortTime: getItemSortTime(item, fetchedAt),
      fetchedAt,
      item,
    }))
    .sort((a, b) => b.sortTime - a.sortTime || b.fetchedAt - a.fetchedAt)
}
