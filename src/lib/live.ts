import { invalidateAll } from "$app/navigation";

export interface ChangeEvent {
  type: "score" | "lobby";
  lobbyId: number;
  userId?: number;
}

/**
 * Subscribe to live change events over SSE and re-run the page's `load` (via
 * invalidateAll) when a relevant event arrives. `shouldRefresh` decides per
 * event whether the current page cares (e.g. a lobby page only cares about its
 * own lobby). Returns a cleanup function suitable for onMount.
 */
export function liveUpdates(shouldRefresh: (event: ChangeEvent) => boolean): () => void {
  const source = new EventSource("/api/events");

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (timer) return;
    // Coalesce bursts of events into a single refresh.
    timer = setTimeout(() => {
      timer = null;
      void invalidateAll();
    }, 400);
  };

  source.addEventListener("change", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as ChangeEvent;
      if (shouldRefresh(data)) {
        scheduleRefresh();
      }
    } catch {
      // Ignore malformed events.
    }
  });

  return () => {
    if (timer) clearTimeout(timer);
    source.close();
  };
}
