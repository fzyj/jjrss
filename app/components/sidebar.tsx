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
