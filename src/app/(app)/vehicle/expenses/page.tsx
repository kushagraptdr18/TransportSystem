import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveVehicleExpense, deleteVehicleExpense } from "./actions";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

export const dynamic = "force-dynamic";

const catLabel = (c: string) =>
  c.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

export default async function VehicleExpensesPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; vehicle?: string; category?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, vehicles } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.VehicleExpenseWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
    };
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.category) where.category = searchParams.category;
    if (searchParams.date_from || searchParams.date_to) {
      where.date = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [rows, vehicles] = await Promise.all([
      tx.vehicleExpense.findMany({ where, orderBy: { date: "desc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    ]);
    return { rows, vehicles };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const catOptions = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: catLabel(c) }));

  return (
    <DocModule
      title="Vehicle Expenses"
      newLabel="New Expense"
      exportName="vehicle-expenses"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveVehicleExpense}
      remove={deleteVehicleExpense}
      rows={rows.map((r) => ({
        id: r.id,
        date: formatDate(r.date),
        vehicleId: r.vehicleId,
        vehicleNumber: vehicleById.get(r.vehicleId) ?? "",
        category: r.category,
        categoryLabel: catLabel(r.category),
        amount: toNum(String(r.amount)),
        remarks: r.remarks ?? "",
      }))}
      columns={[
        { key: "date", header: "Date" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "categoryLabel", header: "Category", kind: "badge" },
        { key: "amount", header: "Amount", kind: "money" },
        { key: "remarks", header: "Remarks" },
      ]}
      filters={[
        { type: "daterange", key: "date", label: "Date" },
        {
          type: "combobox",
          key: "vehicle",
          label: "Vehicle",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        { type: "select", key: "category", label: "Category", options: catOptions },
      ]}
      fields={[
        { name: "date", label: "Date *", type: "date" },
        {
          name: "vehicleId",
          label: "Vehicle *",
          type: "combobox",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        { name: "category", label: "Category *", type: "select", options: catOptions },
        { name: "amount", label: "Amount *", type: "number" },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ date: formatDate(new Date()), category: "SERVICE", amount: 0 }}
      numericFields={["amount"]}
    />
  );
}
