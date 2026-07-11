import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE = "tms_session";
const SECRET = process.env.AUTH_SECRET || "dev-secret";

export interface Session {
  userId: string;
  tenantId: string;
  username: string;
  name: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "ACCOUNTANT" | "VIEWER";
  firmId?: string;
  firmName?: string;
  fyId?: string;
  fyLabel?: string;
}

export function createSessionToken(s: Session): string {
  // sessions read back from a verified JWT carry iat/exp claims; strip them
  // or jwt.sign refuses to apply expiresIn again
  const { iat, exp, nbf, ...payload } = s as Session & {
    iat?: number;
    exp?: number;
    nbf?: number;
  };
  void iat;
  void exp;
  void nbf;
  return jwt.sign(payload, SECRET, { expiresIn: "12h" });
}

export function setSessionCookie(s: Session) {
  cookies().set(COOKIE, createSessionToken(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export function getSession(): Session | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET) as Session;
  } catch {
    return null;
  }
}

/** Session with firm + FY selected — required for all business screens. */
export function requireSession(): Session & { firmId: string; fyId: string } {
  const s = getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  if (!s.firmId || !s.fyId) throw new Error("NO_FIRM_SELECTED");
  return s as Session & { firmId: string; fyId: string };
}

export function requireAuth(): Session {
  const s = getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}
