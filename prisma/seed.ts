import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Seed runs as the superuser (bypasses RLS)
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

const STATES: [string, string][] = [
  ["JAMMU AND KASHMIR", "01"], ["HIMACHAL PRADESH", "02"], ["PUNJAB", "03"],
  ["CHANDIGARH", "04"], ["UTTARAKHAND", "05"], ["HARYANA", "06"],
  ["DELHI", "07"], ["RAJASTHAN", "08"], ["UTTAR PRADESH", "09"],
  ["BIHAR", "10"], ["SIKKIM", "11"], ["ARUNACHAL PRADESH", "12"],
  ["NAGALAND", "13"], ["MANIPUR", "14"], ["MIZORAM", "15"],
  ["TRIPURA", "16"], ["MEGHALAYA", "17"], ["ASSAM", "18"],
  ["WEST BENGAL", "19"], ["JHARKHAND", "20"], ["ODISHA", "21"],
  ["CHHATTISGARH", "22"], ["MADHYA PRADESH", "23"], ["GUJARAT", "24"],
  ["MAHARASHTRA", "27"], ["ANDHRA PRADESH", "28"], ["KARNATAKA", "29"],
  ["GOA", "30"], ["KERALA", "32"], ["TAMIL NADU", "33"],
  ["PUDUCHERRY", "34"], ["TELANGANA", "36"],
];

