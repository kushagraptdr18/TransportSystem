import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import {
  BILLING_CONCEPTS,
  CHALAN_CONCEPTS,
  SLIP_P_CONCEPTS,
  type TallyConcept,
} from "@/lib/tally-map";
import { TallyMappingClient, type MapSection } from "@/components/settings/tally-mapping-client";

export const dynamic = "force-dynamic";

const concepts = (module: string, list: TallyConcept[]): MapSection["rows"] =>
  list.map((c) => ({
    module,
    sourceKey: c.key,
    label: c.label,
    hint: c.hint,
    fallback: c.fallback,
  }));

/** Settings → Tally Mapping: every software-side posting slot, module-wise,
 *  against the Tally ledger name the user types. One-time setup. */
export default async function TallyMappingPage() {
  const session = requireSession();

  const { heads, moneyParties, rows } = await withTenant(session.tenantId, async (tx) => {
    const [heads, moneyParties, rows] = await Promise.all([
      tx.accountHead.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH", "CARD"] } },
        orderBy: { name: "asc" },
      }),
      tx.tallyLedgerMap.findMany({ where: { firmId: session.firmId } }),
    ]);
    return { heads, moneyParties, rows };
  });

  const sections: MapSection[] = [
    {
      title: "📦 Chalan",
      desc: "Purchase component-wise + TDS alag journal + Commission-Mamool ek saath + Courier alag",
      rows: concepts("CHALAN", CHALAN_CONCEPTS),
    },
    {
      title: "📄 Billing",
      desc: "Sales mein pura bill amount ek saath; receipt mein TDS Receivable / Shortage alag lines",
      rows: concepts("BILLING", BILLING_CONCEPTS),
    },
    {
      title: "🚛 Broker Slip — Party Side",
      desc: "Owner side chalan wale hi ledgers use karta hai (upar wale)",
      rows: concepts("SLIP_P", SLIP_P_CONCEPTS),
    },
    {
      title: "⛽ Income / Expense Heads",
      desc: "Vehicle & office kharche aur chalan ke head-wale advances — sab yahi mapping use karte hain",
      rows: heads.map((h) => ({
        module: "HEAD",
        sourceKey: h.id,
        label: h.name,
        hint: h.kind === "INCOME" ? "Income head" : "Expense head",
        fallback: h.name.toUpperCase(),
      })),
    },
    {
      title: "🏦 Bank / Cash / Card",
      desc: "Tally mein in accounts ke exact naam (auto-create nahi hote — pakka naam bharo)",
      rows: moneyParties.map((p) => ({
        module: "BANKCASH",
        sourceKey: p.id,
        label: p.name,
        hint: p.ledgerGroup,
        fallback: p.name.toUpperCase(),
      })),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Tally Ledger Mapping</h1>
      <p className="text-sm text-muted-foreground">
        Har software head ke saamne Tally ka ledger naam likho — export usi mein entry banayega.
        Khaali chhoda toh software wala naam jayega aur Tally import par woh ledger apne aap ban
        jayega. Parties same naam se jati hain (alag naam chahiye toh Party Master mein
        &quot;Tally Name&quot; bharo).
      </p>
      <TallyMappingClient
        sections={sections}
        existing={rows.map((r) => ({ module: r.module, sourceKey: r.sourceKey, tallyName: r.tallyName }))}
      />
    </div>
  );
}
