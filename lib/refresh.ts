import { getDb } from "./db";
import { migrate } from "./schema";
import { refreshAllFeeds } from "./rss";

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundRefresh(): void {
  migrate();
  if (intervalId) return;

  const db = getDb();
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'refresh_interval'").get() as
    | { value: string }
    | undefined;

  const intervalMinutes = parseInt(setting?.value || "30", 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[jjrss] Background refresh every ${intervalMinutes} minutes`);

  intervalId = setInterval(async () => {
    try {
      const results = await refreshAllFeeds();
      const newTotal = results.reduce((sum, r) => sum + Math.max(0, r.newCount), 0);
      if (newTotal > 0) {
        console.log(`[jjrss] Fetched ${newTotal} new articles`);
      }
    } catch (err) {
      console.error("[jjrss] Background refresh error:", err);
    }
  }, intervalMs);

  // initial refresh after 10 seconds
  setTimeout(async () => {
    try {
      const results = await refreshAllFeeds();
      const newTotal = results.reduce((sum, r) => sum + Math.max(0, r.newCount), 0);
      if (newTotal > 0) {
        console.log(`[jjrss] Initial refresh: ${newTotal} new articles`);
      }
    } catch (err) {
      console.error("[jjrss] Initial refresh error:", err);
    }
  }, 10000);
}
