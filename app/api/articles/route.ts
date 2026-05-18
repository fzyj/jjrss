import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";
import type { Article } from "@/lib/types";

export async function GET(request: NextRequest) {
  migrate();
  const db = getDb();
  const { searchParams } = request.nextUrl;

  const feedId = searchParams.get("feed_id");
  const categoryId = searchParams.get("category_id");
  const starred = searchParams.get("starred");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(searchParams.get("page_size") || "50", 10), 200);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (feedId) {
    conditions.push("a.feed_id = ?");
    params.push(parseInt(feedId, 10));
  }
  if (categoryId) {
    conditions.push("f.category_id = ?");
    params.push(parseInt(categoryId, 10));
  }
  if (starred === "1") {
    conditions.push("a.is_starred = 1");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db.prepare(
    `SELECT COUNT(*) as count FROM articles a
     LEFT JOIN feeds f ON f.id = a.feed_id
     ${where}`
  ).get(...params) as { count: number };

  const articles = db.prepare(
    `SELECT a.*, f.title as feed_title
     FROM articles a
     LEFT JOIN feeds f ON f.id = a.feed_id
     ${where}
     ORDER BY a.published_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as (Article & { feed_title: string })[];

  return NextResponse.json({
    articles,
    total: total.count,
    page,
    pageSize,
  });
}
