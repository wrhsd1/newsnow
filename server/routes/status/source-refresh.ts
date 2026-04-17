import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { getSourceStateTable } from "#/database/source-state"
import { getDefaultSourceConfig } from "#/services/source-config"

const TimeZone = "Asia/Shanghai"
const DateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const RefreshGroups: Record<number, string> = {
  120000: "Realtime",
  300000: "Fast",
  600000: "Default",
  1800000: "Common",
  3600000: "Slow",
}

function getRefreshGroup(interval: number) {
  return RefreshGroups[interval] ?? `Custom(${interval})`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatTime(timestamp?: number) {
  if (!timestamp) return "未刷新"
  return DateFormatter.format(timestamp).replaceAll("/", "-")
}

function formatInterval(interval: number) {
  return `${interval / 60000} 分钟`
}

function formatNextRefresh(options: {
  refreshEnabled: boolean
  lastRefreshAt?: number
  refreshInterval: number
  consecutiveFailures: number
}) {
  if (!options.refreshEnabled) {
    return options.consecutiveFailures >= 5 ? `已禁用（失败 ${options.consecutiveFailures}/5）` : "已禁用"
  }

  const nextRefreshAt = options.lastRefreshAt ? options.lastRefreshAt + options.refreshInterval : undefined
  const nextText = nextRefreshAt ? formatTime(nextRefreshAt) : "立即"
  if (options.consecutiveFailures > 0) return `失败 ${options.consecutiveFailures}/5，${nextText}`
  return nextText
}

export default defineEventHandler(async (event) => {
  const table = await getSourceStateTable()
  const sourceStates = table ? await table.list() : []
  const stateMap = new Map(sourceStates.map(state => [state.sourceId, state]))

  const rows = Object.entries(sources)
    .filter(([, source]) => !source.redirect)
    .sort(([leftId, leftSource], [rightId, rightSource]) => {
      if (leftSource.interval !== rightSource.interval) return leftSource.interval - rightSource.interval
      return leftId.localeCompare(rightId)
    })
    .map(([sourceId, source]) => {
      const state = stateMap.get(sourceId as SourceID)
      const defaults = getDefaultSourceConfig(sourceId as SourceID)
      const refreshEnabled = state?.refreshEnabled ?? defaults.refreshEnabled
      const refreshInterval = state?.refreshInterval ?? defaults.refreshInterval
      const lastRefreshAt = state?.lastRefreshAt
      const lastSuccessAt = state?.lastSuccessAt
      const consecutiveFailures = state?.consecutiveFailures ?? 0
      const lastError = state?.lastError
      const sourceName = source.title ? `${source.name}-${source.title}` : source.name

      return {
        sourceId,
        sourceName,
        refreshGroup: getRefreshGroup(refreshInterval),
        refreshEnabled,
        refreshInterval,
        lastRefreshAt,
        lastSuccessAt,
        consecutiveFailures,
        lastError,
      }
    })

  const generatedAt = Date.now()
  const tableRows = rows.map(row => `
      <tr>
        <td>${escapeHtml(row.sourceName)}<br><code>${escapeHtml(row.sourceId)}</code></td>
        <td>${escapeHtml(row.refreshGroup)}</td>
        <td>${escapeHtml(formatInterval(row.refreshInterval))}</td>
        <td>${escapeHtml(formatTime(row.lastSuccessAt))}</td>
        <td>${escapeHtml(formatNextRefresh({
          refreshEnabled: row.refreshEnabled,
          lastRefreshAt: row.lastRefreshAt,
          refreshInterval: row.refreshInterval,
          consecutiveFailures: row.consecutiveFailures,
        }))}</td>
        <td>${escapeHtml(row.lastError ?? "-")}</td>
      </tr>`).join("")

  setHeader(event, "content-type", "text/html; charset=utf-8")

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NewsNow 刷新状态</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 24px;
      color: #111827;
      background: #ffffff;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    p {
      margin: 0 0 16px;
      color: #4b5563;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      border: 1px solid #e5e7eb;
    }
    th {
      position: sticky;
      top: 0;
      background: #f9fafb;
    }
    tr:nth-child(even) {
      background: #fcfcfd;
    }
    code {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 4px;
      border-radius: 4px;
      background: #f3f4f6;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #e5e7eb;
        background: #111827;
      }
      p {
        color: #9ca3af;
      }
      th, td {
        border-color: #374151;
      }
      th {
        background: #1f2937;
      }
      tr:nth-child(even) {
        background: #0f172a;
      }
      code {
        background: #1f2937;
      }
    }
  </style>
</head>
<body>
  <h1>NewsNow 刷新状态</h1>
  <p>北京时间生成时间：${escapeHtml(formatTime(generatedAt))}</p>
  <table>
    <thead>
      <tr>
        <th>信息源</th>
        <th>组别</th>
        <th>更新间隔</th>
        <th>上一次更新时间</th>
        <th>下一次更新时间</th>
        <th>最近错误</th>
      </tr>
    </thead>
    <tbody>${tableRows}
    </tbody>
  </table>
</body>
</html>`
})
