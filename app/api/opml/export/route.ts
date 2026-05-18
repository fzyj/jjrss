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
