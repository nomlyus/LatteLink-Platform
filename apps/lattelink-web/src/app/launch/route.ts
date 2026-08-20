import { NextRequest, NextResponse } from "next/server";
import { resolveMerchantDashboardUrl } from "@/lib/site";

export function GET(request: NextRequest) {
  const hostname =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host") ??
    request.nextUrl.hostname;
  const target = new URL(resolveMerchantDashboardUrl(hostname));

  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  return NextResponse.redirect(target, 307);
}
