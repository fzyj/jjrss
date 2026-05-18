import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";
import type { Article } from "@/lib/types";

export async function GET(request: NextRequest) {
  migrate();
  const db = getDb();
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ articles: [], total: 0 });
  }

  const results = db.prepare(
    `SELECT a.*, f.title as feed_title
     FROM articles a
     LEFT JOIN feeds f ON f.id = a.feed_id
     WHERE a.title LIKE ? OR a.summary LIKE ?
     ORDER BY a.published_at DESC
     LIMIT 50`
  ).all(`%${q}%`, `%${q}%`) as (Article & { feed_title: string })[];

  return NextResponse.json({ articles: results, total: results.length });
}
