import Parser from "rss-parser";
import { getDb } from "./db";
import type { Feed, Article } from "./types";

const parser = new Parser();

function discoverFeedUrl(html: string, baseUrl: string): string | null {
  const linkRegex = /<link[^>]*type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  const match = html.match(linkRegex);
  if (match) {
    const href = match[2];
    if (href.startsWith("http")) return href;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  }

  const altRegex = /<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/(rss|atom)\+xml["'][^>]*>/i;
  const altMatch = html.match(altRegex);
  if (altMatch) {
    const href = altMatch[1];
    if (href.startsWith("http")) return href;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function resolveFeed(inputUrl: string): Promise<{ feedUrl: string }> {
  const trimmed = inputUrl.trim();

  try {
    await parser.parseURL(trimmed);
    return { feedUrl: trimmed };
  } catch {
    // not a direct RSS URL, try to discover
  }

  const response = await fetch(trimmed, {
    headers: { "User-Agent": "jjrss/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("xml") || contentType.includes("rss") || contentType.includes("atom")) {
    return { feedUrl: trimmed };
  }

  const discovered = discoverFeedUrl(text, trimmed);
  if (discovered) {
    return { feedUrl: discovered };
  }

  // last resort: check common paths
  const commonPaths = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml", "/index.xml"];
  for (const p of commonPaths) {
    try {
      const testUrl = new URL(p, trimmed).toString();
      const r = await fetch(testUrl, {
        headers: { "User-Agent": "jjrss/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom")) {
          return { feedUrl: testUrl };
        }
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find RSS feed for: ${trimmed}`);
}

export async function addFeed(inputUrl: string, categoryId?: number): Promise<Feed> {
  const { feedUrl } = await resolveFeed(inputUrl);

  const db = getDb();
  const existing = db.prepare("SELECT id FROM feeds WHERE url = ?").get(feedUrl) as { id: number } | undefined;
  if (existing) {
    throw new Error("Feed already exists");
  }

  const parsed = await parser.parseURL(feedUrl);

  const result = db.prepare(
    `INSERT INTO feeds (url, title, description, link, category_id, last_fetched_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    feedUrl,
    parsed.title || feedUrl,
    parsed.description || null,
    parsed.link || null,
    categoryId || null
  );

  const feed = db.prepare("SELECT * FROM feeds WHERE id = ?").get(result.lastInsertRowid) as Feed;

  await fetchArticles(feed.id);

  return feed;
}

export async function fetchArticles(feedId: number): Promise<number> {
  const db = getDb();
  const feed = db.prepare("SELECT * FROM feeds WHERE id = ?").get(feedId) as Feed;
  if (!feed) throw new Error(`Feed not found: ${feedId}`);

  try {
    const parsed = await parser.parseURL(feed.url);
    let newCount = 0;

    const insert = db.prepare(
      `INSERT OR IGNORE INTO articles (feed_id, guid, title, url, summary, author, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = db.transaction((items: Parser.Item[]) => {
      for (const item of items) {
        const guid = item.guid || item.link || item.title || "";
        const result = insert.run(
          feedId,
          guid,
          item.title || "",
          item.link || "",
          item.contentSnippet || item.content || null,
          item.creator || null,
          item.isoDate || item.pubDate || null
        );
        if (result.changes > 0) newCount++;
      }
    });

    insertMany(parsed.items || []);

    db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), error_count = 0 WHERE id = ?").run(feedId);

    const maxArticles = db.prepare("SELECT value FROM settings WHERE key = 'max_articles_per_feed'").get() as { value: string };
    const limit = parseInt(maxArticles.value, 10) || 200;
    db.prepare(
      `DELETE FROM articles WHERE feed_id = ? AND id NOT IN (
        SELECT id FROM articles WHERE feed_id = ? ORDER BY published_at DESC LIMIT ?
      )`
    ).run(feedId, feedId, limit);

    return newCount;
  } catch (err) {
    db.prepare("UPDATE feeds SET error_count = error_count + 1 WHERE id = ?").run(feedId);
    throw err;
  }
}

export async function refreshAllFeeds(): Promise<{ feedId: number; newCount: number }[]> {
  const db = getDb();
  const feeds = db.prepare("SELECT id FROM feeds").all() as { id: number }[];

  const results: { feedId: number; newCount: number }[] = [];
  for (const { id } of feeds) {
    try {
      const newCount = await fetchArticles(id);
      results.push({ feedId: id, newCount });
    } catch {
      results.push({ feedId: id, newCount: -1 });
    }
  }

  return results;
}
