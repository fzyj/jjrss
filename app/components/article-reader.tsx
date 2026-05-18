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
