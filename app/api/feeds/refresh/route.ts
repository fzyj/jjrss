import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";
import { fetchArticles, refreshAllFeeds } from "@/lib/rss";

export async function POST(request: NextRequest) {
  migrate();
  try {
    const body = await request.json().catch(() => ({}));
    const feedId = body.feed_id ? parseInt(body.feed_id, 10) : null;

    if (feedId) {
      const newCount = await fetchArticles(feedId);
      return NextResponse.json({ feedId, newCount });
    }

    const results = await refreshAllFeeds();
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh feeds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
