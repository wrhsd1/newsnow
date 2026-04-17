import process from "node:process"
import type { NewsItem, SourceID } from "@shared/types"
import type { Database } from "db0"
import type { PersistedSourceItem, SourceConfigValue, SourceState, SourceStateRow } from "../types"
import { resolveSourceDisplayLimit } from "../utils/source-retention"

interface SourceItemRow {
  source_id: SourceID
  item_id: string
  sort_time: number
  fetched_at: number
  item_json: string
}

export class SourceItemTable {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS source_item (
        source_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        sort_time INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL,
        item_json TEXT NOT NULL,
        PRIMARY KEY (source_id, item_id)
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_source_item_sort_time ON source_item(source_id, sort_time DESC);
    `).run()
    logger.success("init source_item table")
  }

  async upsert(sourceId: SourceID, items: PersistedSourceItem[]) {
    if (!items.length) return
    const sql = `
      INSERT INTO source_item (source_id, item_id, sort_time, fetched_at, item_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, item_id) DO UPDATE SET
        sort_time = excluded.sort_time,
        fetched_at = excluded.fetched_at,
        item_json = excluded.item_json
    `
    for (const item of items) {
      await this.db.prepare(sql).run(sourceId, item.itemId, item.sortTime, item.fetchedAt, JSON.stringify(item.item))
    }
    logger.success(`upsert ${sourceId} source items`)
  }

  async list(sourceId: SourceID, limit: number): Promise<PersistedSourceItem[]> {
    const res = await this.db.prepare(`
      SELECT source_id, item_id, sort_time, fetched_at, item_json
      FROM source_item
      WHERE source_id = ?
      ORDER BY sort_time DESC, fetched_at DESC
      LIMIT ?
    `).all(sourceId, limit) as any
    const rows = (res.results ?? res) as SourceItemRow[]
    return rows.map(row => ({
      sourceId: row.source_id,
      itemId: row.item_id,
      sortTime: row.sort_time,
      fetchedAt: row.fetched_at,
      item: JSON.parse(row.item_json) as NewsItem,
    }))
  }

  async listRetained(sourceId: SourceID, minSortTime: number, keepCount: number): Promise<PersistedSourceItem[]> {
    const total = await this.count(sourceId)
    if (!total) return []

    const limit = await resolveSourceDisplayLimit({
      total,
      keepCount,
      countWithinWindow: async () => {
        const row = await this.db.prepare(`
          SELECT COUNT(*) as total
          FROM source_item
          WHERE source_id = ? AND sort_time >= ?
        `).get(sourceId, minSortTime) as { total?: number } | undefined
        return row?.total ?? 0
      },
    })

    return this.list(sourceId, limit)
  }

  async count(sourceId: SourceID) {
    const row = await this.db.prepare(`SELECT COUNT(*) as total FROM source_item WHERE source_id = ?`).get(sourceId) as { total?: number } | undefined
    return row?.total ?? 0
  }

  async deleteExpired(sourceId: SourceID, minSortTime: number, keepCount: number) {
    const res = await this.db.prepare(`
      SELECT item_id
      FROM source_item
      WHERE source_id = ?
      ORDER BY sort_time DESC, fetched_at DESC
    `).all(sourceId) as any
    const rows = ((res.results ?? res) as Array<{ item_id: string }>).map(row => row.item_id)
    if (rows.length <= keepCount) return 0

    const keepIds = new Set(rows.slice(0, keepCount))
    const expiredRes = await this.db.prepare(`
      SELECT item_id, sort_time
      FROM source_item
      WHERE source_id = ? AND sort_time < ?
    `).all(sourceId, minSortTime) as any
    const expiredRows = (expiredRes.results ?? expiredRes) as Array<{ item_id: string, sort_time: number }>
    const removable = expiredRows.filter(row => !keepIds.has(row.item_id))

    for (const row of removable) {
      await this.db.prepare(`DELETE FROM source_item WHERE source_id = ? AND item_id = ?`).run(sourceId, row.item_id)
    }
    return removable.length
  }
}

export class SourceStateTable {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS source_state (
        source_id TEXT PRIMARY KEY,
        refresh_enabled INTEGER NOT NULL,
        refresh_interval INTEGER NOT NULL,
        retention_hours INTEGER NOT NULL,
        min_keep_count INTEGER NOT NULL,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_refresh_at INTEGER,
        last_success_at INTEGER,
        last_cleanup_at INTEGER,
        last_error TEXT
      );
    `).run()
    const columns = await this.db.prepare(`PRAGMA table_info(source_state)`).all() as any
    const columnRows = (columns.results ?? columns) as Array<{ name: string }>
    if (!columnRows.some(column => column.name === "consecutive_failures")) {
      await this.db.prepare(`ALTER TABLE source_state ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0`).run()
    }
    logger.success("init source_state table")
  }

  async get(sourceId: SourceID): Promise<SourceState | undefined> {
    const row = await this.db.prepare(`
      SELECT source_id, refresh_enabled, refresh_interval, retention_hours, min_keep_count,
             consecutive_failures, last_refresh_at, last_success_at, last_cleanup_at, last_error
      FROM source_state
      WHERE source_id = ?
    `).get(sourceId) as SourceStateRow | undefined
    return row ? toSourceState(row) : undefined
  }

  async list(): Promise<SourceState[]> {
    const res = await this.db.prepare(`
      SELECT source_id, refresh_enabled, refresh_interval, retention_hours, min_keep_count,
             consecutive_failures, last_refresh_at, last_success_at, last_cleanup_at, last_error
      FROM source_state
    `).all() as any
    const rows = (res.results ?? res) as SourceStateRow[]
    return rows.map(toSourceState)
  }

  async upsert(sourceId: SourceID, config: SourceConfigValue) {
    await this.db.prepare(`
      INSERT INTO source_state (source_id, refresh_enabled, refresh_interval, retention_hours, min_keep_count, consecutive_failures)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(source_id) DO UPDATE SET
        refresh_enabled = excluded.refresh_enabled,
        refresh_interval = excluded.refresh_interval,
        retention_hours = excluded.retention_hours,
        min_keep_count = excluded.min_keep_count
    `).run(sourceId, config.refreshEnabled ? 1 : 0, config.refreshInterval, config.retentionHours, config.minKeepCount)
  }

  async touchRefresh(sourceId: SourceID, lastRefreshAt: number) {
    await this.db.prepare(`UPDATE source_state SET last_refresh_at = ? WHERE source_id = ?`).run(lastRefreshAt, sourceId)
  }

  async touchSuccess(sourceId: SourceID, lastSuccessAt: number) {
    await this.db.prepare(`UPDATE source_state SET last_success_at = ?, consecutive_failures = 0, last_error = NULL WHERE source_id = ?`).run(lastSuccessAt, sourceId)
  }

  async touchCleanup(sourceId: SourceID, lastCleanupAt: number) {
    await this.db.prepare(`UPDATE source_state SET last_cleanup_at = ? WHERE source_id = ?`).run(lastCleanupAt, sourceId)
  }

  async touchError(sourceId: SourceID, lastError: string) {
    await this.db.prepare(`
      UPDATE source_state
      SET consecutive_failures = consecutive_failures + 1,
          last_error = ?,
          refresh_enabled = CASE WHEN consecutive_failures + 1 >= 5 THEN 0 ELSE refresh_enabled END
      WHERE source_id = ?
    `).run(lastError, sourceId)
  }
}

