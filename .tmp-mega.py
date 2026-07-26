# -*- coding: utf-8 -*-
import io


def rw(p):
    return io.open(p, encoding="utf8").read()


def wr(p, s):
    io.open(p, "w", encoding="utf8").write(s)


def sub(s, old, new, p=""):
    assert old in s, (p, old[:80])
    return s.replace(old, new)


# ---------- 1. LR: printFreight default No (create + copy) ----------
p = "src/app/(app)/lr/form-data.ts"
s = rw(p)
s = sub(s, "          printFreight: true,", "          printFreight: false,", p)
s = sub(s, '''      defaults.ewayBillNo = "";
      defaults.ewayExpiryText = "";''', '''      defaults.ewayBillNo = "";
      defaults.ewayExpiryText = "";
      defaults.printFreight = false; // every new LR defaults to not printing freight''', p)
wr(p, s)

# ---------- 2. LR form: lock number on edit + auto charge weight ----------
p = "src/components/lr/lr-form.tsx"
s = rw(p)
s = sub(s, '''          <Field label="LR No *">
            <Input {...register("lrNo")} className={inputCls} />
          </Field>''', '''          <Field label="LR No *">
            <Input
              {...register("lrNo")}
              className={inputCls}
              readOnly={props.mode === "edit"}
              title={props.mode === "edit" ? "LR number is locked after saving" : undefined}
            />
          </Field>''', p)
# charge weight mirrors actual weight until the user edits charge weight manually
s = sub(s, "  const freightTouched = React.useRef(props.mode === \"edit\");",
        '''  const freightTouched = React.useRef(props.mode === "edit");
  // rows where the user typed Charge Wt manually — stop mirroring Actual Wt there
  const chargeWtTouched = React.useRef<Set<number>>(
    new Set(props.mode === "edit" ? (props.defaults.items ?? []).map((_, i) => i) : [])
  );''', p)
s = sub(s, '''                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.actualWt`, { valueAsNumber: true })}
                    className={numCls}''', '''                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.actualWt`, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        if (!chargeWtTouched.current.has(index)) {
                          setValue(`items.${index}.chargeWt`, toNum(e.target.value));
                        }
                      },
                    })}
                    className={numCls}''', p)
s = sub(s, '''                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.chargeWt`, { valueAsNumber: true })}''', '''                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.chargeWt`, {
                      valueAsNumber: true,
                      onChange: () => chargeWtTouched.current.add(index),
                    })}''', p)
wr(p, s)

# ---------- 3. register: new columns + no dummy hrefs ----------
p = "src/app/(app)/lr/register/page.tsx"
s = rw(p)
s = sub(s, '''      lrType: lr.lrType,''', '''      lrType: lr.lrType,
      obdNo: lr.obdNo ?? "",
      invoiceNo: lr.invoiceNo ?? "",
      refNo: lr.refNo ?? "",
      rate: lr.items.length ? Math.max(...lr.items.map((i) => toNum(i.rate))) : 0,''', p)
wr(p, s)

p = "src/components/lr/lr-register-table.tsx"
s = rw(p)
s = sub(s, '''  lrType: string;
  status: string;
  isDummy: boolean;''', '''  lrType: string;
  status: string;
  isDummy: boolean;
  obdNo: string;
  invoiceNo: string;
  refNo: string;
  rate: number;''', p)
s = sub(s, '''      { accessorKey: "vehicle", header: "Vehicle" },''', '''      { accessorKey: "vehicle", header: "Vehicle" },
      { accessorKey: "obdNo", header: "OBD No" },
      { accessorKey: "invoiceNo", header: "Invoice No" },
      { accessorKey: "refNo", header: "Ref No" },
      {
        accessorKey: "rate",
        header: "Rate",
        cell: ({ row }) => (row.original.rate ? formatMoney(row.original.rate) : ""),
        meta: { numeric: true } as DataTableColumnMeta<LrRegisterRow>,
      },''', p)
s = sub(s, '''    { header: "Vehicle", key: "vehicle" },''', '''    { header: "Vehicle", key: "vehicle" },
    { header: "OBD No", key: "obdNo" },
    { header: "Invoice No", key: "invoiceNo" },
    { header: "Ref No", key: "refNo" },
    { header: "Rate", key: "rate", numeric: true },''', p)
