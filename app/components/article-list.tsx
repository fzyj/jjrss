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
