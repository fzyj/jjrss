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
      if (!res.ok) throw new Error(data.error || "Import failed");
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
