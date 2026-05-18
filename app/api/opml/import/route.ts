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