s = sub(s, "          const editHref = lr.isDummy ? `/lr/dummy?id=${lr.id}` : `/lr?id=${lr.id}`;",
        "          const editHref = `/lr?id=${lr.id}`;", p)
s = sub(s, "                  href={lr.isDummy ? `/lr/dummy?copy=${lr.id}` : `/lr?copy=${lr.id}`}",
        "                  href={`/lr?copy=${lr.id}`}", p)
wr(p, s)

# ---------- 4. nav: drop Dummy LR + Job Heads, add Bank & Cash Heads ----------
p = "src/components/app/nav-config.ts"
s = rw(p)
s = sub(s, '      { label: "Dummy LR", href: "/lr/dummy" },\n', "", p)
s = sub(s, '      { label: "Job Heads", href: "/masters/job-heads" },\n', "", p)
s = sub(s, '      { label: "Ledger / Parties", href: "/masters/parties" },',
        '''      { label: "Ledger / Parties", href: "/masters/parties" },
      { label: "Bank & Cash Heads", href: "/masters/bank-cash-heads" },''', p)
wr(p, s)

# ---------- 5. products: productType ----------
p = "src/app/(app)/masters/products/actions.ts"
s = rw(p)
s = sub(s, "  hsnCode: optStr,", '''  hsnCode: optStr,
  productType: z.enum(["NORMAL", "ODC"]).default("NORMAL"),''', p)
s = sub(s, "        hsnCode: data.hsnCode,", '''        hsnCode: data.hsnCode,
        productType: data.productType,''', p)
wr(p, s)

p = "src/components/masters/products-client.tsx"
s = rw(p)
s = sub(s, '  hsnCode: string | null;', '''  hsnCode: string | null;
  productType: string;''', p)
s = sub(s, '  { accessorKey: "hsnCode", header: "HSN" },', '''  { accessorKey: "hsnCode", header: "HSN" },
  {
    accessorKey: "productType",
    header: "Type",
    cell: ({ row }) =>
      row.original.productType === "ODC" ? (
        <Badge variant="destructive">ODC</Badge>
      ) : (
        <Badge variant="secondary">Normal</Badge>
      ),
  },''', p)
s = sub(s, '        { name: "hsnCode", label: "HSN Code", type: "text" },', '''        { name: "hsnCode", label: "HSN Code", type: "text" },
        {
          name: "productType",
          label: "Product Type",
          type: "radio",
          options: [
            { value: "NORMAL", label: "Normal" },
            { value: "ODC", label: "ODC (Over-Dimensional Cargo)" },
          ],
        },''', p)
wr(p, s)

# ---------- 6. document master: reminderDays ----------
p = "src/app/(app)/masters/document-master/actions.ts"
s = rw(p)
s = sub(s, "  showReminder: z.boolean().default(true),", '''  showReminder: z.boolean().default(true),
  reminderDays: z.coerce.number().int().min(1).max(365).default(30),''', p)
s = sub(s, "        showReminder: data.showReminder,", '''        showReminder: data.showReminder,
        reminderDays: data.reminderDays,''', p)
wr(p, s)

p = "src/components/masters/document-master-client.tsx"
s = rw(p)
s = sub(s, "  showReminder: boolean;", '''  showReminder: boolean;
  reminderDays: number;''', p)
s = sub(s, '        { name: "showReminder", label: "Show Expiry Reminder", type: "switch" },',
        '''        { name: "showReminder", label: "Show Expiry Reminder", type: "switch" },
        {
          name: "reminderDays",
          label: "Remind Before Expiry (days) — e.g. 15 / 30 / 45 / 60 / 90 or custom",
          type: "number",
        },''', p)
s = sub(s, '      defaults={{ name: "", description: "", showReminder: true }}',
        '      defaults={{ name: "", description: "", showReminder: true, reminderDays: 30 }}', p)
wr(p, s)

