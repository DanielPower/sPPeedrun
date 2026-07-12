import type { RequestHandler } from "./$types";
import { subscribeToChanges } from "$lib/server/events";

// Server-Sent Events stream. Emits a `change` event ({type,lobbyId,userId?})
// whenever a lobby changes or the worker ingests a new best play. Clients
// reconnect automatically.
export const GET: RequestHandler = ({ request }) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone); ignore.
        }
      };

      send("retry: 3000\n\n");
      send("event: hello\ndata: {}\n\n");

      const unsubscribe = subscribeToChanges((event) => {
        send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // Comment heartbeat keeps the connection alive through idle proxies.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
};
