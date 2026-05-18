# RSS Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted RSS reader with three-panel layout, SQLite backend, and full-text extraction.

**Architecture:** Next.js 16 App Router with API routes for CRUD operations on feeds/articles, better-sqlite3 for synchronous database access, rss-parser for feed parsing, and @mozilla/readability + jsdom for full-text extraction. Server-side `setInterval` for periodic feed refresh.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, better-sqlite3, rss-parser, @mozilla/readability, jsdom

---

> **IMPORTANT:** Next.js 16 route handlers use `params` as a Promise that must be awaited. Dynamic routes: `export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params }`. RouteContext is globally available without import.

---

### Task 1: Install dependencies and configure Next.js

**Files:**
- Modify: `package.json` (pnpm will auto-update)
- Modify: `next.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install runtime dependencies**

```bash
pnpm add better-sqlite3 rss-parser @mozilla/readability jsdom
```

- [ ] **Step 2: Install dev dependencies (type definitions)**

```bash
pnpm add -D @types/better-sqlite3 @types/jsdom
```

- [ ] **Step 3: Configure next.config.ts for native module and serverExternalPackages**

Read `next.config.ts`, then replace its content:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] **Step 4: Add `data/` to `.gitignore`**

Read `.gitignore`, then append to the end:

```
# SQLite database
data/
```

- [ ] **Step 5: Create the data directory**

```bash
mkdir -p data
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: install dependencies and configure for better-sqlite3"
```

---

### Task 2: Create TypeScript types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create types file**

```ts
export interface Feed {
  id: number;
  url: string;
  title: string;
  description: string | null;
  link: string | null;
  category_id: number | null;
  last_fetched_at: string | null;
  error_count: number;
  created_at: string;
}

export interface FeedWithCount extends Feed {
  unread_count: number;
}

export interface Article {
  id: number;
  feed_id: number;
  guid: string;
  title: string;
  url: string;
  summary: string | null;
  full_content: string | null;
  author: string | null;
  published_at: string | null;
  is_read: number;
  is_starred: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
}