# ---------- 7. dashboard: per-type reminder window ----------
p = "src/app/(app)/dashboard/page.tsx"
s = rw(p)
s = sub(s, '''      tx.vehicleDocument.findMany({
        where: {
          tenantId: session.tenantId,
          expiryDate: { not: null, lte: addDays(today, 30) },
          docType: { showReminder: true },
        },
        include: { docType: true },
        orderBy: { expiryDate: "asc" },
        take: 15,
      }),''', '''      tx.vehicleDocument
        .findMany({
          where: {
            tenantId: session.tenantId,
            expiryDate: { not: null, lte: addDays(today, 365) },
            docType: { showReminder: true },
          },
          include: { docType: true },
          orderBy: { expiryDate: "asc" },
          take: 100,
        })
        .then((docs) =>
          docs
            .filter(
              (d) =>
                d.expiryDate !== null &&
                d.expiryDate <= addDays(today, d.docType.reminderDays ?? 30)
            )
            .slice(0, 15)
        ),''', p)
wr(p, s)

# ---------- 8. party master: transportName + hide groups + validations ----------
p = "src/app/(app)/masters/parties/actions.ts"
s = rw(p)
s = sub(s, "  vendorCode: optStr,", '''  vendorCode: optStr,
  transportName: optStr,''', p)
s = sub(s, "        vendorCode: data.vendorCode,", '''        vendorCode: data.vendorCode,
        transportName: data.ledgerGroup === "OWNER_BROKER" ? data.transportName : null,''', p)
s = sub(s, '''export async function saveParty(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;''', '''const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MOBILE_RE = /^[6-9][0-9]{9}$/;
const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export async function saveParty(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  if (data.gstin && !GSTIN_RE.test(data.gstin.toUpperCase()))
    return { ok: false, error: "Invalid GSTIN format (e.g. 22AAACD1234F1ZK)." };
  if (data.pan && !PAN_RE.test(data.pan.toUpperCase()))
    return { ok: false, error: "Invalid PAN format (e.g. AAACD1234F)." };
  if (data.mobile && !MOBILE_RE.test(data.mobile.replace(/\\D/g, "")))
    return { ok: false, error: "Mobile must be a valid 10-digit Indian number." };
  if (data.email && !EMAIL_RE.test(data.email))
    return { ok: false, error: "Invalid email address." };''', p)
wr(p, s)

p = "src/components/masters/parties-client.tsx"
s = rw(p)
s = sub(s, '''const GROUPS = [
  "BANK",
  "CASH",
  "CONSIGNEE_CONSIGNOR",
  "DRIVER",
  "EXPENSE",
  "INCOME",
  "OFFICE",
  "OWNER_BROKER",
  "STAFF",
  "SUPPLIERS",
];''', '''// INCOME / OFFICE / EXPENSE removed from party master (managed elsewhere);
// old records with those groups still display correctly.
const GROUPS = [
  "BANK",
  "CASH",
  "CONSIGNEE_CONSIGNOR",
  "DRIVER",
  "OWNER_BROKER",
  "STAFF",
  "SUPPLIERS",
];''', p)
s = sub(s, '''  ownerName: string | null;''', '''  ownerName: string | null;
  transportName: string | null;''', p)
s = sub(s, '''        { name: "ownerName", label: "Owner / Contact Person", type: "text" },''', '''        { name: "ownerName", label: "Owner / Contact Person", type: "text" },
        {
          name: "transportName",
          label: "Transport Name (owners / brokers)",
          type: "text",
          uppercase: true,
          visibleIf: (f: FormState) => f.ledgerGroup === "OWNER_BROKER",
          span2: true,
        },''', p)
wr(p, s)

p = "src/app/(app)/masters/parties/page.tsx"
s = rw(p)
s = sub(s, "        ownerName: r.ownerName,", '''        ownerName: r.ownerName,
        transportName: r.transportName,''', p)
wr(p, s)

# ---------- 9. chalan: TDS locked when declaration ----------
p = "src/app/(app)/chalan/chalan-form.tsx"
s = rw(p)
s = sub(s, '''              <NumInput
                value={tdsPct}
                onChange={(n) => {
                  setTdsPct(n);
                  setTdsOverridden(true);
                }}
                className="w-20"
              />''', '''              <NumInput
                value={brokerTds?.tdsMode === "DECLARATION" ? 0 : tdsPct}
                onChange={(n) => {
                  setTdsPct(n);
                  setTdsOverridden(true);
                }}
                readOnly={brokerTds?.tdsMode === "DECLARATION"}
                className="w-20"
              />
              {brokerTds?.tdsMode === "DECLARATION" && (
                <Badge variant="default">Declared — TDS not applicable</Badge>
              )}''', p)
wr(p, s)

print("mega patch done")