async function main() {
  await prisma.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Transport Co", slug: "demo" },
  });
  const t = tenant.id;

  const firm = await prisma.firm.upsert({
    where: { id: "seed-firm" },
    update: {},
    create: {
      id: "seed-firm",
      tenantId: t,
      name: "DEMO ROAD LINES",
      alias: "DRL",
      address1: "Transport Nagar, Raigarh (C.G.)",
      gstin: "22AAACD1234F1ZK",
      pan: "AAACD1234F",
      cgstPct: 6, sgstPct: 6, igstPct: 12,
      bankName: "HDFC BANK", bankAccount: "50200012345678",
      bankBranch: "RAIGARH", bankIfsc: "HDFC0001234",
      defaultTdsPct: 1,
    },
  });

  const fy = await prisma.financialYear.upsert({
    where: { firmId_label: { firmId: firm.id, label: "2026-2027" } },
    update: {},
    create: {
      tenantId: t, firmId: firm.id, label: "2026-2027",
      startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"),
    },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { tenantId_username: { tenantId: t, username: "admin" } },
    update: { passwordHash },
    create: { tenantId: t, name: "Administrator", username: "admin", passwordHash, role: "OWNER" },
  });
  const opHash = await bcrypt.hash("operator123", 10);
  await prisma.user.upsert({
    where: { tenantId_username: { tenantId: t, username: "operator" } },
    update: {},
    create: { tenantId: t, name: "Operator", username: "operator", passwordHash: opHash, role: "OPERATOR" },
  });

  // States + a few cities
  for (const [name, gstCode] of STATES) {
    await prisma.state.upsert({
      where: { tenantId_name: { tenantId: t, name } },
      update: { gstCode },
      create: { tenantId: t, name, gstCode },
    });
  }
  const cg = await prisma.state.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "CHHATTISGARH" } } });
  const mh = await prisma.state.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "MAHARASHTRA" } } });
  const od = await prisma.state.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "ODISHA" } } });
  const cities = [
    { name: "RAIGARH", stateId: cg.id, pincode: "496001" },
    { name: "RAIPUR", stateId: cg.id, pincode: "492001" },
    { name: "BILASPUR", stateId: cg.id, pincode: "495001" },
    { name: "MUMBAI", stateId: mh.id, pincode: "400001" },
    { name: "NAGPUR", stateId: mh.id, pincode: "440001" },
    { name: "CUTTACK", stateId: od.id, pincode: "753001" },
  ];
  for (const c of cities) {
    await prisma.city.upsert({
      where: { tenantId_name_stateId: { tenantId: t, name: c.name, stateId: c.stateId } },
      update: {},
      create: { tenantId: t, ...c },
    });
  }
  const raigarh = await prisma.city.findFirstOrThrow({ where: { tenantId: t, name: "RAIGARH" } });
  const raipur = await prisma.city.findFirstOrThrow({ where: { tenantId: t, name: "RAIPUR" } });

  // Parties
  const partyDefs = [
    { name: "CASH", ledgerGroup: "CASH" as const },
    { name: "HDFC BANK", ledgerGroup: "BANK" as const, bankName: "HDFC BANK", bankAccount: "50200012345678", bankIfsc: "HDFC0001234" },
    { name: "JINDAL STEEL LIMITED", ledgerGroup: "CONSIGNEE_CONSIGNOR" as const, gstin: "22AAACJ9096D1ZK", stateId: cg.id, cityId: raigarh.id, address1: "Industrial Area, Raigarh" },
    { name: "NALWA STEEL PVT LTD", ledgerGroup: "CONSIGNEE_CONSIGNOR" as const, gstin: "22AAACN1234E1ZL", stateId: cg.id, cityId: raipur.id, address1: "Urla, Raipur" },
    { name: "RAJESH KUMAR (BROKER)", ledgerGroup: "OWNER_BROKER" as const, pan: "BHOPK1422J", tdsMode: "TDS_APPLICABLE" as const },
    { name: "SAROJ TRAILOR SERVICE", ledgerGroup: "OWNER_BROKER" as const, pan: "AAACS9096D", tdsMode: "TDS_APPLICABLE" as const },
    { name: "DECLARED TRANSPORTS", ledgerGroup: "OWNER_BROKER" as const, pan: "AAACD5555A", tdsMode: "DECLARATION" as const },
    { name: "RAMESH DRIVER", ledgerGroup: "DRIVER" as const, mobile: "9876543210" },
    { name: "DEMO SUPPLIER", ledgerGroup: "SUPPLIERS" as const },
  ];
  for (const p of partyDefs) {
    await prisma.party.upsert({
      where: { tenantId_name_ledgerGroup: { tenantId: t, name: p.name, ledgerGroup: p.ledgerGroup } },
      update: {},
      create: { tenantId: t, ...p },
    });
  }
  const broker = await prisma.party.findFirstOrThrow({ where: { tenantId: t, name: "RAJESH KUMAR (BROKER)" } });
  const jindal = await prisma.party.findFirstOrThrow({ where: { tenantId: t, name: "JINDAL STEEL LIMITED" } });

  // Products
  const grpNames = ["TMT", "PLATE", "CHANNEL", "BEAM"];
  for (const g of grpNames) {
    await prisma.productGroup.upsert({
      where: { tenantId_name: { tenantId: t, name: g } },
      update: {},
      create: { tenantId: t, name: g },
    });
  }
  const tmt = await prisma.productGroup.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "TMT" } } });
  const plate = await prisma.productGroup.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "PLATE" } } });
  for (const p of [
    { name: "TMT BAR 12MM", groupId: tmt.id, unit: "MT", hsnCode: "7214", gstPct: 18 },
    { name: "MS PLATE", groupId: plate.id, unit: "MT", hsnCode: "7208", gstPct: 18 },
  ]) {
    await prisma.product.upsert({
      where: { tenantId_name: { tenantId: t, name: p.name } },
      update: {},
      create: { tenantId: t, ...p },
    });
  }
  for (const u of [{ name: "MT", value: 1 }, { name: "TON", value: 1 }, { name: "BUNDLE", value: 1 }]) {
    await prisma.unit.upsert({
      where: { tenantId_name: { tenantId: t, name: u.name } },
      update: {},
      create: { tenantId: t, ...u },
    });
  }

  // Vehicles
  for (const v of [
    { number: "CG13AZ8801", isOwn: true },
    { number: "CG13BA9018", isOwn: true },
    { number: "CG04JD3860", isOwn: false, ownerId: broker.id },
    { number: "OR15R2237", isOwn: false, ownerId: broker.id },
  ]) {
    await prisma.vehicle.upsert({
      where: { tenantId_number: { tenantId: t, number: v.number } },
      update: {},
      create: { tenantId: t, ...v },
    });
  }

  // Rate master sample
  const tmtProduct = await prisma.product.findUniqueOrThrow({ where: { tenantId_name: { tenantId: t, name: "TMT BAR 12MM" } } });
  const mumbai = await prisma.city.findFirstOrThrow({ where: { tenantId: t, name: "MUMBAI" } });
  await prisma.rateMaster.upsert({
    where: {
      tenantId_partyId_productId_sourceCityId_destCityId: {
        tenantId: t, partyId: jindal.id, productId: tmtProduct.id,
        sourceCityId: raigarh.id, destCityId: mumbai.id,
      },
    },
    update: {},
    create: {
      tenantId: t, partyId: jindal.id, productId: tmtProduct.id,
      sourceCityId: raigarh.id, destCityId: mumbai.id,
      rate: 1850, rateBasis: "CHARGE_WT", biltyCharge: 0,
    } as never,
  }).catch(async () => {
    await prisma.rateMaster.create({
      data: {
        tenantId: t, partyId: jindal.id, productId: tmtProduct.id,
        sourceCityId: raigarh.id, destCityId: mumbai.id,
        rate: 1850, rateBasis: "CHARGE_WT",
      },
    });
  });

  // Document types & job heads
  for (const d of ["INSURANCE", "FITNESS", "PERMIT", "PUC", "ROAD TAX"]) {
    await prisma.documentType.upsert({
      where: { tenantId_name: { tenantId: t, name: d } },
      update: {},
      create: { tenantId: t, name: d, showReminder: true },
    });
  }
  for (const j of ["FUEL & DIESEL", "TYRE", "SERVICE", "SPARE PARTS", "REPAIR"]) {
    await prisma.jobHead.upsert({
      where: { tenantId_name: { tenantId: t, name: j } },
      update: {},
      create: { tenantId: t, name: j, gstPct: 18 },
    });
  }
  for (const h of [
    { name: "DIESEL EXPENSE", kind: "EXPENSE" }, { name: "TOLL EXPENSE", kind: "EXPENSE" },
    { name: "FREIGHT INCOME", kind: "INCOME" }, { name: "COMMISSION INCOME", kind: "INCOME" },
  ]) {
    await prisma.accountHead.upsert({
      where: { tenantId_name: { tenantId: t, name: h.name } },
      update: {},
      create: { tenantId: t, ...h },
    });
  }

  console.log("Seed complete. Tenant:", tenant.slug, "Firm:", firm.name, "FY:", fy.label);
  console.log("Login: admin / admin123 (owner), operator / operator123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