export interface ArticleListParams {
  feed_id?: number;
  category_id?: number;
  starred?: boolean;
  page?: number;
  page_size?: number;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit lib/types.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts && git commit -m "feat: add TypeScript types for feeds, articles, categories"
```

---

### Task 3: Create database schema and connection

**Files:**
- Create: `lib/db.ts`
- Create: `lib/schema.ts`

- [ ] **Step 1: Create database connection module**

```ts
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "rss.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}
```

- [ ] **Step 2: Create schema module with migration**

```ts
import { getDb } from "./db";

export function migrate(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER REFERENCES categories(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT,
      link TEXT,
      category_id INTEGER REFERENCES categories(id),
      last_fetched_at TEXT,
      error_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      summary TEXT,
      full_content TEXT,
      author TEXT,
      published_at TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(feed_id, guid)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
    CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_articles_is_starred ON articles(is_starred);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);

    INSERT OR IGNORE INTO settings (key, value) VALUES ('refresh_interval', '30');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('max_articles_per_feed', '200');
  `);
}
```

- [ ] **Step 3: Verify with TypeScript**

```bash
npx tsc --noEmit lib/db.ts lib/schema.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts lib/schema.ts && git commit -m "feat: add SQLite database connection and schema migration"
```

---

### Task 4: Create RSS service

**Files:**
- Create: `lib/rss.ts`

- [ ] **Step 1: Create RSS service**

```ts
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
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit lib/rss.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/rss.ts && git commit -m "feat: add RSS service with feed discovery, parsing, and refresh"
```

---

### Task 5: Create OPML service

**Files:**
- Create: `lib/opml.ts`

- [ ] **Step 1: Create OPML service**

```ts
import { getDb } from "./db";
import { addFeed, resolveFeed } from "./rss";

interface OpmlOutline {
  text: string;
  title?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  type?: string;
  children?: OpmlOutline[];
}

function parseOpmlXml(xml: string): OpmlOutline[] {
  const outlines: OpmlOutline[] = [];
  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return outlines;

  const bodyContent = bodyMatch[1];
  const outlineRegex = /<outline\s[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = outlineRegex.exec(bodyContent)) !== null) {
    const attrs = match[0];
    const textMatch = attrs.match(/text="([^"]*)"/);
    const titleMatch = attrs.match(/title="([^"]*)"/);
    const xmlUrlMatch = attrs.match(/xmlUrl="([^"]*)"/);
    const htmlUrlMatch = attrs.match(/htmlUrl="([^"]*)"/);

    if (xmlUrlMatch) {
      outlines.push({
        text: textMatch?.[1] || "",
        title: titleMatch?.[1] || textMatch?.[1] || "",
        xmlUrl: xmlUrlMatch[1],
        htmlUrl: htmlUrlMatch?.[1],
      });
    }
  }
  return outlines;
}

export async function importOpml(opmlContent: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const outlines = parseOpmlXml(opmlContent);
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const outline of outlines) {
    if (!outline.xmlUrl) continue;
    try {
      await addFeed(outline.xmlUrl);
      imported++;
    } catch (err) {
      if (err instanceof Error && err.message === "Feed already exists") {
        skipped++;
      } else {
        errors.push(`${outline.text || outline.xmlUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { imported, skipped, errors };
}

export function exportOpml(): string {
  const db = getDb();
  const feeds = db.prepare(
    "SELECT f.*, c.name as category_name FROM feeds f LEFT JOIN categories c ON f.category_id = c.id ORDER BY c.sort_order, f.title"
  ).all() as Array<{
    title: string;
    url: string;
    link: string | null;
    category_name: string | null;
  }>;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>jjrss Subscriptions</title>
  </head>
  <body>
`;

  let currentCategory = "";
  for (const feed of feeds) {
    const cat = feed.category_name || "";
    if (cat !== currentCategory) {
      if (currentCategory) xml += `    </outline>\n`;
      if (cat) {
        xml += `    <outline text="${escapeXml(cat)}" title="${escapeXml(cat)}">\n`;
      }
      currentCategory = cat;
    }

    const indent = cat ? "      " : "    ";
    xml += `${indent}<outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" xmlUrl="${escapeXml(feed.url)}"`;
    if (feed.link) {
      xml += ` htmlUrl="${escapeXml(feed.link)}"`;
    }
    xml += "/>\n";
  }
  if (currentCategory) xml += `    </outline>\n`;

  xml += `  </body>
</opml>`;
  return xml;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit lib/opml.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/opml.ts && git commit -m "feat: add OPML import and export service"
```

---

### Task 6: Create full-text reader service

**Files:**
- Create: `lib/reader.ts`

- [ ] **Step 1: Create reader service**

```ts
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getDb } from "./db";

export async function extractFullContent(articleId: number): Promise<string | null> {
  const db = getDb();
  const article = db.prepare("SELECT id, url, full_content FROM articles WHERE id = ?").get(articleId) as {
    id: number;
    url: string;
    full_content: string | null;
  } | undefined;

  if (!article) throw new Error(`Article not found: ${articleId}`);
  if (article.full_content) return article.full_content;

  try {
    const response = await fetch(article.url, {
      headers: { "User-Agent": "jjrss/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const dom = new JSDOM(html, { url: article.url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (parsed && parsed.content) {
      const cleanContent = cleanHtml(parsed.content);
      db.prepare("UPDATE articles SET full_content = ? WHERE id = ?").run(cleanContent, articleId);
      return cleanContent;
    }

    return null;
  } catch {
    return null;
  }
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s(class|id|style|data-\w+)="[^"]*"/gi, "")
    .replace(/\s(class|id|style|data-\w+)='[^']*'/gi, "")
    .trim();
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit lib/reader.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/reader.ts && git commit -m "feat: add full-text extraction service using Readability"
```

---

### Task 7: Feed API routes

**Files:**
- Create: `app/api/feeds/route.ts`
- Create: `app/api/feeds/[id]/route.ts`
- Create: `app/api/feeds/refresh/route.ts`

- [ ] **Step 1: Create GET/POST /api/feeds**

```ts
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
```

- [ ] **Step 2: Create DELETE/PUT /api/feeds/[id]**

Note: Next.js 16 dynamic route params are a Promise that must be awaited.

```ts
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
```

- [ ] **Step 3: Create POST /api/feeds/refresh**

```ts
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
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/ && git commit -m "feat: add feed API routes (CRUD + refresh)"
```

---

### Task 8: Article API routes

**Files:**
- Create: `app/api/articles/route.ts`
- Create: `app/api/articles/[id]/route.ts`
- Create: `app/api/articles/mark-all-read/route.ts`

- [ ] **Step 1: Create GET /api/articles**

```ts
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
```

- [ ] **Step 2: Create GET/PUT /api/articles/[id]**

```ts
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
```

- [ ] **Step 3: Create POST /api/articles/mark-all-read**

```ts
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
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/articles/ && git commit -m "feat: add article API routes (CRUD + mark all read + full-text)"
```

---

### Task 9: OPML and Discover API routes

**Files:**
- Create: `app/api/opml/import/route.ts`
- Create: `app/api/opml/export/route.ts`
- Create: `app/api/discover/route.ts`

- [ ] **Step 1: Create POST /api/opml/import**

```ts
import { NextRequest, NextResponse } from "next/server";
import { importOpml } from "@/lib/opml";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let xmlContent: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      xmlContent = await file.text();
    } else {
      xmlContent = await request.text();
    }

    const result = await importOpml(xmlContent);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import OPML";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create GET /api/opml/export**

```ts
import { NextResponse } from "next/server";
import { exportOpml } from "@/lib/opml";

export async function GET() {
  const xmlContent = exportOpml();

  return new NextResponse(xmlContent, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": 'attachment; filename="jjrss-subscriptions.opml"',
    },
  });
}
```

- [ ] **Step 3: Create GET /api/discover**

```ts
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
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/opml/ app/api/discover/ && git commit -m "feat: add OPML and discover API routes"
```

---

### Task 10: Create base UI components

**Files:**
- Create: `app/components/ui/button.tsx`

- [ ] **Step 1: Create Button component**

```tsx
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "link";
  size?: "sm" | "md";
}

export function Button({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<string, string> = {
    default: "bg-black text-white hover:bg-neutral-800",
    ghost: "hover:bg-neutral-100 text-neutral-700",
    link: "text-neutral-600 hover:text-black underline-offset-4 hover:underline",
  };

  const sizes: Record<string, string> = {
    sm: "h-7 px-2 text-xs",
    md: "h-8 px-3 text-sm",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/ui/button.tsx && git commit -m "feat: add base Button UI component"
```

---

### Task 11: Sidebar component

**Files:**
- Create: `app/components/sidebar.tsx`

- [ ] **Step 1: Create Sidebar component**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FeedWithCount } from "@/lib/types";
import { Button } from "./ui/button";

interface SidebarProps {
  onSelectFeed: (feedId: number | null, categoryId: number | null) => void;
  selectedFeedId: number | null;
  selectedCategoryId: number | null;
  onRefresh: () => void;
}

export function Sidebar({
  onSelectFeed,
  selectedFeedId,
  selectedCategoryId,
  onRefresh,
}: SidebarProps) {
  const [feeds, setFeeds] = useState<FeedWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeeds = useCallback(async () => {
    const res = await fetch("/api/feeds");
    if (res.ok) {
      setFeeds(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const totalUnread = feeds.reduce((sum, f) => sum + (f.unread_count || 0), 0);

  return (
    <div className="w-64 h-full flex flex-col border-r border-neutral-200 bg-neutral-50">
      <div className="p-3 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-semibold tracking-tight">jjrss</h1>
          <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh all feeds">
            ↻
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => onSelectFeed(null, null)}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
            selectedFeedId === null && selectedCategoryId === null
              ? "bg-black text-white"
              : "hover:bg-neutral-100"
          }`}
        >
          <span>All Articles</span>
          {totalUnread > 0 && (
            <span className={`text-xs ${selectedFeedId === null && selectedCategoryId === null ? "text-white/70" : "text-neutral-400"}`}>
              {totalUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectFeed(null, -1)}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
            selectedFeedId === null && selectedCategoryId === -1
              ? "bg-black text-white"
              : "hover:bg-neutral-100"
          }`}
        >
          <span>Starred</span>
        </button>

        {loading ? (
          <div className="px-3 py-2 text-xs text-neutral-400">Loading...</div>
        ) : (
          <div className="mt-2">
            {feeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => onSelectFeed(feed.id, null)}
                className={`w-full text-left px-3 py-1 text-xs flex items-center justify-between ${
                  selectedFeedId === feed.id
                    ? "bg-black text-white"
                    : "hover:bg-neutral-100"
                }`}
              >
                <span className="truncate flex-1">{feed.title || feed.url}</span>
                {feed.unread_count > 0 && (
                  <span className={`ml-1 ${selectedFeedId === feed.id ? "text-white/70" : "text-neutral-400"}`}>
                    {feed.unread_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-neutral-200">
        <p className="text-[10px] text-neutral-400 text-center">
          {feeds.length} feeds · {totalUnread} unread
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sidebar.tsx && git commit -m "feat: add Sidebar component with feed list and unread counts"
```

---

### Task 12: Article list component

**Files:**
- Create: `app/components/article-list.tsx`

- [ ] **Step 1: Create ArticleList component**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Article } from "@/lib/types";
import { Button } from "./ui/button";

interface ArticleListProps {
  feedId: number | null;
  categoryId: number | null;
  starred: boolean;
  selectedArticleId: number | null;
  onSelectArticle: (id: number) => void;
}

export function ArticleList({
  feedId,
  categoryId,
  starred,
  selectedArticleId,
  onSelectArticle,
}: ArticleListProps) {
  const [articles, setArticles] = useState<(Article & { feed_title: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (feedId) params.set("feed_id", String(feedId));
    if (categoryId) params.set("category_id", String(categoryId));
    if (starred) params.set("starred", "1");
    params.set("page_size", "100");

    const res = await fetch(`/api/articles?${params}`);
    if (res.ok) {
      const data = await res.json();
      setArticles(data.articles);
    }
    setLoading(false);
  }, [feedId, categoryId, starred]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const handleMarkAllRead = async () => {
    await fetch("/api/articles/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        feedId ? { feed_id: feedId } : categoryId ? { category_id: categoryId } : {}
      ),
    });
    loadArticles();
  };

  const label = starred
    ? "Starred"
    : feedId
    ? articles[0]?.feed_title || "Feed"
    : "All Articles";

  const unreadCount = articles.filter((a) => !a.is_read).length;

  return (
    <div className="flex flex-col h-full border-r border-neutral-200">
      <div className="p-3 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-[10px] text-neutral-400">
            {articles.length} articles{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-neutral-400">Loading...</div>
        ) : articles.length === 0 ? (
          <div className="p-4 text-xs text-neutral-400">No articles</div>
        ) : (
          articles.map((article) => {
            const timeAgo = formatTimeAgo(article.published_at);
            return (
              <button
                key={article.id}
                onClick={() => {
                  onSelectArticle(article.id);
                  if (!article.is_read) {
                    fetch(`/api/articles/${article.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ is_read: true }),
                    });
                  }
                }}
                className={`w-full text-left px-3 py-2 border-b border-neutral-100 transition-colors ${
                  selectedArticleId === article.id
                    ? "bg-neutral-100"
                    : article.is_read
                    ? "hover:bg-neutral-50"
                    : "hover:bg-neutral-50"
                }`}
              >
                <div className="text-xs flex items-start gap-1">
                  {!article.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  )}
                  <span className={article.is_read ? "text-neutral-400" : "text-black font-medium"}>
                    {article.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                  {!feedId && <span>{article.feed_title}</span>}
                  <span>{timeAgo}</span>
                  {article.is_starred ? <span>★</span> : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  return date.toLocaleDateString();
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/article-list.tsx && git commit -m "feat: add ArticleList component with unread/starred indicators"
```

---

### Task 13: Article reader component

**Files:**
- Create: `app/components/article-reader.tsx`

- [ ] **Step 1: Create ArticleReader component**

```tsx
"use client";

import { useState, useEffect } from "react";
import type { Article } from "@/lib/types";
import { Button } from "./ui/button";

interface ArticleReaderProps {
  articleId: number | null;
}

export function ArticleReader({ articleId }: ArticleReaderProps) {
  const [article, setArticle] = useState<(Article & { feed_title: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [fullTextLoading, setFullTextLoading] = useState(false);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      setShowFullText(false);
      return;
    }

    setLoading(true);
    fetch(`/api/articles/${articleId}`)
      .then((res) => res.json())
      .then((data) => {
        setArticle(data);
        setStarred(!!data.is_starred);
        setShowFullText(false);
        setLoading(false);
      });
  }, [articleId]);

  const toggleStar = async () => {
    if (!articleId) return;
    const newStarred = !starred;
    setStarred(newStarred);
    await fetch(`/api/articles/${articleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_starred: newStarred }),
    });
  };

  const loadFullText = async () => {
    if (!articleId) return;
    setFullTextLoading(true);
    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_content: true }),
    });
    const data = await res.json();
    if (data.full_content) {
      setArticle((prev) => (prev ? { ...prev, full_content: data.full_content } : prev));
    }
    setShowFullText(true);
    setFullTextLoading(false);
  };

  if (!articleId) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-300">
        <div className="text-center">
          <p className="text-4xl mb-2">☕</p>
          <p className="text-sm">jjrss</p>
          <p className="text-xs text-neutral-300 mt-1">Select an article to read</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex-1 p-6 text-xs text-neutral-400">Loading...</div>;
  }

  if (!article) {
    return <div className="flex-1 p-6 text-xs text-neutral-400">Article not found</div>;
  }

  const content = showFullText && article.full_content
    ? article.full_content
    : article.summary || "";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-neutral-200 shrink-0">
        <h2 className="text-base font-semibold leading-snug">{article.title}</h2>
        <div className="flex items-center justify-between mt-1">
          <div className="text-xs text-neutral-400">
            {article.feed_title}
            {article.author ? ` · ${article.author}` : ""}
            {article.published_at
              ? ` · ${new Date(article.published_at).toLocaleDateString()}`
              : ""}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={toggleStar} title={starred ? "Unstar" : "Star"}>
              {starred ? "★" : "☆"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(article.url, "_blank")}
              title="Open original"
            >
              ↗
            </Button>
          </div>
        </div>
        <div className="flex gap-1 mt-2">
          <Button
            size="sm"
            variant={showFullText ? "ghost" : "default"}
            onClick={() => setShowFullText(false)}
          >
            Summary
          </Button>
          <Button
            size="sm"
            variant={showFullText ? "default" : "ghost"}
            onClick={loadFullText}
          >
            Full Text
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {fullTextLoading ? (
          <div className="text-xs text-neutral-400">Extracting full content...</div>
        ) : (
          <div
            className={`text-sm leading-relaxed max-w-none ${showFullText ? "reader-content" : ""}`}
            dangerouslySetInnerHTML={showFullText ? { __html: content } : undefined}
          >
            {!showFullText && content}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/article-reader.tsx && git commit -m "feat: add ArticleReader component with summary/full-text modes"
```

---

### Task 14: Feed form and OPML upload components

**Files:**
- Create: `app/components/feed-form.tsx`
- Create: `app/components/opml-upload.tsx`

- [ ] **Step 1: Create FeedForm component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "./ui/button";

interface FeedFormProps {
  onAdded: () => void;
}

export function FeedForm({ onAdded }: FeedFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add feed");
      }

      setUrl("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add feed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-1">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="RSS feed URL or website..."
          className="flex-1 h-8 px-2 text-xs border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black"
        />
        <Button type="submit" size="sm" disabled={loading || !url.trim()}>
          {loading ? "..." : "Subscribe"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Create OpmlUpload component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "./ui/button";

interface OpmlUploadProps {
  onImported: () => void;
}

export function OpmlUpload({ onImported }: OpmlUploadProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/opml/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
      onImported();
    } catch (err) {
      setResult({
        imported: 0,
        skipped: 0,
        errors: ["Upload failed"],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".opml,.xml"
            onChange={handleUpload}
            className="hidden"
            disabled={loading}
          />
          <span className="text-xs text-neutral-500 hover:text-black underline underline-offset-2">
            {loading ? "Importing..." : "Import OPML"}
          </span>
        </label>
        <a
          href="/api/opml/export"
          className="text-xs text-neutral-500 hover:text-black underline underline-offset-2"
        >
          Export OPML
        </a>
      </div>
      {result && (
        <p className="text-[10px] text-neutral-400">
          Imported {result.imported}, skipped {result.skipped}
          {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/components/feed-form.tsx app/components/opml-upload.tsx && git commit -m "feat: add feed subscription form and OPML import/export UI"
```

---

### Task 15: Main page and layout

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update root layout for RSS reader**

Replace content of `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "jjrss",
  description: "A minimal RSS reader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create main page with three-panel layout**

Replace content of `app/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./components/sidebar";
import { ArticleList } from "./components/article-list";
import { ArticleReader } from "./components/article-reader";
import { FeedForm } from "./components/feed-form";
import { OpmlUpload } from "./components/opml-upload";
import { Button } from "./components/ui/button";

export default function Home() {
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const starred = selectedCategoryId === -1;
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectFeed = useCallback((feedId: number | null, categoryId: number | null) => {
    setSelectedFeedId(feedId);
    setSelectedCategoryId(categoryId);
    setSelectedArticleId(null);
  }, []);

  const handleSelectArticle = useCallback((id: number) => {
    setSelectedArticleId(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    await fetch("/api/feeds/refresh", { method: "POST" });
    setRefreshKey((k) => k + 1);
  }, []);

  const handleFeedAdded = useCallback(() => {
    setShowAddForm(false);
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-full">
      <div key={refreshKey}>
        <Sidebar
          onSelectFeed={handleSelectFeed}
          selectedFeedId={selectedFeedId}
          selectedCategoryId={selectedCategoryId}
          onRefresh={handleRefresh}
        />
      </div>

      <div className="w-80 flex flex-col shrink-0">
        <ArticleList
          feedId={selectedFeedId}
          categoryId={starred ? null : selectedCategoryId}
          starred={starred}
          selectedArticleId={selectedArticleId}
          onSelectArticle={handleSelectArticle}
        />
      </div>

      <ArticleReader articleId={selectedArticleId} />

      <div className="fixed bottom-4 right-4 flex flex-col gap-2 items-end">
        {showAddForm && (
          <div className="bg-white border border-neutral-200 rounded-lg p-3 shadow-lg w-80 flex flex-col gap-2">
            <FeedForm onAdded={handleFeedAdded} />
            <OpmlUpload onImported={handleFeedAdded} />
          </div>
        )}
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "× Close" : "+ Subscribe"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/page.tsx && git commit -m "feat: implement three-panel layout with feed subscription UI"
```

---

### Task 16: Server-side refresh and startup initialization

**Files:**
- Create: `lib/refresh.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create server-side refresh module**

```ts
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
```

- [ ] **Step 2: Initialize refresh in a server component**

Replace content of `app/layout.tsx` with the version that imports and initializes the refresh:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RefreshInit } from "./components/refresh-init";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "jjrss",
  description: "A minimal RSS reader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <RefreshInit />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create RefreshInit server component**

Create `app/components/refresh-init.tsx`:

```tsx
// Server component that starts background refresh
import { startBackgroundRefresh } from "@/lib/refresh";

startBackgroundRefresh();

export function RefreshInit() {
  return null;
}
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/refresh.ts app/layout.tsx app/components/refresh-init.tsx && git commit -m "feat: add server-side background feed refresh"
```

---

### Task 17: Style refinements

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace globals.css with minimal RSS reader styles**

Read `app/globals.css`, then replace content:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* Reader content styling */
.reader-content {
  font-family: var(--font-sans), Georgia, serif;
  line-height: 1.8;
}

.reader-content h1,
.reader-content h2,
.reader-content h3 {
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}

.reader-content h1 { font-size: 1.5em; }
.reader-content h2 { font-size: 1.25em; }
.reader-content h3 { font-size: 1.1em; }

.reader-content p {
  margin-bottom: 1em;
}

.reader-content ul,
.reader-content ol {
  margin-bottom: 1em;
  padding-left: 1.5em;
}

.reader-content li {
  margin-bottom: 0.25em;
}

.reader-content pre {
  background: #f5f5f5;
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.85em;
  margin-bottom: 1em;
}

.reader-content code {
  font-family: var(--font-mono), monospace;
  font-size: 0.9em;
}

.reader-content blockquote {
  border-left: 3px solid #ddd;
  margin-left: 0;
  padding-left: 1em;
  color: #666;
  margin-bottom: 1em;
}

.reader-content img {
  max-width: 100%;
  height: auto;
  margin: 1em 0;
}

.reader-content a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Selection styling */
::selection {
  background: rgba(0, 0, 0, 0.1);
}

/* Scrollbar styling for a clean look */
::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d4d4d4;
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a3a3a3;
}
```

- [ ] **Step 2: Verify the build works**

```bash
npx tsc --noEmit && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css && git commit -m "style: add minimal RSS reader typography and scrollbar styles"
```
