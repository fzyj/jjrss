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
