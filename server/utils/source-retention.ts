export async function resolveSourceDisplayLimit({
  total,
  keepCount,
  countWithinWindow,
}: {
  total: number
  keepCount: number
  countWithinWindow: () => Promise<number>
}) {
  if (total <= keepCount) return total
  const withinWindow = await countWithinWindow()
  return Math.min(total, Math.max(withinWindow, keepCount))
}
