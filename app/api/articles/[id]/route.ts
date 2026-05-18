import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";
import { extractFullContent } from "@/lib/reader";
import type { Article } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  migrate();
  const { id } = await params;
  const db = getDb();

  const article = db.prepare(
    `SELECT a.*, f.title as feed_title
     FROM articles a
     LEFT JOIN feeds f ON f.id = a.feed_id
     WHERE a.id = ?`
  ).get(parseInt(id, 10)) as (Article & { feed_title: string }) | undefined;

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  migrate();
  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  if (body.full_content === true) {
    const content = await extractFullContent(parseInt(id, 10));
    return NextResponse.json({ full_content: content });
  }

  const updates: string[] = [];
  const values: (number | string)[] = [];

  if (body.is_read !== undefined) {
    updates.push("is_read = ?");
    values.push(body.is_read ? 1 : 0);
  }
  if (body.is_starred !== undefined) {
    updates.push("is_starred = ?");
    values.push(body.is_starred ? 1 : 0);
  }

  if (updates.length > 0) {
    values.push(parseInt(id, 10));
    db.prepare(`UPDATE articles SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  const article = db.prepare(
    `SELECT a.*, f.title as feed_title
     FROM articles a
     LEFT JOIN feeds f ON f.id = a.feed_id
     WHERE a.id = ?`
  ).get(parseInt(id, 10)) as (Article & { feed_title: string }) | undefined;

  return NextResponse.json(article);
}
