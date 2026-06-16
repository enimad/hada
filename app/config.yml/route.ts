import { NextResponse } from "next/server";
import { decapConfig } from "@/lib/decap-config";

export const runtime = "nodejs";

export function GET() {
  return new NextResponse(decapConfig, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
