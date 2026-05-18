import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";

export async function POST(request: NextRequest) {
  migrate();
  const body = await request.json().catch(() => ({}));
  const db = getDb();

  if (body.feed_id) {
    db.prepare("UPDATE articles SET is_read = 1 WHERE feed_id = ?")
      .run(parseInt(body.feed_id, 10));
  } else if (body.category_id) {
    db.prepare(
      `UPDATE articles SET is_read = 1 WHERE feed_id IN (
        SELECT id FROM feeds WHERE category_id = ?
      )`
    ).run(parseInt(body.category_id, 10));
  } else {
    db.prepare("UPDATE articles SET is_read = 1").run();
  }

  return NextResponse.json({ success: true });
}
