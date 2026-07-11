"use server";

import { redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { getSession, setSessionCookie } from "@/lib/session";

export async function selectFirm(formData: FormData) {
  const session = getSession();
  if (!session) redirect("/login");

  const firmId = String(formData.get("firmId") ?? "");
  const fyId = String(formData.get("fyId") ?? "");
  if (!firmId || !fyId) redirect("/select-firm");

  const data = await withTenant(session.tenantId, async (tx) => {
    const firm = await tx.firm.findFirst({
      where: { id: firmId, tenantId: session.tenantId, isActive: true },
    });
    if (!firm) return null;

    // if user has explicit firm assignments, enforce them
    const assignments = await tx.userFirm.findMany({ where: { userId: session.userId } });
    if (assignments.length > 0 && !assignments.some((a) => a.firmId === firmId)) return null;

    const fy = await tx.financialYear.findFirst({
      where: { id: fyId, firmId, isActive: true },
    });
    if (!fy) return null;
    return { firm, fy };
  });

  if (!data) redirect("/select-firm");

  setSessionCookie({
    ...session,
    firmId: data.firm.id,
    firmName: data.firm.name,
    fyId: data.fy.id,
    fyLabel: data.fy.label,
  });
  redirect("/dashboard");
}
