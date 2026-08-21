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

    // FY continuity: picking the (not yet created) NEXT financial year simply
    // creates it — 1 April to 31 March after the latest existing year. The
    // label is unique per firm, so a double-click cannot create two.
    if (fyId === "__next__") {
      const latest = await tx.financialYear.findFirst({
        where: { firmId },
        orderBy: { startDate: "desc" },
      });
      if (!latest) return null;
      const y = latest.startDate.getFullYear() + 1;
      const label = `${y}-${y + 1}`;
      const fy =
        (await tx.financialYear.findFirst({ where: { firmId, label } })) ??
        (await tx.financialYear.create({
          data: {
            tenantId: session.tenantId,
            firmId,
            label,
            startDate: new Date(y, 3, 1), // 1 April
            endDate: new Date(y + 1, 2, 31, 23, 59, 59), // 31 March
            isActive: true,
          },
        }));
      return { firm, fy };
    }

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
