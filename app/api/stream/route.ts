import { GET as newsGET }        from '@/app/api/news/route';
import { GET as commoditiesGET } from '@/app/api/commodities/route';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();

  let commoditiesTimer: ReturnType<typeof setInterval> | undefined;
  let newsTimer:        ReturnType<typeof setInterval> | undefined;
  let keepalive:        ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          // client disconnected — timers cleaned up in cancel()
        }
      };

      // ── Initial burst on connect ─────────────────────────────────────────
      const [com, news] = await Promise.allSettled([
        commoditiesGET().then((r) => r.json()),
        newsGET().then((r) => r.json()),
      ]);
      if (com.status  === 'fulfilled') push('commodities', com.value);
      if (news.status === 'fulfilled') push('news',        news.value);

      // ── Commodities: push every 30 s ─────────────────────────────────────
      commoditiesTimer = setInterval(async () => {
        try {
          const data = await commoditiesGET().then((r) => r.json());
          push('commodities', data);
        } catch { /* swallow */ }
      }, 30_000);

      // ── News: check every 60 s, push only when cache refreshed ───────────
      let lastNewsAt = 0;
      newsTimer = setInterval(async () => {
        try {
          const data = await newsGET().then((r) => r.json());
          if ((data.lastUpdated ?? 0) > lastNewsAt) {
            lastNewsAt = data.lastUpdated;
            push('news', data);
          }
        } catch { /* swallow */ }
      }, 60_000);

      // ── Keepalive comment every 20 s (prevents proxy timeouts) ───────────
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch { /* client gone */ }
      }, 20_000);
    },

    cancel() {
      clearInterval(commoditiesTimer);
      clearInterval(newsTimer);
      clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
