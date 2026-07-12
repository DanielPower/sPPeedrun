// Web-server pub/sub hub. Holds single Postgres LISTENs on the score and lobby
// channels and fans notifications out to all connected SSE clients as a unified
// event. The worker process issues the matching NOTIFYs.
import { sql } from "./db";
import { SCORES_CHANNEL } from "./scores";
import { LOBBIES_CHANNEL } from "./lobbies";

export interface ChangeEvent {
  type: "score" | "lobby";
  lobbyId: number;
  userId?: number;
}

type Listener = (event: ChangeEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  ready: Promise<unknown>;
}

// Survive dev/HMR module reloads so we never open duplicate LISTEN connections.
const store = globalThis as unknown as { __sppeedrunHub?: Hub };

function hub(): Hub {
  if (!store.__sppeedrunHub) {
    const listeners = new Set<Listener>();
    const emit = (event: ChangeEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    };
    const ready = Promise.all([
      sql.listen(SCORES_CHANNEL, (payload) => {
        try {
          const { lobbyId, userId } = JSON.parse(payload);
          emit({
            type: "score",
            lobbyId: Number(lobbyId),
            userId: Number(userId),
          });
        } catch {
          // Ignore malformed payloads.
        }
      }),
      sql.listen(LOBBIES_CHANNEL, (payload) => {
        emit({ type: "lobby", lobbyId: Number(payload) });
      }),
    ]);
    store.__sppeedrunHub = { listeners, ready };
  }
  return store.__sppeedrunHub;
}

/** Register a listener for change events; returns an unsubscribe function. */
export function subscribeToChanges(listener: Listener): () => void {
  const h = hub();
  h.listeners.add(listener);
  void h.ready; // ensure the LISTEN connections are being established
  return () => h.listeners.delete(listener);
}
