import { invalidateAll } from "$app/navigation"

/**
 * Subscribe to live score updates over SSE and re-run the page's `load`
 * (via invalidateAll) when a relevant update arrives. `shouldRefresh` decides
 * per update whether the current page cares (e.g. a profile only cares about
 * its own user). Returns a cleanup function suitable for onMount.
 */
export function liveUpdates(
  shouldRefresh: (userId: number) => boolean,
): () => void {
  const source = new EventSource("/api/events")

  let timer: ReturnType<typeof setTimeout> | null = null
  const scheduleRefresh = () => {
    if (timer) return
    // Coalesce bursts of updates into a single refresh.
    timer = setTimeout(() => {
      timer = null
      void invalidateAll()
    }, 400)
  }

  source.addEventListener("score", (event) => {
    try {
      const { userId } = JSON.parse((event as MessageEvent).data)
      if (shouldRefresh(Number(userId))) {
        scheduleRefresh()
      }
    } catch {
      // Ignore malformed events.
    }
  })

  return () => {
    if (timer) clearTimeout(timer)
    source.close()
  }
}
