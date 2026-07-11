import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// POST only: a GET /logout is prefetchable by <Link>, which silently
// destroyed sessions whenever a page containing a sign-out link rendered.
export async function POST(req: NextRequest) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}

export async function GET(req: NextRequest) {
  // do NOT clear the session on GET — just bounce home
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