function toSourceState(row: SourceStateRow): SourceState {
  return {
    sourceId: row.source_id,
    refreshEnabled: row.refresh_enabled === 1,
    refreshInterval: row.refresh_interval,
    retentionHours: row.retention_hours,
    minKeepCount: row.min_keep_count,
    consecutiveFailures: row.consecutive_failures ?? 0,
    lastRefreshAt: row.last_refresh_at,
    lastSuccessAt: row.last_success_at,
    lastCleanupAt: row.last_cleanup_at,
    lastError: row.last_error,
  }
}

export async function getSourceTables(): Promise<{
  itemTable: SourceItemTable
  stateTable: SourceStateTable
} | undefined> {
  try {
    const db = useDatabase()
    const itemTable = new SourceItemTable(db)
    const stateTable = new SourceStateTable(db)
    if (process.env.INIT_TABLE !== "false") {
      await itemTable.init()
      await stateTable.init()
    }
    return {
      itemTable,
      stateTable,
    }
  } catch (e) {
    logger.error("failed to init source tables ", e)
  }
}

export async function getSourceItemTable(): Promise<SourceItemTable | undefined> {
  const tables = await getSourceTables()
  return tables?.itemTable
}

export async function getSourceStateTable(): Promise<SourceStateTable | undefined> {
  const tables = await getSourceTables()
  return tables?.stateTable
}
