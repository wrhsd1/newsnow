import dayjs from "dayjs/esm"
import type { SourceID } from "@shared/types"
import { readSourceResponse } from "./source-reader"

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export async function buildSourceRss(sourceId: SourceID) {
  const response = await readSourceResponse(sourceId)
  if (!response) throw new Error("Source data not found")
  const source = sources[sourceId]
  const items = response.items.slice(0, 100).map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid>${escapeXml(String(item.id))}</guid>
      ${(item.pubDate || item.extra?.date) ? `<pubDate>${dayjs(item.pubDate || item.extra?.date).toDate().toUTCString()}</pubDate>` : ""}
      <description><![CDATA[${item.extra?.hover ?? item.title}]]></description>
    </item>`).join("")

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(source.title ? `${source.name} - ${source.title}` : source.name)}</title>
    <link>${escapeXml(source.home ?? "")}</link>
    <description>${escapeXml(source.desc ?? `${source.name} feed`)}</description>
    <lastBuildDate>${new Date(response.updatedTime).toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`
}
