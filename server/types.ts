import type { NewsItem, SourceID } from "@shared/types"

export interface SourceConfigValue {
  refreshEnabled: boolean
  refreshInterval: number
  retentionHours: number
  minKeepCount: number
}

export interface SourceState extends SourceConfigValue {
  sourceId: SourceID
  lastRefreshAt?: number
  lastSuccessAt?: number
  lastCleanupAt?: number
  lastError?: string
}

export interface SourceStateRow {
  source_id: SourceID
  refresh_enabled: number
  refresh_interval: number
  retention_hours: number
  min_keep_count: number
  last_refresh_at?: number
  last_success_at?: number
  last_cleanup_at?: number
  last_error?: string
}

export interface PersistedSourceItem {
  sourceId: SourceID
  itemId: string
  sortTime: number
  fetchedAt: number
  item: NewsItem
}

export interface RSSInfo {
  title: string
  description: string
  link: string
  image: string
  updatedTime: string
  items: RSSItem[]
}
export interface RSSItem {
  title: string
  description: string
  link: string
  created?: string
}

export interface CacheInfo {
  id: SourceID
  items: NewsItem[]
  updated: number
}

export interface CacheRow {
  id: SourceID
  data: string
  updated: number
}

export interface RSSHubInfo {
  title: string
  home_page_url: string
  description: string
  items: RSSHubItem[]
}

export interface RSSHubItem {
  id: string
  url: string
  title: string
  content_html: string
  date_published: string
}

export interface UserInfo {
  id: string
  email: string
  type: "github"
  data: string
  created: number
  updated: number
}

export interface RSSHubOption {
  sorted?: boolean
  limit?: number
}

export interface SourceOption {
  hiddenDate?: boolean
}

export type SourceGetter = () => Promise<NewsItem[]>
