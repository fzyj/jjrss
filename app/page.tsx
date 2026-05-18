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
