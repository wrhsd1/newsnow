import process from "node:process"
import { refreshDueSources } from "../services/source-scheduler"

const SchedulerInterval = 60 * 1000
let timer: NodeJS.Timeout | undefined

export default defineNitroPlugin(() => {
  if (process.env.CF_PAGES || process.env.VERCEL) return
  if (timer) return

  const run = async () => {
    try {
      await refreshDueSources()
    } catch (error) {
      logger.error("source scheduler failed", error)
    }
  }

  run()
  timer = setInterval(run, SchedulerInterval)
})
