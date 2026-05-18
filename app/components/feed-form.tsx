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
