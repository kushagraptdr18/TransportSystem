"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { withPlatform } from "@/lib/db";
import { setSessionCookie, type Session } from "@/lib/session";

export interface LoginState {
  error?: string;
  needTenant?: boolean;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const tenantSlug = String(formData.get("tenant") ?? "").trim();

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  const users = await withPlatform((tx) =>
    tx.user.findMany({
      where: {
        username,
        isActive: true,
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
      },
      include: { tenant: true },
    })
  );

  const candidates = users.filter((u) => u.tenant.isActive);

  if (candidates.length === 0) {
    return { error: "Invalid username or password.", needTenant: !!tenantSlug };
  }

  if (candidates.length > 1) {
    return {
      error: "This username exists in multiple companies. Please enter your company code.",
      needTenant: true,
    };
  }

  const user = candidates[0];
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid username or password.", needTenant: !!tenantSlug };
  }

  const session: Session = {
    userId: user.id,
    tenantId: user.tenantId,
    username: user.username,
    name: user.name,
    role: user.role,
  };
  setSessionCookie(session);
  redirect("/select-firm");
}
