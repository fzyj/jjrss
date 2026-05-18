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
