import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { migrate } from "@/lib/schema";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  migrate();
  const { id } = await params;
  const feedId = parseInt(id, 10);

  const db = getDb();
  db.prepare("DELETE FROM feeds WHERE id = ?").run(feedId);

  return NextResponse.json({ success: true });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  migrate();
  const { id } = await params;
  const feedId = parseInt(id, 10);
  const body = await request.json();
  const { title, category_id } = body;

  const db = getDb();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (title !== undefined) {
    updates.push("title = ?");
    values.push(title);
  }
  if (category_id !== undefined) {
    updates.push("category_id = ?");
    values.push(category_id);
  }

  if (updates.length > 0) {
    values.push(feedId);
    db.prepare(`UPDATE feeds SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  const feed = db.prepare("SELECT * FROM feeds WHERE id = ?").get(feedId);
  return NextResponse.json(feed);
}
