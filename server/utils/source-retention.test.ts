import { describe, expect, it, vi } from "vitest"
import { resolveSourceDisplayLimit } from "./source-retention"

describe("resolveSourceDisplayLimit", () => {
  it("returns total when total is below keep count", async () => {
    const countWithinWindow = vi.fn(async () => 1)

    await expect(resolveSourceDisplayLimit({
      total: 3,
      keepCount: 5,
      countWithinWindow,
    })).resolves.toBe(3)
    expect(countWithinWindow).not.toHaveBeenCalled()
  })

  it("returns keep count when window count is smaller", async () => {
    await expect(resolveSourceDisplayLimit({
      total: 20,
      keepCount: 5,
      countWithinWindow: async () => 2,
    })).resolves.toBe(5)
  })

  it("returns window count when it is larger than keep count", async () => {
    await expect(resolveSourceDisplayLimit({
      total: 20,
      keepCount: 5,
      countWithinWindow: async () => 12,
    })).resolves.toBe(12)
  })

  it("never returns more than total", async () => {
    await expect(resolveSourceDisplayLimit({
      total: 8,
      keepCount: 5,
      countWithinWindow: async () => 99,
    })).resolves.toBe(8)
  })
})
