// Web-server pub/sub hub. Holds a single Postgres LISTEN on the scores channel
// and fans notifications out to all connected SSE clients. The worker process
// issues the matching NOTIFY (see notifyScoreUpdate).
import { sql } from "./db"
import { SCORES_CHANNEL } from "./scores"

type Listener = (userId: number) => void

interface Hub {
  listeners: Set<Listener>
  ready: Promise<unknown>
}

// Survive dev/HMR module reloads so we never open duplicate LISTEN connections.
const store = globalThis as unknown as { __sppeedrunHub?: Hub }

function hub(): Hub {
  if (!store.__sppeedrunHub) {
    const listeners = new Set<Listener>()
    const ready = sql.listen(SCORES_CHANNEL, (payload) => {
      const userId = Number(payload)
      for (const listener of listeners) {
        listener(userId)
      }
    })
    store.__sppeedrunHub = { listeners, ready }
  }
  return store.__sppeedrunHub
}

/** Register a listener for score updates; returns an unsubscribe function. */
export function subscribeToScoreUpdates(listener: Listener): () => void {
  const h = hub()
  h.listeners.add(listener)
  void h.ready // ensure the LISTEN connection is being established
  return () => h.listeners.delete(listener)
}
