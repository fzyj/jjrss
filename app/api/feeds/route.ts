import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";
import { addFeed } from "@/lib/rss";
import type { FeedWithCount } from "@/lib/types";

export async function GET() {
  migrate();
  const db = getDb();

  const feeds = db.prepare(`
    SELECT f.*, COUNT(a.id) FILTER (WHERE a.is_read = 0) as unread_count
    FROM feeds f
    LEFT JOIN articles a ON a.feed_id = f.id
    GROUP BY f.id
    ORDER BY f.title
  `).all() as FeedWithCount[];

  return NextResponse.json(feeds);
}

export async function POST(request: NextRequest) {
  migrate();
  try {
    const body = await request.json();
    const { url, category_id } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const feed = await addFeed(url, category_id || undefined);
    return NextResponse.json(feed, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add feed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
